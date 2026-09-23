#!/usr/bin/env node
/**
 * Writes `dist/esm/package.json` — `{"type": "module"}`, and nothing else.
 *
 * Three lines of JSON, but without them the whole ESM build is dead on arrival.
 * A package with no top-level `"type"` is CommonJS, and that verdict applies to
 * every .js file beneath it — so Node would read `dist/esm/index.js`, meet an
 * `import` statement, and throw `Cannot use import statement outside a module`.
 * `"type"` is resolved from the NEAREST package.json, so one dropped inside
 * dist/esm re-scopes that directory and leaves dist/ (the CommonJS half)
 * exactly as it was.
 *
 * Generated rather than committed because dist/ is gitignored: a file checked
 * in there would be the only surviving member of a directory the build owns.
 *
 * Run from a package directory; `build` does this automatically.
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "dist", "esm");
if (!existsSync(dir)) {
  console.error(`✗ ${dir} does not exist — did the ESM build run?`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }, null, 2) + "\n");
console.log(`✓ dist/esm/package.json — this directory is ES modules`);
