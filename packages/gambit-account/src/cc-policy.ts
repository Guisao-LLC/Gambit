/**
 * Who gets copied on outgoing mail. PURE — given the two sources, returns the
 * final list. No database, no env, no models.
 *
 * Quick 260831-b7q — this replaces the `EMAIL_CC` environment variable, which
 * had two problems worth stating. It could only be changed by a redeploy, and
 * before quick 260826-nrv it hardcoded a personal address, so the list was
 * whatever one developer's machine happened to say. Neither is acceptable for
 * something that silently sends copies of every email a business writes.
 *
 * TWO SOURCES, deliberately:
 *
 *   1. People who opted in on their own profile. Self-service, and it cannot
 *      name someone who has left — a user record that is gone contributes
 *      nothing, where a typed address survives the person indefinitely.
 *   2. Extra addresses configured platform-wide, for recipients who are NOT
 *      users at all: a shared support inbox, an archive, an accountant.
 *
 * The opt-in half is why this is not simply "a list of addresses": being copied
 * on other people's correspondence should be a decision the recipient makes,
 * and one they can reverse without asking an administrator.
 */

/**
 * A hard ceiling on the CC list.
 *
 * SMTP providers reject or throttle large recipient lists, and a send that
 * fails because someone added a fiftieth watcher fails for the STUDENT the mail
 * was actually for. Truncating protects the primary recipient; the caller is
 * told what was dropped so it can be surfaced rather than hidden.
 */
export const MAX_CC_RECIPIENTS = 20;

export interface CcResolution {
  /** Final, deduplicated, ordered list to pass to the mail transport. */
  cc: string[];
  /** Addresses dropped for being over `MAX_CC_RECIPIENTS`. */
  dropped: string[];
  /** Inputs rejected as not being email addresses at all. */
  invalid: string[];
}

/**
 * Pragmatic address check: something, an @, something with a dot, no spaces.
 *
 * Deliberately NOT an RFC 5322 parser. A full parser accepts addresses no mail
 * provider will route and is a well-known source of catastrophic backtracking;
 * this rejects the realistic mistakes — blanks, missing @, a name pasted
 * instead of an address, two addresses jammed into one field.
 */
export function isPlausibleEmailAddress(value: string): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  if (/\s/.test(trimmed)) return false;
  return /^[^@,;]+@[^@,;.]+(\.[^@,;.]+)+$/.test(trimmed);
}

/** Lower-cased and trimmed, so `A@b.com` and `a@b.com` can't both be copied.
 *  Only the domain is case-insensitive per the RFC, but every provider in
 *  practice treats the local part that way too, and a duplicate copy is a worse
 *  outcome than the theoretical distinction. */
export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Build the CC list from the two sources.
 *
 * Opted-in people come FIRST so that if the cap truncates, the addresses kept
 * are the ones belonging to real accounts. Order is otherwise preserved, and
 * duplicates across the two sources collapse.
 *
 * `excluding` drops an address that is already a primary recipient — copying
 * someone on a message addressed to them delivers it twice.
 */
export function resolveCcRecipients(input: {
  /** Addresses of users who turned on "copy me". */
  optedIn?: string[];
  /** Platform-wide extras, which need not correspond to any user. */
  extras?: string[];
  /** Primary recipients (to/cc already set on the message). */
  excluding?: string[];
  max?: number;
}): CcResolution {
  const max = input.max ?? MAX_CC_RECIPIENTS;
  const invalid: string[] = [];

  const exclude = new Set(
    (input.excluding ?? [])
      .filter(isPlausibleEmailAddress)
      .map(normalizeEmailAddress),
  );

  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const raw of [...(input.optedIn ?? []), ...(input.extras ?? [])]) {
    if (!isPlausibleEmailAddress(raw)) {
      // An empty string is an absence, not a mistake — a cleared input box
      // shouldn't be reported back to the user as an invalid address.
      if (typeof raw === "string" && raw.trim().length > 0) invalid.push(raw);
      continue;
    }
    const address = normalizeEmailAddress(raw);
    if (exclude.has(address) || seen.has(address)) continue;
    seen.add(address);
    ordered.push(address);
  }

  return {
    cc: ordered.slice(0, max),
    dropped: ordered.slice(max),
    invalid,
  };
}

/**
 * Parse a comma or newline separated list, as typed into a settings textarea.
 * Returns the addresses in order with blanks removed; validation is the
 * caller's, via `resolveCcRecipients`, so one bad entry doesn't discard the
 * rest of what someone typed.
 */
export function parseAddressList(input: string): string[] {
  return (input ?? "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
