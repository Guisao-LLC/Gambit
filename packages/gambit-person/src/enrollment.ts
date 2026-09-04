import {
  checkIdentity,
  joinName,
  type IdentityOptions,
  type PersonField,
  type PersonIdentity,
} from "./identity";
import {
  resolveCredential,
  type CredentialKind,
  type CredentialSpec,
} from "./credentials";

/**
 * Enrolling a person: create the login, hand back the way in.
 *
 * Every app in this family does this — a school enrolls a learner and hires an
 * instructor, a clinic registers a client and adds a practitioner. The steps
 * are the same every time: check the details, refuse a duplicate address, mint
 * a credential nobody can guess, write the account, attach whatever domain
 * record the app keeps beside it, and return a link to send.
 *
 * This module owns that sequence and NOTHING ELSE. It does not know what a
 * student is, cannot build a URL, and never sends mail. Those differ per app
 * and per person kind, so they stay with the caller.
 *
 * Like every shared handler here, it does not PICK its dependencies — it is
 * GIVEN them. The account model, the hash function and the random source all
 * arrive through `createEnrollment`, which is what lets one app hash with
 * bcrypt while another uses argon2, and what lets a test make a token
 * predictable without a database.
 */

export type EnrollmentErrorCode =
  | "invalid-details"
  | "email-taken"
  | "orphaned-account";

/**
 * A failure the CALLER should turn into a response.
 *
 * `status` is carried so an app's error handler can map it without a lookup
 * table, and the codes are stable so an app can map them differently if it
 * wants to.
 */
export class EnrollmentError extends Error {
  readonly status: number;
  readonly code: EnrollmentErrorCode;
  /** Which form field to attach the message to, when there is one. */
  readonly field?: PersonField;
  /**
   * The error underneath, when this one is a translation of another.
   *
   * Declared rather than passed to `super`: the `cause` constructor option is
   * ES2022 and this package compiles against the ES2020 lib the rest of the
   * repo uses. Assigning it produces the same property Node reads when it
   * prints a chained stack.
   */
  readonly cause?: unknown;

  constructor(
    message: string,
    code: EnrollmentErrorCode,
    status: number,
    options: { field?: PersonField; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "EnrollmentError";
    this.code = code;
    this.status = status;
    this.field = options.field;
    this.cause = options.cause;
  }
}

/**
 * The slice of an account model this needs — three methods, not a Mongoose
 * model.
 *
 * Narrow on purpose: it is the whole reason this file imports nothing from
 * Mongoose and can be tested against an object literal. A Mongoose model
 * satisfies it structurally, so an app passes `Users` directly.
 */
export interface AccountStore<TAccount> {
  findByEmail(email: string): Promise<TAccount | null>;
  create(doc: Record<string, unknown>): Promise<TAccount>;
  /** Used only to undo a create whose attached record then failed. */
  deleteById(id: unknown): Promise<unknown>;
}

export interface EnrollmentDeps<TAccount> {
  accounts: AccountStore<TAccount>;
  /** bcrypt, argon2, whatever the app already uses. */
  hashPassword: (plaintext: string) => Promise<string>;
  /** Cryptographically random. `crypto.randomBytes(32).toString("hex")`. */
  randomToken: () => string;
  /** Injected so expiry assertions do not depend on wall-clock timing. */
  now?: () => Date;
  /**
   * How to read the id off a created account, for the rollback path.
   *
   * Defaults to `_id`, which is every Mongoose document.
   */
  idOf?: (account: TAccount) => unknown;
  /**
   * Did this write fail because the address was taken between the check and
   * the create?
   *
   * Defaults to MongoDB's duplicate-key code. Overridable because the store is
   * not required to be Mongo — the interface above says nothing about it.
   */
  isDuplicateKey?: (error: unknown) => boolean;
}

/**
 * Fields the caller may not supply, because this module derives them and a
 * caller-supplied value would silently win.
 *
 * `passwordHash` and the token fields are the security-relevant half: an app
 * passing its own `passwordHash` through `accountFields` would reintroduce
 * exactly the seeded-password problem this package exists to make
 * unexpressible. `email` and `name` are here because they are derived from the
 * checked identity, and a second copy would be the unchecked one.
 */
const RESERVED_ACCOUNT_FIELDS = [
  "name",
  "email",
  "passwordHash",
  "magicToken",
  "magicTokenExpiry",
  "resetToken",
  "resetTokenExpiry",
] as const;

export interface EnrollmentInput<TAccount, TAttached> {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phoneNumber?: unknown;

  /** The role NAME the account holds. RBAC resolves permissions from it. */
  role?: string;
  /** `staff`, `student`, `client` — whatever this app's `userType` enum says. */
  accountType?: string;
  /** The organization, by the field name this app's schema uses. */
  tenant?: { field: string; value: unknown };

  credential: CredentialSpec;

  /** Anything else this app's account carries — working hours, zones. */
  accountFields?: Record<string, unknown>;

  identityOptions?: IdentityOptions;

  /**
   * The domain record that lives beside the account — a Student, a Client.
   *
   * Runs AFTER the account exists, because it needs the account's id. If it
   * throws, the account is deleted before the error propagates.
   *
   * That compensation is the reason this is a hook rather than something the
   * caller does after `enroll` returns. Written by hand, the sequence leaves an
   * orphaned account behind on failure — and because the address is now taken,
   * every retry fails as "already registered" while the person has no usable
   * record. The person is stuck until somebody deletes the row by hand.
   */
  onAccountCreated?: (account: TAccount) => Promise<TAttached>;
}

export interface EnrollmentResult<TAccount, TAttached> {
  account: TAccount;
  /** Normalized. Use THIS to address mail, not the raw request body. */
  identity: PersonIdentity;
  /**
   * What to put in the invitation link.
   *
   * `token` is absent for a self-chosen password, because there is nothing to
   * send. The plaintext password is deliberately NOT here: for a provisioned
   * account it was random bytes that no longer exist anywhere.
   */
  credential: { kind: CredentialKind; token?: string; expiresAt?: Date };
  /** Whatever `onAccountCreated` returned. */
  attached: TAttached;
}

/**
 * Build an `enroll` bound to one app's account model and hashing.
 *
 *   const enroll = createEnrollment({
 *     accounts: Users,
 *     hashPassword: (p) => bcrypt.hash(p, 10),
 *     randomToken: () => crypto.randomBytes(32).toString("hex"),
 *   });
 */
export function createEnrollment<TAccount>(deps: EnrollmentDeps<TAccount>) {
  const {
    accounts,
    hashPassword,
    randomToken,
    now = () => new Date(),
    idOf = (account: TAccount) => (account as { _id?: unknown })._id,
    isDuplicateKey = (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === 11000,
  } = deps;

  return async function enroll<TAttached = undefined>(
    input: EnrollmentInput<TAccount, TAttached>,
  ): Promise<EnrollmentResult<TAccount, TAttached>> {
    const check = checkIdentity(input, input.identityOptions);
    if (!check.ok) {
      throw new EnrollmentError(check.reason, "invalid-details", 400, {
        field: check.field,
      });
    }
    const { identity } = check;

    for (const key of RESERVED_ACCOUNT_FIELDS) {
      if (input.accountFields && key in input.accountFields) {
        // Not an EnrollmentError: this is a mistake in the calling code, not
        // something a user did, and it must never reach a 4xx response.
        throw new Error(`accountFields may not set "${key}" — enroll derives it`);
      }
    }

    const existing = await accounts.findByEmail(identity.email);
    if (existing) {
      throw new EnrollmentError(
        "An account with that email already exists.",
        "email-taken",
        409,
        { field: "email" },
      );
    }

    const grant = resolveCredential(input.credential, { randomToken, now });
    const passwordHash = await hashPassword(grant.plaintext);

    const doc: Record<string, unknown> = {
      ...input.accountFields,
      name: joinName(identity.firstName, identity.lastName),
      email: identity.email,
      passwordHash,
      // An enrolled account has not proven it owns the address yet — following
      // the link is what proves it. Set explicitly rather than left to the
      // schema default so this is a decision on the record, not an omission.
      isVerified: false,
      ...(input.role !== undefined ? { roles: input.role } : {}),
      ...(input.accountType !== undefined ? { userType: input.accountType } : {}),
      ...(identity.phoneNumber ? { phoneNumber: identity.phoneNumber } : {}),
      ...(input.tenant ? { [input.tenant.field]: input.tenant.value } : {}),
      ...grant.fields,
    };

    let account: TAccount;
    try {
      account = await accounts.create(doc);
    } catch (error) {
      // The check above passed and the write still collided: someone enrolled
      // the same address in between. Same answer as the check, not a 500.
      if (isDuplicateKey(error)) {
        throw new EnrollmentError(
          "An account with that email already exists.",
          "email-taken",
          409,
          { field: "email", cause: error },
        );
      }
      throw error;
    }

    let attached: TAttached;
    try {
      attached = input.onAccountCreated
        ? await input.onAccountCreated(account)
        : (undefined as TAttached);
    } catch (error) {
      try {
        await accounts.deleteById(idOf(account));
      } catch (cleanupError) {
        // Both failed. The account IS orphaned, so say so loudly rather than
        // reporting the original error and leaving the row to be discovered
        // later as an unexplained "already registered".
        throw new EnrollmentError(
          `Could not create the record for ${identity.email}, and could not ` +
            `remove the account created for it. The account is orphaned and ` +
            `must be deleted by hand before this address can be enrolled again.`,
          "orphaned-account",
          500,
          { cause: cleanupError },
        );
      }
      throw error;
    }

    return {
      account,
      identity,
      credential: {
        kind: grant.kind,
        ...(grant.token !== undefined ? { token: grant.token } : {}),
        ...(grant.expiresAt !== undefined ? { expiresAt: grant.expiresAt } : {}),
      },
      attached,
    };
  };
}
