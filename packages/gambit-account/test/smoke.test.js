/** Runs against dist/ — what a consumer actually installs. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { Schema, model } = require("mongoose");

const {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  checkNewPassword,
  checkPasswordConfirmation,
  MAX_AVATAR_BYTES,
  ALLOWED_AVATAR_MIMES,
  base64ByteLength,
  stripDataUrlPrefix,
  checkAvatarUpload,
  resolveCcRecipients,
  normalizeEmailAddress,
  isPlausibleEmailAddress,
  parseAddressList,
  baseAccountFields,
  applyAccountStatics,
} = require("../dist/index.js");

// ── password ─────────────────────────────────────────────────────────────────

test("password length is the rule, and it is measured on the RAW string", () => {
  assert.equal(checkNewPassword("a".repeat(MIN_PASSWORD_LENGTH)).ok, true);
  assert.equal(checkNewPassword("a".repeat(MIN_PASSWORD_LENGTH - 1)).ok, false);
  assert.equal(checkNewPassword("a".repeat(MAX_PASSWORD_LENGTH + 1)).ok, false);

  // Spaces are legitimate password characters. Trimming before measuring would
  // accept a password the user cannot type back.
  const padded = "  " + "a".repeat(MIN_PASSWORD_LENGTH - 2) + "  ";
  assert.equal(padded.length, MIN_PASSWORD_LENGTH + 2);
  assert.equal(checkNewPassword(padded).ok, true);
});

test("password rejects empty and non-strings with something a user can read", () => {
  for (const bad of ["", "   ", null, undefined, 12345678]) {
    const r = checkNewPassword(bad);
    assert.equal(r.ok, false);
    assert.ok(r.reason && r.reason.length > 0);
  }
});

test("a no-op password change is refused", () => {
  const same = "correct horse battery";
  assert.equal(checkNewPassword(same, same).ok, false);
  assert.equal(checkNewPassword(same, "something else").ok, true);
  // `current` is optional — most callers do not have it.
  assert.equal(checkNewPassword(same).ok, true);
});

test("no character-class rule, deliberately", () => {
  // Length resists guessing; composition rules push people toward predictable
  // substitutions and sticky notes. Asserted so removing it is a decision.
  assert.equal(checkNewPassword("aaaaaaaaaaaa").ok, true);
});

test("confirmation is checked separately so the error lands on the right field", () => {
  assert.equal(checkPasswordConfirmation("abc", "abc").ok, true);
  assert.equal(checkPasswordConfirmation("abc", "abd").ok, false);
});

// ── avatar ───────────────────────────────────────────────────────────────────

const b64 = (bytes) => Buffer.alloc(bytes, 1).toString("base64");

test("SVG is refused — an avatar must not be able to execute", () => {
  // The security-relevant one. SVG is a document format that can carry
  // <script>, and these images are rendered back into pages.
  assert.equal(checkAvatarUpload({ mime: "image/svg+xml", base64: b64(10) }).ok, false);
  assert.ok(!ALLOWED_AVATAR_MIMES.includes("image/svg+xml"));
  for (const mime of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
    assert.equal(checkAvatarUpload({ mime, base64: b64(10) }).ok, true, mime);
  }
});

test("the size cap is enforced, and reported in the reason", () => {
  const over = checkAvatarUpload({ mime: "image/png", base64: b64(MAX_AVATAR_BYTES + 1024) });
  assert.equal(over.ok, false);
  assert.ok(over.bytes > MAX_AVATAR_BYTES);
  assert.match(over.reason, /KB/);
  assert.equal(checkAvatarUpload({ mime: "image/png", base64: b64(MAX_AVATAR_BYTES - 10) }).ok, true);
});

test("size is computed from base64 LENGTH, not by decoding", () => {
  // The point of a cap is to avoid materialising a huge buffer to discover it
  // was huge.
  for (const n of [0, 1, 2, 3, 100, 1024]) {
    assert.equal(base64ByteLength(Buffer.alloc(n, 7).toString("base64")), n, `${n} bytes`);
  }
});

test("a data: URL and a bare payload are both accepted", () => {
  const bare = b64(64);
  assert.equal(stripDataUrlPrefix(`data:image/png;base64,${bare}`), bare);
  assert.equal(stripDataUrlPrefix(bare), bare);
  assert.equal(checkAvatarUpload({ mime: "image/png", base64: `data:image/png;base64,${bare}` }).ok, true);
});

test("malformed base64 is refused now, not later as a broken image", () => {
  assert.equal(checkAvatarUpload({ mime: "image/png", base64: "not base64!!" }).ok, false);
  assert.equal(checkAvatarUpload({ mime: "image/png", base64: "" }).ok, false);
});

// ── cc recipients ────────────────────────────────────────────────────────────

test("addresses are normalized, so nobody is copied twice", () => {
  assert.equal(normalizeEmailAddress("  Person@Example.COM "), "person@example.com");
  const r = resolveCcRecipients({
    optedIn: ["a@example.com", "A@Example.com", " a@example.com "],
  });
  assert.deepEqual(r.cc, ["a@example.com"]);
});

test("opted-in people come FIRST, so the cap truncates the extras", () => {
  // Deliberate: if the list is cut, the addresses kept should be the ones
  // belonging to real accounts who asked to be copied.
  const r = resolveCcRecipients({
    optedIn: ["me@x.com"],
    extras: ["extra@x.com"],
    max: 1,
  });
  assert.deepEqual(r.cc, ["me@x.com"]);
  assert.deepEqual(r.dropped, ["extra@x.com"]);
});

test("a primary recipient is not also copied", () => {
  // Copying someone on a message addressed to them delivers it twice.
  const r = resolveCcRecipients({
    optedIn: ["boss@x.com", "other@x.com"],
    excluding: ["BOSS@x.com"],
  });
  assert.deepEqual(r.cc, ["other@x.com"]);
});

test("what was dropped or rejected is REPORTED, not silently discarded", () => {
  const r = resolveCcRecipients({ optedIn: ["good@x.com", "not-an-address"] });
  assert.deepEqual(r.cc, ["good@x.com"]);
  assert.deepEqual(r.invalid, ["not-an-address"]);
});

test("an empty entry is an absence, not a mistake to report back", () => {
  // A cleared input box should not come back as "invalid address".
  const r = resolveCcRecipients({ extras: ["", "   ", "ok@x.com"] });
  assert.deepEqual(r.cc, ["ok@x.com"]);
  assert.deepEqual(r.invalid, []);
});

test("implausible addresses are dropped rather than mailed", () => {
  assert.equal(isPlausibleEmailAddress("a@b.co"), true);
  for (const bad of ["", "nope", "a@b", "@b.com", "a b@c.com"]) {
    assert.equal(isPlausibleEmailAddress(bad), false, bad);
  }
});

test("parseAddressList splits the ways people actually type lists", () => {
  assert.deepEqual(
    parseAddressList("a@x.com, b@x.com;c@x.com\nd@x.com").sort(),
    ["a@x.com", "b@x.com", "c@x.com", "d@x.com"],
  );
  assert.deepEqual(parseAddressList(""), []);
});

// ── the account record ───────────────────────────────────────────────────────

test("the account fragment carries the profile fields it was built for", () => {
  const f = baseAccountFields();
  for (const key of ["name", "email", "passwordHash", "roles", "avatar", "emailCopyOptIn"]) {
    assert.ok(f[key], `${key} missing`);
  }
  // Opt-IN: nobody starts receiving copies of other people's mail by default.
  assert.equal(f.emailCopyOptIn.default, false);
});

test("the account kinds and the tenant come from the app", () => {
  const f = baseAccountFields({
    tenant: { field: "practiceId", type: "ObjectId", ref: "Practices", required: true },
    accountType: { values: ["staff", "patient"], default: "patient" },
  });
  assert.deepEqual(f.userType.enum, ["staff", "patient"]);
  assert.ok(f.practiceId);
  assert.equal(f.schoolId, undefined, "no other app's vocabulary");
});

test("statics attach to whatever schema they are given", () => {
  const s = new Schema(baseAccountFields());
  applyAccountStatics(s);
  for (const fn of ["findByEmail", "findByName", "updateByEmail", "deleteByEmail", "updateById"]) {
    assert.equal(typeof s.statics[fn], "function", fn);
  }
});

test("the avatar subdocument has no _id of its own", () => {
  const s = new Schema(baseAccountFields());
  const m = model("GambitAccountProbe", s);
  assert.deepEqual(Object.keys(m.schema.paths.avatar.schema.paths), ["base64", "mime"]);
  assert.equal(m.schema.paths.avatar.schema.options._id, false);
});

test("isVerified defaults to false — unverified until proven otherwise", () => {
  // Added when the second app's signups all failed validation: it relied on
  // this default while the first app set the field explicitly. A default only
  // applies when the field is absent, so it cannot break the explicit case.
  const f = baseAccountFields();
  assert.equal(f.isVerified.required, true);
  assert.equal(f.isVerified.default, false, "a forgotten field must not be a signup error");
});
