#!/usr/bin/env node
/**
 * Publish every workspace package whose current version is not on the registry.
 *
 *   node scripts/publish-all.mjs <otp>      publish
 *   node scripts/publish-all.mjs            dry run — show what WOULD publish
 *
 * Three things it does that `npm publish` in a loop does not:
 *
 *   1. SKIPS what is already published. Re-running is safe and quiet, instead
 *      of failing with "cannot publish over the previously published version"
 *      on everything that succeeded last time.
 *
 *   2. Publishes in DEPENDENCY ORDER, computed from the packages' own
 *      dependencies. gambit-rbac depends on gambit-cascade, so cascade goes
 *      first — otherwise the registry briefly holds a package whose dependency
 *      does not exist, and anyone installing in that window gets a broken tree.
 *
 *   3. STOPS at the first failure. Continuing would publish a package whose
 *      dependency just failed to go out.
 *
 * The OTP is passed straight through to npm and never stored.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const otp = process.argv[2];
const dryRun = !otp;

const packagesDir = join(root, "packages");
const packages = readdirSync(packagesDir)
  .map((name) => join(packagesDir, name))
  .filter((dir) => existsSync(join(dir, "package.json")))
  .map((dir) => ({ dir, manifest: JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) }));

const byName = new Map(packages.map((p) => [p.manifest.name, p]));

/** Depth-first topological sort over the packages' own inter-dependencies. */
function inDependencyOrder(list) {
  const ordered = [];
  const state = new Map(); // name -> "visiting" | "done"

  const visit = (pkg) => {
    const name = pkg.manifest.name;
    if (state.get(name) === "done") return;
    if (state.get(name) === "visiting") {
      throw new Error(`Dependency cycle involving ${name}`);
    }
    state.set(name, "visiting");
    const deps = { ...pkg.manifest.dependencies, ...pkg.manifest.peerDependencies };
    for (const dep of Object.keys(deps)) {
      const local = byName.get(dep);
      if (local) visit(local);
    }
    state.set(name, "done");
    ordered.push(pkg);
  };

  for (const pkg of list) visit(pkg);
  return ordered;
}

/** Is this exact version already on the registry? */
function isPublished({ name, version }) {
  try {
    execSync(`npm view ${name}@${version} version`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const ordered = inDependencyOrder(packages);
const pending = [];

console.log(`\n${ordered.length} package(s), in dependency order:\n`);
for (const pkg of ordered) {
  const { name, version } = pkg.manifest;
  const published = isPublished(pkg.manifest);
  console.log(`  ${published ? "· already published" : "→ WILL PUBLISH   "}  ${name}@${version}`);
  if (!published) pending.push(pkg);
}

if (!pending.length) {
  console.log("\nNothing to do — every version is already on the registry.\n");
  process.exit(0);
}

if (dryRun) {
  console.log(
    `\n${pending.length} package(s) would publish. Re-run with an OTP from your` +
      ` authenticator:\n\n  node scripts/publish-all.mjs 123456\n`,
  );
  process.exit(0);
}

console.log("");
for (const pkg of pending) {
  const { name, version } = pkg.manifest;
  process.stdout.write(`publishing ${name}@${version} ... `);
  try {
    execFileSync(
      "npm",
      ["publish", "--workspace", name, `--otp=${otp}`],
      { cwd: root, stdio: "pipe", shell: process.platform === "win32" },
    );
    console.log("ok");
  } catch (err) {
    console.log("FAILED\n");
    console.error(String(err.stdout ?? "") + String(err.stderr ?? ""));
    console.error(
      `\nStopped at ${name}. Nothing after it was published — anything later` +
        ` depends on this, and a package whose dependency is missing is worse` +
        ` than one that is late.\n` +
        `If the code expired, just run it again with a fresh one; whatever` +
        ` already succeeded will be skipped.\n`,
    );
    process.exit(1);
  }
}

console.log(`\nDone — ${pending.length} package(s) published.\n`);
