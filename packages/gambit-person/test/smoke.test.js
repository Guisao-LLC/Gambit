/** Runs against dist/ — what a consumer actually installs. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { Schema, model } = require("mongoose");

const {
  normalizeEmail,
  joinName,
  isPlausibleEmail,
  checkIdentity,
  credentials,
  resolveCredential,
  DEFAULT_MAGIC_TTL_MS,
  DEFAULT_RESET_TTL_MS,
  createEnrollment,
  EnrollmentError,
} = require("../dist/index.js");

const { personFields, personAddressSchema } = require("../dist/mongoose.js");

// ---------------------------------------------------------------------------
// identity
// ---------------------------------------------------------------------------

test("an address is folded to one canonical form", () => {
  assert.equal(normalizeEmail("  Ada.Lovelace@Example.COM "), "ada.lovelace@example.com");
});

test("the name joins in the one direction that is safe", () => {
  assert.equal(joinName(" Ada ", " Lovelace "), "Ada Lovelace");
  // A missing half must not leave a dangling space that reads as a real name.
  assert.equal(joinName("Ada", ""), "Ada");
});

test("the email rule accepts what mail actually accepts", () => {
  for (const good of ["a@b.co", "ada+tag@example.com", "x.y@sub.domain.io"]) {
    assert.ok(isPlausibleEmail(good), `${good} should be accepted`);
  }
  for (const bad of ["ada", "ada@", "@example.com", "a b@example.com", "ada@example"]) {
    assert.ok(!isPlausibleEmail(bad), `${bad} should be rejected`);
  }
});

test("checkIdentity names the field so a form can highlight it", () => {
  assert.deepEqual(checkIdentity({ lastName: "L", email: "a@b.co" }).field, "firstName");
  assert.deepEqual(checkIdentity({ firstName: "A", email: "a@b.co" }).field, "lastName");
  assert.deepEqual(checkIdentity({ firstName: "A", lastName: "L" }).field, "email");
  assert.deepEqual(
    checkIdentity({ firstName: "A", lastName: "L", email: "nope" }).field,
    "email",
  );
});

test("a phone number is optional unless the app says otherwise", () => {
  const without = { firstName: "A", lastName: "L", email: "a@b.co" };
  assert.ok(checkIdentity(without).ok);
  assert.equal(checkIdentity(without, { requirePhone: true }).ok, false);
  assert.equal(checkIdentity(without, { requirePhone: true }).field, "phoneNumber");
});

test("a passing check hands back the NORMALIZED identity, not the input", () => {
  // The point of returning it: there is no state where you have validated the
  // address but are still holding the un-lowercased one.
  const result = checkIdentity({
    firstName: " Ada ",
    lastName: "Lovelace",
    email: " ADA@Example.com ",
  });
  assert.ok(result.ok);
  assert.deepEqual(result.identity, {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
  });
  // An absent phone is absent, not an empty string that would fail a required
  // schema path with a confusing message.
  assert.ok(!("phoneNumber" in result.identity));
});

// ---------------------------------------------------------------------------
// credentials
// ---------------------------------------------------------------------------

/** Predictable random, so expiry and token assertions are exact. */
function fixedSources(values = ["token-1", "token-2"]) {
  let i = 0;
  return {
    randomToken: () => values[i++ % values.length],
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  };
}

test("a magic link writes the magic fields and expires in 7 days", () => {
  const grant = resolveCredential(credentials.magicLink(), fixedSources());
  assert.equal(grant.kind, "magic-link");
  assert.equal(grant.fields.magicToken, "token-1");
  assert.equal(
    grant.fields.magicTokenExpiry.getTime(),
    new Date("2026-01-01T00:00:00.000Z").getTime() + DEFAULT_MAGIC_TTL_MS,
  );
  assert.ok(!("resetToken" in grant.fields), "wrote the wrong token field");
});

test("a password reset writes the reset fields and expires in 4 hours", () => {
  const grant = resolveCredential(credentials.passwordReset(), fixedSources());
  assert.equal(grant.kind, "password-reset");
  assert.equal(grant.fields.resetToken, "token-1");
  assert.equal(
    grant.fields.resetTokenExpiry.getTime(),
    new Date("2026-01-01T00:00:00.000Z").getTime() + DEFAULT_RESET_TTL_MS,
  );
  assert.ok(!("magicToken" in grant.fields), "wrote the wrong token field");
});

test("the password seed is a SECOND random value, never the token", () => {
  // If they were the same, anyone who saw an invitation link — a mail log, a
  // browser history, a forwarded message — would hold the account's permanent
  // password. The token expires; the hash it seeded would not.
  const grant = resolveCredential(credentials.magicLink(), fixedSources());
  assert.equal(grant.token, "token-1");
  assert.equal(grant.plaintext, "token-2");
  assert.notEqual(grant.plaintext, grant.token);
});

test("a chosen password is used as typed and mints no token", () => {
  const grant = resolveCredential(credentials.chosen("correct horse battery"), fixedSources());
  assert.equal(grant.plaintext, "correct horse battery");
  assert.deepEqual(grant.fields, {});
  assert.equal(grant.token, undefined);
});

test("chosen without a password is a programmer error, not a silent blank", () => {
  assert.throws(() => resolveCredential({ kind: "chosen" }, fixedSources()), /requires a password/);
});

test("the TTL is overridable per call", () => {
  const grant = resolveCredential(credentials.passwordReset(60_000), fixedSources());
  assert.equal(
    grant.fields.resetTokenExpiry.getTime(),
    new Date("2026-01-01T00:00:00.000Z").getTime() + 60_000,
  );
});

// ---------------------------------------------------------------------------
// enrollment
// ---------------------------------------------------------------------------

/** An account store backed by an array — the interface is three methods. */
function fakeStore(seed = []) {
  const rows = [...seed];
  let nextId = 1;
  return {
    rows,
    async findByEmail(email) {
      return rows.find((r) => r.email === email) ?? null;
    },
    async create(doc) {
      const row = { _id: `acct-${nextId++}`, ...doc };
      rows.push(row);
      return row;
    },
    async deleteById(id) {
      const at = rows.findIndex((r) => r._id === id);
      if (at !== -1) rows.splice(at, 1);
    },
  };
}

/** A hash you can assert the INPUT of, which is the whole point below. */
const revealingHash = async (plaintext) => `hashed:${plaintext}`;

function enrollment(store, overrides = {}) {
  let i = 0;
  return createEnrollment({
    accounts: store,
    hashPassword: revealingHash,
    randomToken: () => `rand-${++i}`,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  });
}

test("enrolling writes the account the app's schema expects", async () => {
  const store = fakeStore();
  const enroll = enrollment(store);

  const result = await enroll({
    firstName: "Ada",
    lastName: "Lovelace",
    email: " ADA@Example.com ",
    phoneNumber: "555-0100",
    role: "Learner",
    accountType: "learner",
    tenant: { field: "orgId", value: "org-1" },
    credential: credentials.magicLink(),
  });

  const account = store.rows[0];
  assert.equal(account.name, "Ada Lovelace");
  assert.equal(account.email, "ada@example.com");
  assert.equal(account.roles, "Learner");
  assert.equal(account.userType, "learner");
  assert.equal(account.orgId, "org-1");
  assert.equal(account.phoneNumber, "555-0100");
  assert.equal(account.isVerified, false);
  assert.equal(account.magicToken, "rand-1");

  // The caller gets the token to build a link, and the NORMALIZED address to
  // mail it to — not the raw one it passed in.
  assert.equal(result.credential.token, "rand-1");
  assert.equal(result.identity.email, "ada@example.com");
});

test("the stored password is NEVER derived from anything anyone can know", async () => {
  // The regression this package exists to make unexpressible: a placeholder
  // password seeded from a value already on the record, which is a working
  // credential held by everyone who can read that value. There is no argument
  // to `enroll` that could reproduce it — this test pins that shut.
  const store = fakeStore();
  const enroll = enrollment(store);

  await enroll({
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phoneNumber: "555-0100",
    credential: credentials.magicLink(),
  });

  const { passwordHash } = store.rows[0];
  assert.equal(passwordHash, "hashed:rand-2");
  for (const known of ["555-0100", "ada@example.com", "Ada", "Lovelace", "Ada Lovelace"]) {
    assert.notEqual(passwordHash, `hashed:${known}`, `seeded the password from ${known}`);
  }
  // And not from the token that goes out in the mail, either.
  assert.notEqual(passwordHash, `hashed:${store.rows[0].magicToken}`);
});

test("the result never carries the plaintext back to the caller", async () => {
  const enroll = enrollment(fakeStore());
  const result = await enroll({
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    credential: credentials.passwordReset(),
  });
  assert.deepEqual(Object.keys(result.credential).sort(), ["expiresAt", "kind", "token"]);
  assert.equal(JSON.stringify(result.credential).includes("rand-2"), false);
  // `result.account` is the created document, so it DOES carry the hash — the
  // caller projects it away before responding, exactly as it must for any
  // account it reads back. What must never appear anywhere is the plaintext.
  assert.equal(result.account.passwordHash, "hashed:rand-2");
});

test("bad details are a 400 that names the field", async () => {
  const enroll = enrollment(fakeStore());
  await assert.rejects(
    () => enroll({ firstName: "Ada", email: "ada@example.com", credential: credentials.magicLink() }),
    (error) => {
      assert.ok(error instanceof EnrollmentError);
      assert.equal(error.status, 400);
      assert.equal(error.code, "invalid-details");
      assert.equal(error.field, "lastName");
      return true;
    },
  );
});

test("a taken address is a 409 — the same answer however it is discovered", async () => {
  // Two paths reach it: the lookup before the write, and a unique-index
  // collision when someone else enrolled the address in between. Both must
  // answer the same way, or the second reads as a server fault.
  const store = fakeStore([{ _id: "acct-0", email: "ada@example.com" }]);
  const enroll = enrollment(store);
  const input = {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ADA@example.com",
    credential: credentials.magicLink(),
  };

  await assert.rejects(() => enroll(input), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "email-taken");
    return true;
  });

  const racing = fakeStore();
  racing.create = async () => {
    const error = new Error("E11000 duplicate key error");
    error.code = 11000;
    throw error;
  };
  await assert.rejects(() => enrollment(racing)(input), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "email-taken");
    return true;
  });
});

test("a write that fails for any other reason is not disguised as a conflict", async () => {
  const store = fakeStore();
  store.create = async () => {
    throw new Error("connection lost");
  };
  await assert.rejects(
    () =>
      enrollment(store)({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        credential: credentials.magicLink(),
      }),
    /connection lost/,
  );
});

test("accountFields cannot overwrite what enroll derives", async () => {
  const enroll = enrollment(fakeStore());
  for (const key of ["passwordHash", "email", "name", "magicToken", "resetTokenExpiry"]) {
    await assert.rejects(
      () =>
        enroll({
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          credential: credentials.magicLink(),
          accountFields: { [key]: "smuggled" },
        }),
      (error) => {
        // A mistake in the calling code, so NOT an EnrollmentError — this must
        // never be turned into a 4xx and shown to a user.
        assert.ok(!(error instanceof EnrollmentError));
        assert.match(error.message, new RegExp(key));
        return true;
      },
      `${key} was not reserved`,
    );
  }
});

test("accountFields carries the app's own account columns through", async () => {
  const store = fakeStore();
  await enrollment(store)({
    firstName: "Grace",
    lastName: "Hopper",
    email: "grace@example.com",
    accountType: "staff",
    credential: credentials.passwordReset(),
    accountFields: { workingHours: { mon: "9-5" }, zoneIds: ["z1"], allZones: false },
  });
  assert.deepEqual(store.rows[0].workingHours, { mon: "9-5" });
  assert.deepEqual(store.rows[0].zoneIds, ["z1"]);
  assert.equal(store.rows[0].allZones, false);
});

test("a failed domain record takes the account down with it", async () => {
  // Written by hand this leaves an orphan — and because the address is now
  // taken, every retry fails as "already registered" while the person has no
  // usable record.
  const store = fakeStore();
  await assert.rejects(
    () =>
      enrollment(store)({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        credential: credentials.magicLink(),
        onAccountCreated: async () => {
          throw new Error("learner record rejected");
        },
      }),
    /learner record rejected/,
  );
  assert.equal(store.rows.length, 0, "left an orphaned account behind");
});

test("when the cleanup ALSO fails, it says the account is orphaned", async () => {
  const store = fakeStore();
  store.deleteById = async () => {
    throw new Error("delete failed too");
  };
  await assert.rejects(
    () =>
      enrollment(store)({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        credential: credentials.magicLink(),
        onAccountCreated: async () => {
          throw new Error("learner record rejected");
        },
      }),
    (error) => {
      assert.ok(error instanceof EnrollmentError);
      assert.equal(error.code, "orphaned-account");
      assert.equal(error.status, 500);
      assert.match(error.message, /ada@example\.com/);
      return true;
    },
  );
});

test("the domain record is created with the account's id and returned", async () => {
  const store = fakeStore();
  const result = await enrollment(store)({
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    credential: credentials.magicLink(),
    onAccountCreated: async (account) => ({ userId: account._id, cards: [] }),
  });
  assert.deepEqual(result.attached, { userId: "acct-1", cards: [] });
});

test("a self-service signup gets no token and keeps its typed password", async () => {
  const store = fakeStore();
  const result = await enrollment(store)({
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    role: "User",
    credential: credentials.chosen("a good long passphrase"),
  });
  assert.equal(store.rows[0].passwordHash, "hashed:a good long passphrase");
  assert.equal(result.credential.token, undefined);
  assert.ok(!("magicToken" in store.rows[0]));
  assert.ok(!("resetToken" in store.rows[0]));
});

// ---------------------------------------------------------------------------
// The second consumer — the shapes two different apps actually enroll.
// ---------------------------------------------------------------------------

test("both app shapes enroll through the same factory", async () => {
  const store = fakeStore();
  const enroll = enrollment(store);

  // A learner: magic link, tenant as a String, a domain record beside it.
  const learner = await enroll({
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phoneNumber: "555-0100",
    role: "Student",
    accountType: "student",
    tenant: { field: "schoolId", value: "school-1" },
    credential: credentials.magicLink(),
    identityOptions: { requirePhone: true },
    onAccountCreated: async (account) => ({ _id: "learner-1", userId: account._id }),
  });
  assert.equal(learner.account.userType, "student");
  assert.ok(learner.credential.token);
  assert.equal(learner.attached._id, "learner-1");

  // A practitioner: set-password link, no domain record, extra account columns.
  const practitioner = await enroll({
    firstName: "Grace",
    lastName: "Hopper",
    email: "grace@example.com",
    role: "Practitioner",
    accountType: "staff",
    tenant: { field: "practiceId", value: "practice-1" },
    credential: credentials.passwordReset(),
    accountFields: { intention: "care" },
  });
  assert.equal(practitioner.account.userType, "staff");
  assert.equal(practitioner.account.practiceId, "practice-1");
  assert.equal(practitioner.account.intention, "care");
  assert.ok(practitioner.account.resetToken, "no set-password token minted");
  assert.ok(!("magicToken" in practitioner.account), "minted the learner's token kind");
  assert.equal(practitioner.attached, undefined);
});

// ---------------------------------------------------------------------------
// mongoose entry point
// ---------------------------------------------------------------------------

test("the schema fragment spreads into a real model", () => {
  const schema = new Schema({
    ...personFields({
      tenant: { field: "schoolId", type: "String" },
      includeAddress: true,
      defaultLanguage: "en",
    }),
    cardStates: { type: [String], required: false },
  });
  const Learner = model(`Learner_${Math.random().toString(36).slice(2)}`, schema);

  assert.equal(Learner.schema.path("firstName").isRequired, true);
  assert.equal(Learner.schema.path("schoolId").instance, "String");
  assert.equal(Learner.schema.path("language").defaultValue, "en");
  assert.equal(Learner.schema.path("userId").options.ref, "Users");
  // No `name`: re-splitting a joined name is a guess, so it is never stored.
  assert.equal(Learner.schema.path("name"), undefined);
  assert.ok(Learner.schema.path("address"));
  assert.ok(personAddressSchema.path("zip"));
});

test("a tenant declared as an ObjectId is one", () => {
  const schema = new Schema(
    personFields({ tenant: { field: "practiceId", type: "ObjectId", ref: "Practices" } }),
  );
  assert.equal(schema.path("practiceId").instance, "ObjectId");
  assert.equal(schema.path("practiceId").options.ref, "Practices");
});

test("no tenant means no column, not an empty one", () => {
  const schema = new Schema(personFields());
  for (const invented of ["tenantId", "schoolId", "practiceId", "orgId"]) {
    assert.equal(schema.path(invented), undefined, `invented ${invented}`);
  }
});
