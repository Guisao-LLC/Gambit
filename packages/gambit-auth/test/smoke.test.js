/**
 * Runs against dist/, not src/, on purpose: this asserts what a CONSUMER
 * actually receives after `npm install` — the compiled entrypoint, the exports
 * the package.json points at, and the runtime behavior. A test against source
 * can pass while the published artifact is broken.
 *
 * node:test, so the package needs no test dependency of its own.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  HttpError,
  signToken,
  verifyToken,
  createAuthenticate,
  errorHandler,
  notFound,
} = require("../dist/index.js");

test("the entrypoint exports everything the package promises", () => {
  for (const [name, value] of Object.entries({
    HttpError,
    signToken,
    verifyToken,
    createAuthenticate,
    errorHandler,
    notFound,
  })) {
    assert.ok(value, `${name} is missing from the built entrypoint`);
  }
});

test("HttpError carries the status on both fields and survives instanceof", () => {
  const e = new HttpError("nope", 403);
  assert.equal(e.code, 403);
  // Both, deliberately — consuming error handlers read one or the other.
  assert.equal(e.statusCode, 403);
  assert.equal(e.message, "nope");
  // Fails without the explicit setPrototypeOf when compiled downlevel.
  assert.ok(e instanceof HttpError);
  assert.ok(e instanceof Error);
});

test("a signed token round-trips through verify", async () => {
  process.env.JWT_SECRET = "test-secret-for-smoke";
  const token = await signToken({ id: "u1", email: "a@b.c", roles: "Admin" });
  const claims = await verifyToken(`Bearer ${token}`);
  assert.equal(claims.id, "u1");
  assert.equal(claims.email, "a@b.c");
  assert.equal(claims.roles, "Admin");
});

test("verify rejects a missing header and a bad token, as 401s", async () => {
  process.env.JWT_SECRET = "test-secret-for-smoke";
  await assert.rejects(() => verifyToken(undefined), (e) => e.code === 401);
  await assert.rejects(() => verifyToken("Bearer garbage"), (e) => e.code === 401);
});

test("signing fails loudly when the secret is absent", async () => {
  const saved = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  // 500, not 401: an unconfigured server is not a rejected caller.
  await assert.rejects(() => signToken({ id: "u1" }), (e) => e.code === 500);
  process.env.JWT_SECRET = saved;
});

/** Minimal express doubles — the package takes express as a peer, not a dep. */
const run = (handler, req) =>
  new Promise((resolve) => handler(req, {}, (err) => resolve(err)));

test("authenticate attaches the verified claims where the app reads them", async () => {
  const authenticate = createAuthenticate({
    verifyToken: async () => ({ id: "u1", roles: "Admin" }),
  });
  const req = { headers: { authorization: "Bearer x" } };
  const err = await run(authenticate, req);
  assert.equal(err, undefined, "should call next() with no error");
  assert.deepEqual(req.user, { id: "u1", roles: "Admin" });
});

test("authenticate honours attachTo for an app that keeps claims elsewhere", async () => {
  const authenticate = createAuthenticate({
    verifyToken: async () => ({ id: "u1" }),
    attachTo: "principal",
  });
  const req = { headers: { authorization: "Bearer x" } };
  await run(authenticate, req);
  assert.deepEqual(req.principal, { id: "u1" });
  assert.equal(req.user, undefined);
});

test("authenticate 401s with no header, and never calls the verifier", async () => {
  let called = false;
  const authenticate = createAuthenticate({
    verifyToken: async () => {
      called = true;
      return {};
    },
  });
  const err = await run(authenticate, { headers: {} });
  assert.equal(err.code, 401);
  assert.equal(called, false, "must not verify when there is nothing to verify");
});

test("authenticate turns a thrown verifier into a 401, not a 500", async () => {
  const authenticate = createAuthenticate({
    verifyToken: async () => {
      throw new Error("expired");
    },
  });
  const err = await run(authenticate, { headers: { authorization: "Bearer x" } });
  assert.equal(err.code, 401);
  // The underlying reason must not leak to the caller.
  assert.equal(err.message, "Unauthorized");
});

test("errorHandler reads code, statusCode, or status before falling back", () => {
  const sent = [];
  const res = {
    headersSent: false,
    status(s) {
      sent.push(s);
      return this;
    },
    json() {},
  };
  for (const [err, expected] of [
    [new HttpError("a", 404), 404],
    [{ statusCode: 418 }, 418],
    [{ status: 409 }, 409],
    [new Error("plain"), 500],
  ]) {
    errorHandler(err, {}, res, () => {});
    assert.equal(sent.pop(), expected);
  }
});

test("errorHandler defers when headers are already sent", () => {
  let deferred = false;
  const res = {
    headersSent: true,
    status() {
      throw new Error("must not write a second time");
    },
  };
  errorHandler(new HttpError("late", 500), {}, res, () => {
    deferred = true;
  });
  assert.ok(deferred);
});

test("notFound produces a 404 for the error handler to render", async () => {
  const err = await run(notFound, { headers: {} });
  assert.equal(err.code, 404);
});
