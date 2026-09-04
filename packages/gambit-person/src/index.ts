/**
 * @guisao-llc/gambit-person
 *
 * A person, and how they come to have a login.
 *
 * `@guisao-llc/gambit-account` owns what an account IS — the fields, the
 * password rules, the profile page. This package owns the HUMAN attached to
 * one, and the act of enrolling them: the details you collect, the record you
 * keep beside the account, and the sequence that creates both and hands back a
 * link to send.
 *
 * The split is worth stating because it is not obvious from the names. An
 * account is a credential; a person is who holds it. An app can have accounts
 * with no person record behind them — a service account, a seed administrator —
 * and it can have people with no account yet.
 *
 * Everything at THIS entry point is browser-safe. The schema fragment needs
 * Mongoose as a value, so it lives at `@guisao-llc/gambit-person/mongoose` —
 * the same split `gambit-account` made after a re-exported schema dragged Node's
 * `events` into a client bundle and took two applications down with an error
 * naming neither Mongoose nor the package.
 *
 * `checkIdentity` in particular is meant to run on both sides: the same
 * function validates the form in the browser and guards the write on the
 * server, so the two cannot disagree about what a usable email is.
 */

export {
  normalizeEmail,
  joinName,
  isPlausibleEmail,
  checkIdentity,
} from "./identity";
export type {
  PersonField,
  PersonIdentity,
  IdentityCheck,
  IdentityOptions,
} from "./identity";

export {
  credentials,
  resolveCredential,
  DEFAULT_RESET_TTL_MS,
  DEFAULT_MAGIC_TTL_MS,
  TOKEN_BYTES,
} from "./credentials";
export type {
  CredentialKind,
  CredentialSpec,
  CredentialGrant,
  CredentialSources,
} from "./credentials";

export { createEnrollment, EnrollmentError } from "./enrollment";
export type {
  AccountStore,
  EnrollmentDeps,
  EnrollmentInput,
  EnrollmentResult,
  EnrollmentErrorCode,
} from "./enrollment";
