/**
 * How an enrolled person first gets in.
 *
 * There are exactly three ways, and the difference between them is who chose
 * the password:
 *
 *   `chosen`          — the person did, at signup. They can sign in immediately.
 *   `passwordReset`   — nobody has yet. They follow a link and choose one.
 *   `magicLink`       — nobody ever will. The link IS the credential.
 *
 * The two staff-provisioned kinds share the property that matters: the account
 * is created with a password that CANNOT BE GUESSED, because it is not derived
 * from anything anyone knows. `resolveCredential` generates it from the same
 * random source as the token and then discards it — nothing, including the
 * caller, ever holds a usable password for that account.
 *
 * That is the point of putting this behind a factory instead of leaving it in
 * each controller. Hand-written provisioning tends toward a placeholder
 * password seeded from something already on the record — a phone number, the
 * address, a joined name — because the account "does not use a password
 * anyway". It does: sign-in routes compare whatever is submitted against
 * whatever is stored, and rarely refuse by account kind. A hash seeded from a
 * known value is a working credential held by everyone who can read that
 * value, and the code that writes it looks exactly as deliberate as the code
 * that does it correctly.
 *
 * There is no parameter here that would let a caller express that. A seeded
 * password is not a discouraged option; it is not an option.
 */

export type CredentialKind = "chosen" | "password-reset" | "magic-link";

/** 4 hours. Long enough to act on, short enough that a forwarded mail expires. */
export const DEFAULT_RESET_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * 7 days.
 *
 * Longer than the reset window on purpose: a magic link is the ONLY way this
 * account signs in, so an expiry is an interruption to be recovered from
 * rather than a step in a flow the person is already in the middle of.
 */
export const DEFAULT_MAGIC_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** How many random bytes back a token. 32 → 64 hex characters. */
export const TOKEN_BYTES = 32;

export interface CredentialSpec {
  kind: CredentialKind;
  /** Ignored for `chosen`. */
  ttlMs?: number;
  /** The plaintext the person typed. Only meaningful for `chosen`. */
  password?: string;
}

export const credentials = {
  /** Self-service signup: the person typed a password and expects it to work. */
  chosen(password: string): CredentialSpec {
    return { kind: "chosen", password };
  },
  /**
   * Staff enrollment for someone who will use a password.
   *
   * They receive a link, choose one, and sign in normally afterwards.
   */
  passwordReset(ttlMs: number = DEFAULT_RESET_TTL_MS): CredentialSpec {
    return { kind: "password-reset", ttlMs };
  },
  /**
   * Staff enrollment for someone who will never type a password.
   *
   * Each link signs them in. Nothing about the account is ever a secret they
   * have to keep.
   */
  magicLink(ttlMs: number = DEFAULT_MAGIC_TTL_MS): CredentialSpec {
    return { kind: "magic-link", ttlMs };
  },
};

/**
 * What a resolved credential contributes to the new account.
 *
 * `plaintext` is what the caller must hash — never stored, never returned to
 * the app beyond this object, and for the provisioned kinds it is random bytes
 * that exist only long enough to be hashed.
 */
export interface CredentialGrant {
  kind: CredentialKind;
  plaintext: string;
  /** Merged onto the account document. Empty for `chosen`. */
  fields: Record<string, unknown>;
  /** Goes in the invitation link. Absent for `chosen`. */
  token?: string;
  expiresAt?: Date;
}

export interface CredentialSources {
  /** Hex or base64 random. Injected so a test can make the token predictable. */
  randomToken: () => string;
  now: () => Date;
}

/**
 * Turn a spec into the fields that go on the account.
 *
 * The token FIELD NAMES are fixed rather than configurable because they are
 * the ones `baseAccountFields` declares — `magicToken`/`magicTokenExpiry` and
 * `resetToken`/`resetTokenExpiry`. A configurable name here would let an app
 * write a token into a field its own schema does not have, and Mongoose would
 * drop it silently on save.
 */
export function resolveCredential(
  spec: CredentialSpec,
  sources: CredentialSources,
): CredentialGrant {
  if (spec.kind === "chosen") {
    if (typeof spec.password !== "string" || spec.password.length === 0) {
      throw new Error("credentials.chosen requires a password");
    }
    return { kind: "chosen", plaintext: spec.password, fields: {} };
  }

  const token = sources.randomToken();
  const ttlMs =
    spec.ttlMs ??
    (spec.kind === "magic-link" ? DEFAULT_MAGIC_TTL_MS : DEFAULT_RESET_TTL_MS);
  const expiresAt = new Date(sources.now().getTime() + ttlMs);

  // A SECOND random value, not the token. If the token were also the password
  // seed, anyone who saw an invitation link in a mail log or a browser history
  // would hold the account's permanent password — the token expires, the hash
  // it seeded would not.
  const plaintext = sources.randomToken();

  const fields =
    spec.kind === "magic-link"
      ? { magicToken: token, magicTokenExpiry: expiresAt }
      : { resetToken: token, resetTokenExpiry: expiresAt };

  return { kind: spec.kind, plaintext, fields, token, expiresAt };
}
