/**
 * Who a person is, before they have an account. PURE — no models, no request,
 * no database; it decides whether the details on the form are usable and says
 * why when they are not.
 *
 * Separated from `enrollment.ts` for the same reason `password-policy` is
 * separate from the controller that hashes: a signup form wants to check these
 * rules in the browser, and a rule that needs a database cannot run there.
 * `checkIdentity` is the same function on both sides, so the two cannot drift.
 */

/** The fields a check can be attached to, so a form can highlight the box. */
export type PersonField = "firstName" | "lastName" | "email" | "phoneNumber";

/**
 * A person, normalized.
 *
 * `email` is lowercased and trimmed here and nowhere else. In the app this was
 * extracted from, `email.toLowerCase()` appears at eight call sites across
 * three controllers — some on the lookup and not the write, some the reverse.
 * A single normalization point is the only way "already registered" and
 * "created" agree about what counts as the same address.
 */
export interface PersonIdentity {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
}

export type IdentityCheck =
  | { ok: true; identity: PersonIdentity }
  /** `reason` is written to be shown to the user as-is. */
  | { ok: false; field: PersonField; reason: string };

/**
 * The one place an address is folded to its canonical form.
 *
 * Trim as well as lowercase: a trailing space pasted from a spreadsheet
 * produces an address that looks identical in every UI and matches nothing.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The display name, from the parts.
 *
 * The account record stores one `name` while the person record stores the
 * parts, so something has to join them. Doing it here means every app joins
 * them the same way, and — more importantly — that the join happens in exactly
 * one direction. Splitting a joined name back apart is a guess, which is why
 * `personFields` refuses to store `name` at all.
 */
export function joinName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

/**
 * Deliberately permissive: one `@`, something either side, no whitespace.
 *
 * The address is proven by mail arriving at it, not by a pattern. A stricter
 * regex rejects valid addresses — plus-tags, new TLDs, quoted locals — and
 * still accepts unreachable ones, so it buys nothing and costs enrollments.
 */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export interface IdentityOptions {
  /**
   * Whether a phone number is required.
   *
   * Off by default. It is required where staff enroll people they will call to
   * schedule; an app whose people only ever get email should not be forced to
   * collect it.
   */
  requirePhone?: boolean;
}

/**
 * Are these details usable as a person?
 *
 * Returns the NORMALIZED identity on success rather than just `ok`, so a caller
 * cannot accidentally go on to use the raw input it passed in. That is the
 * whole point of returning it: the check and the normalization are one step,
 * and there is no version of this flow where you have validated the email but
 * are still holding the un-lowercased one.
 */
export function checkIdentity(
  input: {
    firstName?: unknown;
    lastName?: unknown;
    email?: unknown;
    phoneNumber?: unknown;
  },
  options: IdentityOptions = {},
): IdentityCheck {
  const { requirePhone = false } = options;

  const text = (value: unknown): string =>
    typeof value === "string" ? value.trim() : "";

  const firstName = text(input.firstName);
  const lastName = text(input.lastName);
  const email = text(input.email);
  const phoneNumber = text(input.phoneNumber);

  if (!firstName) {
    return { ok: false, field: "firstName", reason: "Enter a first name." };
  }
  if (!lastName) {
    return { ok: false, field: "lastName", reason: "Enter a last name." };
  }
  if (!email) {
    return { ok: false, field: "email", reason: "Enter an email address." };
  }
  if (!isPlausibleEmail(email)) {
    return {
      ok: false,
      field: "email",
      reason: "That does not look like an email address.",
    };
  }
  if (requirePhone && !phoneNumber) {
    return {
      ok: false,
      field: "phoneNumber",
      reason: "Enter a phone number.",
    };
  }

  return {
    ok: true,
    identity: {
      firstName,
      lastName,
      email: normalizeEmail(email),
      ...(phoneNumber ? { phoneNumber } : {}),
    },
  };
}
