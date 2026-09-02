/** Runs against dist/ — what a consumer actually installs. */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  expectAllow,
  expectDeny401,
  expectDeny403,
  expectAdjacentPermOutcome,
  resolvePath,
  entriesForPermission,
  pickAdjacentPerm,
  featuresForRoute,
  buildPermissionGrid,
} = require("../dist/index.js");

const res = (status, message) => ({ status, body: message ? { message } : {} });

// ── expectAllow ──────────────────────────────────────────────────────────────

test("a 5xx is NOT an allow, even though it is not a 401 or 403", () => {
  // The load-bearing exception. A missing mock makes a handler throw, which
  // produces a 500 — and "not 401/403" would otherwise pass. A whole grid can
  // go green while asserting nothing.
  assert.throws(() => expectAllow(res(500)), /not an allow/);
  assert.throws(() => expectAllow(res(503)), /not an allow/);
});

test("an authorization denial fails; a business-rule denial passes", () => {
  // Same status, opposite meanings — distinguished by the message, which is
  // why matching on status alone cannot work.
  assert.throws(
    () => expectAllow(res(403, "You do not have permission to perform this action")),
    /authorization layer/,
  );
  assert.throws(() => expectAllow(res(401, "Unauthorized")), /authorization layer/);

  // The gate passed; the controller then refused for its own reasons.
  expectAllow(res(403, "You can only view your own school"));
  expectAllow(res(401, "ZipCode not found!"));
});

test("ordinary success and ordinary client errors are allows", () => {
  for (const s of [200, 201, 204, 400, 404, 422]) expectAllow(res(s));
});

test("deny helpers are exact about the status", () => {
  expectDeny401(res(401));
  expectDeny403(res(403));
  assert.throws(() => expectDeny401(res(403)));
  assert.throws(() => expectDeny403(res(401)));
  assert.throws(() => expectDeny403(res(200)));
});

test("failures name the context, so a grid says WHICH permission failed", () => {
  assert.throws(() => expectDeny403(res(200), "patients:read"), /patients:read/);
});

// ── adjacent-permission outcome ──────────────────────────────────────────────

const adjacent = (over) =>
  expectAdjacentPermOutcome(over.res, {
    requiredPermissions: over.required,
    adjacentPerm: over.adjacent,
    usesAny: over.usesAny,
    readImpliesGroupAccess: over.widen,
  });

test("with group access OFF, a neighbour is always denied", () => {
  adjacent({
    res: res(403), required: ["a:read"], adjacent: "a:write",
    usesAny: false, widen: false,
  });
  assert.throws(() =>
    adjacent({
      res: res(200), required: ["a:read"], adjacent: "a:write",
      usesAny: false, widen: false,
    }),
  );
});

test("with group access ON, a neighbour satisfies a :read requirement", () => {
  adjacent({
    res: res(200), required: ["a:read"], adjacent: "a:write",
    usesAny: false, widen: true,
  });
});

test("authorizeAny stays STRICT even with group access ON", () => {
  // The distinction that is easiest to collapse, and the one that decides who
  // gets through. A helper missing `usesAny` predicted "allow" here while the
  // real guard denied — and the tests were changed to match the helper.
  adjacent({
    res: res(403), required: ["a:read", "b:read"], adjacent: "a:write",
    usesAny: true, widen: true,
  });
  assert.throws(() =>
    adjacent({
      res: res(200), required: ["a:read", "b:read"], adjacent: "a:write",
      usesAny: true, widen: true,
    }),
  );
});

test("a non-read requirement is strict however the flags are set", () => {
  adjacent({
    res: res(403), required: ["a:delete"], adjacent: "a:write",
    usesAny: false, widen: true,
  });
});

test("a neighbour from a DIFFERENT group is denied even for :read", () => {
  adjacent({
    res: res(403), required: ["a:read"], adjacent: "b:write",
    usesAny: false, widen: true,
  });
});

// ── manifest ─────────────────────────────────────────────────────────────────

test("path params are substituted longest-name-first", () => {
  // Otherwise `:studentId` is half-eaten by a `:student` entry and the request
  // goes to a path that does not exist — a 404 that reads as a denial.
  assert.equal(
    resolvePath("/api/x/:studentId/y/:id", { ":id": "AAA", ":studentId": "BBB" }),
    "/api/x/BBB/y/AAA",
  );
});

test("params default to 24-hex, because controllers cast them", () => {
  // A non-castable value throws inside the controller, producing a 500 that
  // reads as an authorization failure when authorization had already passed.
  const out = resolvePath("/api/x/:id");
  assert.match(out, /\/api\/x\/[0-9a-f]{24}$/);
});

test("entriesForPermission finds every route gated on a key, including authorizeAny", () => {
  const manifest = [
    { method: "GET", path: "/a", requiredPermissions: ["a:read"], usesAny: false, sourceFile: "a" },
    { method: "GET", path: "/b", requiredPermissions: ["a:read", "b:read"], usesAny: true, sourceFile: "b" },
    { method: "GET", path: "/c", requiredPermissions: ["c:read"], usesAny: false, sourceFile: "c" },
  ];
  assert.deepEqual(entriesForPermission(manifest, "a:read").map((r) => r.path), ["/a", "/b"]);
});

test("pickAdjacentPerm prefers a sibling in the same group", () => {
  const catalog = [
    { key: "a:read", group: "A" }, { key: "a:write", group: "A" }, { key: "b:read", group: "B" },
  ];
  assert.equal(pickAdjacentPerm(catalog, "a:read"), "a:write");
  // Every key in the group is excluded — falls back to another group.
  assert.equal(pickAdjacentPerm(catalog, ["a:read", "a:write"]), "b:read");
  // Nothing left at all: undefined, so the caller can skip rather than assert
  // something meaningless.
  assert.equal(pickAdjacentPerm([{ key: "a:read", group: "A" }], "a:read"), undefined);
});

// ── feature seeding ──────────────────────────────────────────────────────────

test("the allow-path seed grants the route's key AND the held permission's", () => {
  // Under authorizeAny the entitlement is priced on what the role HOLDS, which
  // may belong to a different feature than the route's own key.
  assert.deepEqual(
    featuresForRoute({ featureKey: "billing" }, { key: "x", group: "X", featureKey: "scheduler" }),
    ["core", "billing", "scheduler"],
  );
  assert.deepEqual(featuresForRoute({}), ["core"]);
  assert.deepEqual(featuresForRoute({ featureKey: "core" }), ["core"]);
});

// ── the grid generator ───────────────────────────────────────────────────────

test("an unknown group throws instead of producing an empty passing suite", () => {
  assert.throws(
    () =>
      buildPermissionGrid({
        group: "Typo",
        catalog: [{ key: "a:read", group: "Patients" }],
        manifest: [],
        buildApp: () => ({}),
        withUser: () => {},
        withoutUser: () => {},
        readImpliesGroupAccess: false,
      }),
    /no permissions with group "Typo"/,
  );
});
