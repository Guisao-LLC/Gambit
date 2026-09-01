#!/usr/bin/env node
/**
 * The last gate before something becomes permanent.
 *
 * npm restricts unpublishing after 72 hours, so a secret or a customer's email
 * address that reaches the registry is public forever. This project has direct
 * precedent: a hardcoded personal email address sat in the email service and
 * had to be stripped precisely because a shared package must not ship anybody's
 * inbox. That was caught by hand. This catches the next one.
 *
 * Scans the files that will actually be PUBLISHED — the built dist/ plus the
 * package manifest — not src/. Those are different sets: `files` controls what
 * ships, and a comment stripped from source can still sit in a stale dist.
 *
 * Run from a package directory (prepublishOnly does this automatically):
 *   node ../../scripts/prepublish-check.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const pkgDir = process.cwd();
const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

/** Things that must never reach a public registry. */
const FORBIDDEN = [
  {
    name: "email address",
    // Deliberately not matching example.com / example.org — those are reserved
    // for documentation and are the correct thing to use in a doc comment.
    re: /[a-z0-9._%+-]+@(?!example\.(?:com|org|net))[a-z0-9.-]+\.[a-z]{2,}/gi,
  },
  { name: "private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "assigned secret literal", re: /\b(?:secret|password|passwd|token|api[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/gi },
  { name: "connection string with credentials", re: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s"']*:[^\s"'@]+@/gi },
];

/**
 * App vocabulary. A Gambit package naming one of these is not a leak, but it is
 * a design failure — the package is supposed to be app-agnostic, and shipping
 * it publicly makes that claim to strangers.
 */
const APP_VOCABULARY = [
  /\bTime2Drive\b/gi,
  /\bKimorah\b/gi,
  /\bGoBoost\b/gi,
  /\bdriving[- ]school\b/gi,
];

function filesToPublish() {
  const patterns = manifest.files ?? ["dist"];
  const out = [join(pkgDir, "package.json")];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if ([".js", ".ts", ".json", ".mjs", ".cjs", ".map"].includes(extname(full))) out.push(full);
    }
  };
  for (const p of patterns) walk(join(pkgDir, p));
  return out;
}

const files = filesToPublish();
if (files.length <= 1) {
  console.error(`✗ ${manifest.name}: nothing to publish — did the build run?`);
  process.exit(1);
}

const findings = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const rel = file.slice(pkgDir.length + 1);
  for (const { name, re } of FORBIDDEN) {
    for (const m of text.matchAll(re)) {
      findings.push({ level: "SECRET", rel, name, sample: m[0].slice(0, 48) });
    }
  }
  for (const re of APP_VOCABULARY) {
    for (const m of text.matchAll(re)) {
      findings.push({ level: "APP", rel, name: "app vocabulary", sample: m[0] });
    }
  }
}

if (findings.length) {
  console.error(`\n✗ ${manifest.name}@${manifest.version} is NOT safe to publish:\n`);
  for (const f of findings) {
    console.error(`  [${f.level}] ${f.rel} — ${f.name}: ${f.sample}`);
  }
  console.error(
    "\nPublishing is permanent after 72 hours. Fix these, rebuild, and try again.\n",
  );
  process.exit(1);
}

console.log(
  `✓ ${manifest.name}@${manifest.version} — ${files.length} files scanned, nothing forbidden.`,
);
