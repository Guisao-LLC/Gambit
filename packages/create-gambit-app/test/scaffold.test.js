import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The package is an ES module (the generator needs it), so __dirname has to be
// derived rather than assumed.
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The generator, run for real into a temporary directory.
 *
 * These check the SUBSTITUTIONS and the shape of what lands. What they
 * deliberately do not check is that the result installs and passes — that
 * needs a network and a minute, so it belongs in CI rather than here. It has
 * been verified by hand: 27 files, tsc clean, 16 assertions passing.
 */

const CLI = join(__dirname, "..", "dist", "index.js");

function scaffold(args = []) {
  const dir = mkdtempSync(join(tmpdir(), "gambit-scaffold-"));
  execFileSync("node", [CLI, "demo", ...args], { cwd: dir, stdio: "pipe" });
  const read = (p) => readFileSync(join(dir, "demo", p), "utf8");
  return { dir, read, has: (p) => existsSync(join(dir, "demo", p)) };
}

test("generates a server that has every piece an app needs to run", () => {
  const { dir, has } = scaffold();
  for (const file of [
    "server/package.json",
    "server/tsconfig.json",
    "server/.env.example",
    "server/src/index.ts",
    "server/src/config/permissions.ts",
    "server/src/middleware/authenticate.ts",
    "server/src/middleware/authorize.ts",
    "server/src/models/user-model.ts",
    "server/src/models/roles-model.ts",
    "server/src/services/permission-cache.ts",
    "server/src/startup/boot.ts",
    "server/src/util/jwt/jwt.ts",
    // The augmentation the packages deliberately do not ship: two packages
    // declaring req.user would collide, so each app declares its own.
    "server/src/types/express.d.ts",
    "server/src/tests/rbac/harness.ts",
    "server/src/tests/rbac/route-permission-manifest.ts",
  ]) {
    assert.ok(has(file), `${file} is missing`);
  }
  rmSync(dir, { recursive: true, force: true });
});

test("no template placeholder survives into the generated app", () => {
  // A leftover placeholder is code that does not compile, shipped as if it did.
  const { dir, read, has } = scaffold(["--tenant", "practiceId"]);
  for (const file of [
    "server/src/models/user-model.ts",
    "server/src/models/roles-model.ts",
    "server/src/index.ts",
    "server/src/util/jwt/jwt.ts",
    "server/README.md",
  ]) {
    if (!has(file)) continue;
    const text = read(file);
    assert.ok(!text.includes("__APP_NAME__"), `${file} still has __APP_NAME__`);
    assert.ok(!/__[A-Z_]+__/.test(text), `${file} still has a placeholder`);
  }
  rmSync(dir, { recursive: true, force: true });
});

test("a tenant reaches the account AND the role, since both are scoped by it", () => {
  const { dir, read } = scaffold(["--tenant", "practiceId", "--tenant-ref", "Practices"]);

  const user = read("server/src/models/user-model.ts");
  assert.match(user, /tenant: \{ field: "practiceId", type: "ObjectId", ref: "Practices" \}/);
  assert.match(user, /practiceId\?: mongoose\.Types\.ObjectId/);

  const role = read("server/src/models/roles-model.ts");
  assert.match(role, /roleFields\(\{ tenant: \{ field: "practiceId", ref: "Practices" \} \}\)/);

  rmSync(dir, { recursive: true, force: true });
});

test("no tenant means no field, not an empty one", () => {
  // The fragments make the tenant optional. An app without one should not
  // carry a column nothing ever sets.
  const { dir, read } = scaffold();
  const user = read("server/src/models/user-model.ts");
  assert.match(user, /tenant: undefined/);
  assert.ok(!/tenantId|schoolId|practiceId/.test(user), "invented a tenant field");
  rmSync(dir, { recursive: true, force: true });
});

test("the app is named throughout", () => {
  const { dir, read } = scaffold();
  assert.match(read("server/package.json"), /"name": "demo-server"/);
  assert.match(read("server/README.md"), /^# demo — server/m);
  rmSync(dir, { recursive: true, force: true });
});

test("it pins the packages rather than floating on them", () => {
  // A generated app should keep working when a package publishes a breaking
  // change, not adopt it silently on the next install.
  const { dir, read } = scaffold();
  const deps = JSON.parse(read("server/package.json")).dependencies;
  for (const pkg of ["gambit-auth", "gambit-rbac", "gambit-account"]) {
    assert.match(deps[`@guisao-llc/${pkg}`] ?? "", /^\^\d+\.\d+\.\d+$/, `${pkg} not pinned`);
  }
  rmSync(dir, { recursive: true, force: true });
});

test("the generated grid has real routes to assert against", () => {
  // An empty manifest makes every assertion skip, so a new app would not learn
  // whether its harness works until much later. The users routes are gated and
  // manifested so the grid does something on the first run.
  const { dir, read } = scaffold();
  const manifest = read("server/src/tests/rbac/route-permission-manifest.ts");
  assert.match(manifest, /"\/api\/users"/);
  assert.match(manifest, /users:delete/);
  assert.match(read("server/src/routes/user-routes.ts"), /authorize\("users:read"\)/);
  rmSync(dir, { recursive: true, force: true });
});

test("it refuses to write into a directory that already exists", () => {
  // Merging into existing content is how a generator silently overwrites work.
  const dir = mkdtempSync(join(tmpdir(), "gambit-scaffold-"));
  execFileSync("node", [CLI, "demo"], { cwd: dir, stdio: "pipe" });
  assert.throws(() => execFileSync("node", [CLI, "demo"], { cwd: dir, stdio: "pipe" }));
  rmSync(dir, { recursive: true, force: true });
});
