/** Runs against dist/ — what a consumer actually installs. */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  configurePermissionCache,
  refreshCache,
  hasPermission,
  hasAnyPermission,
  listRoleNamesWithPermission,
  getCachedRole,
  getPermissions,
  _seedCacheForTesting,
  _resetForTesting,
  createAuthorize,
  createRequirePlatformAdmin,
  can,
  canAny,
  roleFields,
  permissionFields,
  PERMISSION_ACTIONS,
  buildRoleDeletion,
  buildPermissionDeletion,
} = require("../dist/index.js");

/** Drive a middleware and resolve with whatever it passed to next(). */
const run = (handler, req) => new Promise((r) => handler(req, {}, r));
const withAuth = (extra = {}) => ({ headers: { authorization: "Bearer x" }, ...extra });

test.beforeEach(() => _resetForTesting());

// ── cache ────────────────────────────────────────────────────────────────────

test("refreshCache loads through the injected loader, not a model", async () => {
  configurePermissionCache({
    loadRoles: async () => [
      { name: "Admin", permissions: ["a:read", "a:write"], bypassFeatureChecks: true },
      { name: "Clerk", permissions: ["a:read"] },
    ],
  });
  await refreshCache();

  assert.ok(hasPermission("Admin", "a:write"));
  assert.ok(!hasPermission("Clerk", "a:write"));
  assert.equal(getCachedRole("Admin").bypassFeatureChecks, true);
  // Absent in the source data — must default to false, not undefined.
  assert.equal(getCachedRole("Clerk").bypassFeatureChecks, false);
});

test("refreshCache fails loudly when nobody configured a loader", async () => {
  // Silence here would leave the cache empty and every request denied, with no
  // indication why.
  await assert.rejects(() => refreshCache(), /configurePermissionCache/);
});

test("an unknown role answers false rather than throwing", () => {
  _seedCacheForTesting({ Admin: ["a:read"] });
  assert.equal(hasPermission("Ghost", "a:read"), false);
  assert.equal(hasAnyPermission("Ghost", ["a:read"]), false);
  assert.deepEqual([...getPermissions("Ghost")], []);
});

test("listRoleNamesWithPermission is lenient about junk and never mutates", () => {
  _seedCacheForTesting({ Admin: ["a:read"], Clerk: ["a:read"], Other: ["b:read"] });
  assert.deepEqual(listRoleNamesWithPermission("a:read").sort(), ["Admin", "Clerk"]);
  for (const junk of ["", "   ", null, undefined, 42]) {
    assert.deepEqual(listRoleNamesWithPermission(junk), []);
  }
  assert.ok(hasPermission("Admin", "a:read"), "cache survived the junk queries");
});

test("_seedCacheForTesting CLEARS first — seed every role in one call", () => {
  _seedCacheForTesting({ Admin: ["a:read"] });
  _seedCacheForTesting({ Clerk: ["b:read"] });
  assert.equal(hasPermission("Admin", "a:read"), false, "Admin should be gone");
  assert.ok(hasPermission("Clerk", "b:read"));
});

test("can / canAny tolerate an undefined role", () => {
  _seedCacheForTesting({ Admin: ["a:read"] });
  assert.equal(can(undefined, "a:read"), false);
  assert.equal(canAny(undefined, ["a:read"]), false);
  assert.ok(can("Admin", "a:read"));
  assert.ok(canAny("Admin", ["nope", "a:read"]));
});

// ── authorize ────────────────────────────────────────────────────────────────

const claimsFor = (roles) => async () => ({ roles });

test("authorize allows the exact permission and denies without it", async () => {
  _seedCacheForTesting({ Admin: ["a:write"], Clerk: ["b:write"] });
  const { authorize } = createAuthorize({ verifyToken: claimsFor("Admin") });
  assert.equal(await run(authorize("a:write"), withAuth()), undefined);

  const { authorize: asClerk } = createAuthorize({ verifyToken: claimsFor("Clerk") });
  assert.equal((await run(asClerk("a:write"), withAuth())).code, 403);
});

test("no Authorization header is a 401, and never reaches the verifier", async () => {
  let called = false;
  const { authorize } = createAuthorize({
    verifyToken: async () => {
      called = true;
      return { roles: "Admin" };
    },
  });
  assert.equal((await run(authorize("a:read"), { headers: {} })).code, 401);
  assert.equal(called, false);
});

test("a role-less token is 403, not 401 — authenticated but unassigned", async () => {
  const { authorize } = createAuthorize({ verifyToken: async () => ({}) });
  const err = await run(authorize("a:read"), withAuth());
  assert.equal(err.code, 403);
  assert.match(err.message, /No role assigned/);
});

test("group access is OFF by default — a package must not widen access silently", async () => {
  _seedCacheForTesting({ Clerk: ["invoices:write"] });
  const { authorize } = createAuthorize({ verifyToken: claimsFor("Clerk") });
  assert.equal((await run(authorize("invoices:read"), withAuth())).code, 403);
});

test("group access, when enabled, lets any key in the group satisfy :read", async () => {
  _seedCacheForTesting({ Clerk: ["invoices:write"] });
  const { authorize } = createAuthorize({
    verifyToken: claimsFor("Clerk"),
    readImpliesGroupAccess: true,
  });
  assert.equal(await run(authorize("invoices:read"), withAuth()), undefined);
  // Still strict for everything that is not a read.
  assert.equal((await run(authorize("invoices:delete"), withAuth())).code, 403);
});

test("authorizeAny is STRICT even when group access is enabled", async () => {
  // The difference that is easiest to collapse by accident, and the one that
  // decides who gets through. `authorize` may widen; `authorizeAny` never does.
  _seedCacheForTesting({ Clerk: ["steps:write"] });
  const { authorizeAny } = createAuthorize({
    verifyToken: claimsFor("Clerk"),
    readImpliesGroupAccess: true,
  });
  const err = await run(authorizeAny(["steps:read", "journey:read"]), withAuth());
  assert.equal(err.code, 403);
});

test("authorizeAny allows on any one of the listed permissions", async () => {
  _seedCacheForTesting({ Clerk: ["journey:read"] });
  const { authorizeAny } = createAuthorize({ verifyToken: claimsFor("Clerk") });
  assert.equal(await run(authorizeAny(["steps:read", "journey:read"]), withAuth()), undefined);
});

test("entitlement runs only AFTER the permission check passes", async () => {
  let ran = false;
  _seedCacheForTesting({ Clerk: [] });
  const { authorize } = createAuthorize({
    verifyToken: claimsFor("Clerk"),
    checkEntitlement: () => {
      ran = true;
      return null;
    },
  });
  await run(authorize("a:read"), withAuth());
  assert.equal(ran, false, "denied requests must not be priced");
});

test("authorize prices entitlement on the REQUIREMENT, authorizeAny on what is HELD", async () => {
  _seedCacheForTesting({ Clerk: ["invoices:write", "invoices:delete"] });
  const seen = [];
  const capture = (ctx) => {
    seen.push({ required: ctx.required, matched: ctx.matched });
    return null;
  };

  const { authorize, authorizeAny } = createAuthorize({
    verifyToken: claimsFor("Clerk"),
    checkEntitlement: capture,
    readImpliesGroupAccess: true,
  });

  // Granted via group access, but priced on what the ROUTE asked for.
  await run(authorize("invoices:read"), withAuth());
  assert.deepEqual(seen[0], { required: ["invoices:read"], matched: ["invoices:read"] });

  // Priced on every listed permission the role actually holds.
  await run(authorizeAny(["invoices:write", "invoices:delete", "invoices:add"]), withAuth());
  assert.deepEqual(seen[1].matched, ["invoices:write", "invoices:delete"]);
});

test("an entitlement denial is returned verbatim", async () => {
  _seedCacheForTesting({ Clerk: ["a:read"] });
  const { HttpError } = require("@guisao-llc/gambit-auth");
  const { authorize } = createAuthorize({
    verifyToken: claimsFor("Clerk"),
    checkEntitlement: () => new HttpError("This feature is not enabled", 403),
  });
  const err = await run(authorize("a:read"), withAuth());
  assert.equal(err.code, 403);
  assert.equal(err.message, "This feature is not enabled");
});

test("a thrown verifier becomes 401 and leaks nothing", async () => {
  const { authorize } = createAuthorize({
    verifyToken: async () => {
      throw new Error("token expired at 12:04 for user 998");
    },
  });
  const err = await run(authorize("a:read"), withAuth());
  assert.equal(err.code, 401);
  assert.equal(err.message, "Unauthorized");
});

test("the verified claims are attached for downstream handlers", async () => {
  _seedCacheForTesting({ Admin: ["a:read"] });
  const { authorize } = createAuthorize({
    verifyToken: async () => ({ roles: "Admin", id: "u1" }),
  });
  const req = withAuth();
  await run(authorize("a:read"), req);
  assert.deepEqual(req.user, { roles: "Admin", id: "u1" });
});

// ── platform admin ───────────────────────────────────────────────────────────

test("requirePlatformAdmin gates on the app's own definition", async () => {
  _seedCacheForTesting({
    Global: { permissions: [], bypassFeatureChecks: true },
    Clerk: { permissions: [], bypassFeatureChecks: false },
  });
  const guard = createRequirePlatformAdmin({
    isPlatformAdmin: (role) => Boolean(role?.bypassFeatureChecks),
  });

  assert.equal(await run(guard, { user: { roles: "Global" } }), undefined);
  assert.equal((await run(guard, { user: { roles: "Clerk" } })).code, 403);
  assert.equal((await run(guard, {})).code, 403, "no role at all is denied");
});

// ── schema fragments ─────────────────────────────────────────────────────────

test("roleFields takes the tenant from the app, and omits it when there is none", () => {
  const scoped = roleFields({ tenant: { field: "practiceId", ref: "Practices" } });
  assert.ok(scoped.practiceId, "the app's tenant field is present");
  assert.equal(scoped.practiceId.ref, "Practices");
  assert.equal(scoped.schoolId, undefined, "no other app's vocabulary");

  const global = roleFields();
  assert.equal(global.practiceId, undefined);
  assert.ok(global.name && global.permissions, "the shared half is always there");
});

test("permissions are stored as KEY STRINGS, which is why the cascades exist", () => {
  const f = roleFields();
  assert.deepEqual(f.permissions.type, [String]);
  assert.deepEqual(f.permissions.default, []);
});

test("the permission action enum includes add", () => {
  // It did not, in the app this came from: fourteen catalog entries declared
  // action "add" against an enum of read/write/delete. Nothing failed, because
  // the sync path used bulkWrite, which does not run validators by default —
  // so the enum was simply not enforced. Any validated write would have
  // rejected all fourteen.
  assert.deepEqual([...PERMISSION_ACTIONS], ["read", "add", "write", "delete"]);
  assert.deepEqual(permissionFields().action.enum, ["read", "add", "write", "delete"]);
  assert.deepEqual(permissionFields({ actions: ["read"] }).action.enum, ["read"]);
});

// ── cascades ─────────────────────────────────────────────────────────────────

test("role deletion clears accounts BEFORE deleting the role", async () => {
  // Load-bearing: both steps resolve the role by NAME, so deleting the document
  // first destroys the only handle the account step has.
  const order = [];
  const roleModel = {
    deleteOne: async () => order.push("delete-role"),
    updateMany: async () => {},
  };
  await buildRoleDeletion({
    roleModel,
    clearRoleFromAccounts: async () => order.push("clear-accounts"),
  }).execute("Instructor");

  assert.deepEqual(order, ["clear-accounts", "delete-role"]);
});

test("role deletion does not delete when clearing accounts fails", async () => {
  let deleted = false;
  const roleModel = {
    deleteOne: async () => {
      deleted = true;
    },
    updateMany: async () => {},
  };
  await assert.rejects(
    () =>
      buildRoleDeletion({
        roleModel,
        clearRoleFromAccounts: async () => {
          throw new Error("accounts unavailable");
        },
      }).execute("Instructor"),
    /accounts unavailable/,
  );
  assert.equal(deleted, false, "a role removed while accounts still hold it is worse");
});

test("permission deletion purges the key from roles before deleting it", async () => {
  const order = [];
  const roleModel = {
    updateMany: async (filter, update) => {
      order.push("purge");
      assert.deepEqual(filter, { permissions: "courses:manage" });
      assert.deepEqual(update, { $pull: { permissions: "courses:manage" } });
    },
    deleteOne: async () => {},
  };
  const permissionModel = {
    deleteOne: async (filter) => {
      order.push("delete");
      assert.deepEqual(filter, { key: "courses:manage" });
    },
  };

  await buildPermissionDeletion({ roleModel, permissionModel }).execute("courses:manage");
  assert.deepEqual(order, ["purge", "delete"]);
});
