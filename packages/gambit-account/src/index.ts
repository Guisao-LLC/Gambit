/**
 * @guisao-llc/gambit-account
 *
 * What an account IS, and the rules for changing it.
 *
 * Four pieces, and they arrived together for a reason: this is the "my
 * profile" page, decomposed. A person changes their password, uploads a
 * picture, and decides whether to be copied on outgoing mail — three
 * decisions that are identical in every app, sitting on top of an account
 * record that is also mostly identical.
 *
 * Every module here is PURE: it takes values and returns a verdict. No models,
 * no request, no bcrypt, no `process.env`. That is what made them portable
 * without a rewrite — they were written this way deliberately, before there
 * was a package to put them in.
 *
 * What is NOT here, and should not be: hashing, the current-password
 * comparison, reading the upload off a request, and actually sending mail.
 * Those need a database, a hashing library, and a transport — mixing them in
 * would make these rules untestable without all three.
 */

export {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  checkNewPassword,
  checkPasswordConfirmation,
} from "./password-policy";
export type { PasswordCheck } from "./password-policy";

export {
  MAX_AVATAR_BYTES,
  ALLOWED_AVATAR_MIMES,
  stripDataUrlPrefix,
  base64ByteLength,
  isAllowedAvatarMime,
  checkAvatarUpload,
} from "./avatar-image";
export type { AvatarMime, AvatarCheck } from "./avatar-image";

export {
  MAX_CC_RECIPIENTS,
  isPlausibleEmailAddress,
  normalizeEmailAddress,
  resolveCcRecipients,
  parseAddressList,
} from "./cc-policy";
export type { CcResolution } from "./cc-policy";

export { baseAccountFields, applyAccountStatics } from "./base-account-fields";
export type {
  BaseAccount,
  AccountStatics,
  BaseAccountFieldsConfig,
} from "./base-account-fields";
