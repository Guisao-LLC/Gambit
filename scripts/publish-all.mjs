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

/**
 * Accept `123456` or `--otp=123456`, and reject anything else BEFORE building.
 *
 * The first version took a bare argument and passed whatever it got straight to
 * npm. A mistyped `--opt=` therefore ran a full build, the whole test suite and
 * the secrets scan, and only then got rejected by the registry for not being
 * digits. Validating here turns a two-minute round trip into an instant one.
 */
const raw = process.argv[2];

/**
 * Browser auth instead of an authenticator code.
 *
 * npm can authenticate a publish through the browser — it prints a URL, waits,
 * and completes once you have signed in. But it can only do that when it OWNS
 * the terminal. The first version of this script captured npm's output with
 * `stdio: "pipe"` to build a tidy one-line-per-package log, which silently
 * removed that option and left an authenticator code as the only way through.
 *
 * So `--web` hands the terminal over. The output is noisier, because it is
 * npm's rather than ours, and that is the trade.
 */
const web = raw === "--web";
const otp = !web && raw?.startsWith("--otp=") ? raw.slice("--otp=".length) : web ? undefined : raw;
const dryRun = !web && !otp;

if (!web && otp !== undefined && !/^\d{6,}$/.test(otp)) {
  console.error(
    `\n"${raw}" is not a one-time password.\n\n` +
      `  node scripts/publish-all.mjs --web       authenticate in the browser\n` +
      `  node scripts/publish-all.mjs 123456      a code from an authenticator app\n` +
      `  node scripts/publish-all.mjs             show what would publish\n\n` +
      `Use --web if your npm 2FA is a passkey — a passkey produces no code to type.\n`,
  );
  process.exit(1);
}

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

/**
 * Is this exact version already on the registry?
 *
 * Asks the VERSION endpoint directly rather than going through `npm view`.
 * Two reasons, both learned the hard way:
 *
 *   `npm view` reads the package DOCUMENT, which is CDN-cached and rebuilt
 *   asynchronously after a publish. Immediately after a successful publish the
 *   version endpoint returns 200 while the document still 404s — so `npm view`
 *   reports a package as missing that is already live, and the script offers to
 *   publish something the registry will then refuse.
 *
 *   `npm view` also consults the local cache, so a 404 fetched before a publish
 *   can outlive the publish itself.
 */
async function isPublished({ name, version }) {
  const url = `https://registry.npmjs.org/${name.replace("/", "%2f")}/${version}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "gambit-publish" } });
    return res.status === 200;
  } catch {
    // Offline or the registry is unreachable — treat as not-published so the
    // publish is attempted and fails loudly, rather than silently skipped.
    return false;
  }
}

/**
 * Are we logged in? Checked BEFORE anything is built.
 *
 * npm answers a publish from an unauthenticated session with
 * "404 Not Found — '<pkg>@<version>' is not in this registry", which is its
 * least helpful possible phrasing: it returns 404 rather than 401 so it does
 * not leak whether a private package exists, and the message points at the
 * package rather than at the credential. Read literally, it sends you looking
 * for a publishing bug that is not there.
 *
 * It costs one request, and it turns that into one sentence.
 */
function whoami() {
  try {
    return execSync("npm whoami", { stdio: "pipe" }).toString().trim();
  } catch {
    return null;
  }
}

const ordered = inDependencyOrder(packages);
const pending = [];

console.log(`\n${ordered.length} package(s), in dependency order:\n`);
for (const pkg of ordered) {
  const { name, version } = pkg.manifest;
  const published = await isPublished(pkg.manifest);
  console.log(`  ${published ? "· already published" : "→ WILL PUBLISH   "}  ${name}@${version}`);
  if (!published) pending.push(pkg);
}

if (!pending.length) {
  console.log("\nNothing to do — every version is already on the registry.\n");
  process.exit(0);
}

if (dryRun) {
  console.log(
    `\n${pending.length} package(s) would publish. Re-run one of these:\n\n` +
      `  node scripts/publish-all.mjs --web       authenticate in the browser\n` +
      `  node scripts/publish-all.mjs 123456      a code from an authenticator app\n\n` +
      `Use --web if your npm 2FA is a passkey — a passkey produces no code to type.\n`,
  );
  process.exit(0);
}

const user = whoami();
if (!user) {
  console.error(
    `\nNot logged in to npm — nothing was built.\n\n` +
      `  npm login\n\n` +
      `Then run this again. If you were logged in yesterday: npm invalidates CLI\n` +
      `tokens when the account's 2FA settings change, so touching a passkey or\n` +
      `authenticator logs the terminal out.\n\n` +
      `Without this check npm answers the publish itself with "404 Not Found —\n` +
      `'<package>' is not in this registry", which reads like a problem with the\n` +
      `package and is not.\n`,
  );
  process.exit(1);
}
console.log(`\nlogged in as ${user}`);

if (web) {
  console.log(
    "\nnpm will print a URL for each package and wait while you authenticate.\n" +
      "Open it, approve, and it continues on its own.\n",
  );
}

console.log("");
for (const pkg of pending) {
  const { name, version } = pkg.manifest;
  // In web mode npm owns the terminal, so it prints its own progress and a
  // "publishing ..." prefix from us would just land mid-stream.
  if (!web) process.stdout.write(`publishing ${name}@${version} ... `);
  else console.log(`── ${name}@${version} ──`);

  try {
    execFileSync(
      "npm",
      ["publish", "--workspace", name, ...(otp ? [`--otp=${otp}`] : [])],
      {
        cwd: root,
        // inherit lets npm prompt and open a browser; pipe keeps our log tidy.
        stdio: web ? "inherit" : "pipe",
        shell: process.platform === "win32",
      },
    );
    console.log(web ? `✓ ${name}@${version} published` : "ok");
  } catch (err) {
    /**
     * npm can report a failure for a publish that WORKED.
     *
     * In the browser-auth flow it uploads, gets a 401 asking for the second
     * factor, waits for you to approve, then retries the same upload — which
     * the registry rejects with "you cannot publish over the previously
     * published versions". The first attempt had already landed. Reading that
     * as a failure sent someone hunting for a package that was published the
     * whole time.
     *
     * So ask the registry rather than trusting the exit code. It is the only
     * authority on whether the version exists, and it costs one request on a
     * path that has already failed once.
     */
    if (await isPublished(pkg.manifest)) {
      console.log(
        web
          ? `✓ ${name}@${version} published (npm reported an error for a retry of its own upload)`
          : "ok (npm reported an error for a retry of its own upload)",
      );
      continue;
    }

    console.log(web ? `\n✗ ${name}@${version} failed` : "FAILED\n");
    if (!web) console.error(String(err.stdout ?? "") + String(err.stderr ?? ""));
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
