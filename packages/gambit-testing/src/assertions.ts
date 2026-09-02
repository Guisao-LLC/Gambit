/**
 * What counts as allowed, and what counts as denied.
 *
 * These are the rules that took the longest to get right in the app this came
 * from, and every one of them was wrong at least once. They are pure functions
 * over a response object, so they work under jest, vitest, node:test or a bare
 * assertion — nothing here touches a test framework.
 */

/** The minimum this needs from a supertest (or any) response. */
export interface HttpResponseLike {
  status: number;
  body?: unknown;
}

/**
 * The exact messages the authorization layer emits.
 *
 * A 401/403 carrying one of these means AUTHORIZATION rejected the request.
 * Any OTHER 401/403 is a downstream business rule — "you can only view your
 * own school", "not found" carrying a 401 — and those are not the gate's
 * doing, so they count as having passed it.
 *
 * Matching on message rather than status is what makes the distinction
 * possible at all. Keep this in step with the strings in gambit-rbac.
 */
export const AUTHORIZE_DENY_MESSAGES: ReadonlySet<string> = new Set([
  "Not authorized",
  "Unauthorized",
  "No role assigned to this user",
  "You do not have permission to perform this action",
]);

function messageOf(res: HttpResponseLike): string {
  const body = res.body as { message?: unknown } | undefined;
  return typeof body?.message === "string" ? body.message : "";
}

/**
 * "Allow" means JUST PAST the gate — not that the request succeeded.
 *
 * A controller may still 404, 400 or 422 for its own reasons, and that is
 * fine: the question is whether authorization let it through. So anything
 * other than an authorization-emitted 401/403 counts.
 *
 * 5xx is rejected, and that exception is load-bearing. A missing mock makes a
 * handler throw, which produces a 500 — and a 500 is "not a 401/403", so
 * without this it reads as a PASS. A whole grid can go green while testing
 * nothing at all.
 */
export interface AllowOptions {
  /** Named in the failure message, so a grid says WHICH permission failed. */
  context?: string;
  /**
   * Additional messages that mean "a gate rejected this".
   *
   * REQUIRED for any app with an entitlement layer, and the reason is subtle
   * enough to be worth stating: an entitlement denial is a 403 carrying an
   * app-specific message. Without it listed here, this function classifies it
   * as a downstream business rule and returns SUCCESSFULLY — so an ALLOW test
   * passes on a request that was actually refused.
   *
   * That is the same shape as the 5xx trap below: a denial slipping through as
   * an allow because it did not look like one.
   */
  denyMessages?: readonly string[];
}

export function expectAllow(
  res: HttpResponseLike,
  options: string | AllowOptions = {},
): void {
  const { context = "", denyMessages = [] } =
    typeof options === "string" ? { context: options } : options;
  const where = context ? ` [${context}]` : "";

  if (res.status === 401 || res.status === 403) {
    const msg = messageOf(res);
    if (AUTHORIZE_DENY_MESSAGES.has(msg) || denyMessages.includes(msg)) {
      throw new Error(
        `expectAllow${where}: got ${res.status} from the authorization layer ("${msg}").`,
      );
    }
    return; // downstream business rule — the gate passed
  }

  if (res.status >= 500) {
    throw new Error(
      `expectAllow${where}: got ${res.status}. A server error is not an allow — ` +
        `it usually means a missing mock, and it would otherwise pass this ` +
        `assertion by not being a 401 or 403. body: ${JSON.stringify(res.body)}`,
    );
  }
}

export function expectDeny401(res: HttpResponseLike, context = ""): void {
  if (res.status !== 401) {
    throw new Error(
      `expectDeny401${context ? ` [${context}]` : ""}: got ${res.status}. ` +
        `body: ${JSON.stringify(res.body)}`,
    );
  }
}

export function expectDeny403(res: HttpResponseLike, context = ""): void {
  if (res.status !== 403) {
    throw new Error(
      `expectDeny403${context ? ` [${context}]` : ""}: got ${res.status}. ` +
        `body: ${JSON.stringify(res.body)}`,
    );
  }
}

/**
 * The outcome for a role holding an ADJACENT permission — one in the same
 * group as the requirement, but not the requirement itself.
 *
 * The answer is not always "denied", and the exceptions are policy rather than
 * leaks. Two flags decide it, and BOTH matter:
 *
 *   `readImpliesGroupAccess` — when an app enables it, any permission in a
 *   group satisfies that group's `:read`. Holding `invoices:write` then reaches
 *   a route guarded by `invoices:read`.
 *
 *   `usesAny` — `authorizeAny` is STRICT regardless. A route that already
 *   accepts several permissions has stated its full list, so widening it again
 *   would accept keys nobody listed.
 *
 * Both parameters are REQUIRED, with no defaults. Omitting the second is
 * exactly the bug this helper was written to stop: a version without it
 * predicted "allow" on every authorizeAny `:read` route while the guard
 * correctly denied, and the tests were changed to match the helper rather than
 * the other way round.
 */
export function expectAdjacentPermOutcome(
  res: HttpResponseLike,
  options: {
    requiredPermissions: string[];
    adjacentPerm: string;
    usesAny: boolean;
    readImpliesGroupAccess: boolean;
    context?: string;
    denyMessages?: readonly string[];
  },
): void {
  const {
    requiredPermissions,
    adjacentPerm,
    usesAny,
    readImpliesGroupAccess,
    context,
    denyMessages,
  } = options;

  const groupOf = (perm: string) => perm.split(":")[0];
  const requirementIsRead = requiredPermissions.every((p) => p.endsWith(":read"));
  const sameGroup = requiredPermissions.some(
    (p) => groupOf(p) === groupOf(adjacentPerm),
  );

  if (readImpliesGroupAccess && !usesAny && requirementIsRead && sameGroup) {
    expectAllow(res, { context, denyMessages });
    return;
  }
  expectDeny403(res, context);
}
