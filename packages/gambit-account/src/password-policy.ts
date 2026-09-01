/**
 * Password rules for a self-service change. PURE — no models, no bcrypt, no
 * request; it decides whether a proposed password is acceptable and says why
 * when it isn't.
 *
 * Hashing and the current-password check stay in the controller: those need
 * bcrypt and the stored user, and mixing them in here would make the rules
 * untestable without a database.
 *
 * Quick 260831-b7q — written for extraction. Nothing here knows about schools,
 * students, or Time2Drive, so a second app inherits the same rules rather than
 * inventing its own.
 */

/** Server-side floor. The User schema also declares minlength 6; this is the
 *  rule a human sees stated, and it must not be looser than the schema's. */
export const MIN_PASSWORD_LENGTH = 8;

/** Guards against a megabyte of text reaching bcrypt, which is slow by design.
 *  bcrypt itself only considers the first 72 bytes. */
export const MAX_PASSWORD_LENGTH = 200;

export interface PasswordCheck {
  ok: boolean;
  /** Present when `ok` is false. Written to be shown to the user as-is. */
  reason?: string;
}

/**
 * Is `next` acceptable as a new password?
 *
 * `current` is optional and used ONLY to reject a no-op change. It is the plain
 * text the user typed, never a hash — comparing hashes is the caller's job.
 *
 * Deliberately NOT enforcing a character-class mix (upper + digit + symbol).
 * Length is the property that actually resists guessing, and composition rules
 * push people toward predictable substitutions and written-down passwords. If a
 * policy is ever required by a customer, add it here and every caller inherits
 * it.
 */
export function checkNewPassword(next: string, current?: string): PasswordCheck {
  if (typeof next !== "string" || next.trim().length === 0) {
    return { ok: false, reason: "Enter a new password." };
  }
  // Length is measured on the RAW string: leading and trailing spaces are
  // legitimate password characters, so trimming would silently accept a
  // password the user cannot type back.
  if (next.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (next.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: `Use at most ${MAX_PASSWORD_LENGTH} characters.`,
    };
  }
  if (current !== undefined && current === next) {
    return { ok: false, reason: "That is already your current password." };
  }
  return { ok: true };
}

/** Do the two boxes on the form agree? Separated so the caller can attach the
 *  error to the confirmation field rather than the password field. */
export function checkPasswordConfirmation(
  next: string,
  confirmation: string,
): PasswordCheck {
  return next === confirmation
    ? { ok: true }
    : { ok: false, reason: "The passwords don't match." };
}
