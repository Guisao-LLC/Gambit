/** Runs against dist/ — what a consumer actually installs. */
const test = require("node:test");
const assert = require("node:assert/strict");

const { EmailService } = require("../dist/index.js");
const { GoogleWorkspaceEmailStrategy, googleWorkspaceConfigFromEnv } = require("../dist/google.js");

/** A transport that records what it was asked to send. */
function spyStrategy() {
  const sent = [];
  return {
    sent,
    async sendMail(options) {
      sent.push(options);
      return { messageId: "test-" + sent.length };
    },
  };
}

test("the package root loads without nodemailer or googleapis present", () => {
  // The whole reason the Google transport sits behind a subpath. If this ever
  // starts needing them, every consumer silently inherits ~100MB of Gmail API.
  const resolved = Object.keys(require("../dist/index.js"));
  assert.deepEqual(resolved.sort(), ["EmailService"]);
});

test("a directly injected strategy is used as-is", async () => {
  const spy = spyStrategy();
  const svc = new EmailService(spy);
  await svc.send({ to: "a@example.com", subject: "Hi" });
  assert.equal(spy.sent.length, 1);
  assert.equal(spy.sent[0].to, "a@example.com");
});

test("the transport is built on the first send, not at construction", async () => {
  let built = 0;
  // A strategy that reads credentials throws when they are absent. Building
  // eagerly would mean merely importing the app's mail module explodes in any
  // environment without mail configured.
  const svc = new EmailService({ createStrategy: () => { built++; return spyStrategy(); } });
  assert.equal(built, 0, "constructing must not build the transport");
  // Awaited: `send` resolves the CC list first, so the transport is built on a
  // later microtask. Asserting synchronously reads 0 and says nothing.
  await svc.send({ to: "a@example.com", subject: "Hi" });
  assert.equal(built, 1);
});

test("the transport is built once and reused", async () => {
  let built = 0;
  const spy = spyStrategy();
  const svc = new EmailService({ createStrategy: () => { built++; return spy; } });
  await svc.send({ to: "a@example.com", subject: "1" });
  await svc.send({ to: "b@example.com", subject: "2" });
  assert.equal(built, 1);
  assert.equal(spy.sent.length, 2);
});

test("alwaysCc is resolved per send, so a change takes effect without a restart", async () => {
  const spy = spyStrategy();
  let list = ["first@example.com"];
  const svc = new EmailService({ createStrategy: () => spy, alwaysCc: () => list });
  await svc.send({ to: "a@example.com", subject: "1" });
  list = ["second@example.com"];
  await svc.send({ to: "a@example.com", subject: "2" });
  assert.deepEqual(spy.sent[0].cc, ["first@example.com"]);
  assert.deepEqual(spy.sent[1].cc, ["second@example.com"]);
});

test("a per-message cc is merged with alwaysCc, deduplicated", async () => {
  const spy = spyStrategy();
  const svc = new EmailService({ createStrategy: () => spy, alwaysCc: ["shared@example.com"] });
  await svc.send({ to: "a@example.com", subject: "x", cc: ["one@example.com", "shared@example.com"] });
  assert.deepEqual(spy.sent[0].cc, ["one@example.com", "shared@example.com"]);
});

test("a CC resolver that throws does NOT stop the message", async () => {
  // Losing the copies is a far smaller failure than losing the mail.
  const spy = spyStrategy();
  const svc = new EmailService({
    createStrategy: () => spy,
    alwaysCc: () => { throw new Error("database is down"); },
  });
  await svc.send({ to: "a@example.com", subject: "x" });
  assert.equal(spy.sent.length, 1);
  assert.deepEqual(spy.sent[0].cc, []);
});

// ── The alias split ────────────────────────────────────────────────────────

const CREDS = { clientId: "id", clientSecret: "secret", refreshToken: "1//token" };

test("user defaults to from when the sender is a real mailbox", () => {
  const s = new GoogleWorkspaceEmailStrategy({ from: "noreply@example.com", ...CREDS });
  assert.equal(s.authUser, "noreply@example.com");
});

test("user and from stay SEPARATE when sending as an alias", () => {
  // Collapsing these is the bug this package exists to prevent: Gmail accepts
  // the send and silently rewrites From: to the authenticated account.
  const s = new GoogleWorkspaceEmailStrategy({
    from: "noreply@example.com",
    user: "owner@example.com",
    ...CREDS,
  });
  assert.equal(s.authUser, "owner@example.com");
  assert.equal(s.fromHeader, "noreply@example.com");
});

test("a sender name is quoted into the From header, and absent stays bare", () => {
  // A quoted empty string renders as `"" <addr>` in some clients.
  const named = new GoogleWorkspaceEmailStrategy({ from: "a@example.com", senderName: "Acme", ...CREDS });
  assert.equal(named.fromHeader, '"Acme" <a@example.com>');
  const bare = new GoogleWorkspaceEmailStrategy({ from: "a@example.com", ...CREDS });
  assert.equal(bare.fromHeader, "a@example.com");
});

test("missing credentials fail loudly at construction", () => {
  assert.throws(() => new GoogleWorkspaceEmailStrategy({ from: "a@example.com" }), /clientId/);
});

test("googleWorkspaceConfigFromEnv keeps EMAIL_AUTH_USER separate", () => {
  const cfg = googleWorkspaceConfigFromEnv({
    EMAIL_FROM: "noreply@example.com",
    EMAIL_AUTH_USER: "owner@example.com",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    GOOGLE_REFRESH_TOKEN: "1//t",
  });
  assert.equal(cfg.from, "noreply@example.com");
  assert.equal(cfg.user, "owner@example.com");
});

test("googleWorkspaceConfigFromEnv falls back to EMAIL_FROM when no auth user is set", () => {
  const cfg = googleWorkspaceConfigFromEnv({
    EMAIL_FROM: "noreply@example.com",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    GOOGLE_REFRESH_TOKEN: "1//t",
  });
  assert.equal(cfg.user, "noreply@example.com");
});

test("googleWorkspaceConfigFromEnv names what is missing", () => {
  assert.throws(() => googleWorkspaceConfigFromEnv({ EMAIL_FROM: "a@example.com" }), /GOOGLE_CLIENT_ID/);
});
