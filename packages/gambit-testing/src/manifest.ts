/**
 * The route manifest: every authorization-gated route, and what gates it.
 *
 * An app writes one of these and gets a whole grid of assertions from it. The
 * manifest is the app's data — its routes, its permission keys — but the SHAPE
 * is the same everywhere, and so is everything derived from it.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteEntry {
  method: HttpMethod;
  /** The full mounted path, e.g. "/api/patients/:id". */
  path: string;
  /**
   * The permission(s) gating this route.
   *
   * For a composite guard, list the LEAF permission the authorization layer
   * actually checks, not the name of the wrapper — a grid that asserts against
   * a wrapper is asserting against a name, not a rule.
   */
  requiredPermissions: string[];
  /** True for `authorizeAny` (holder needs ONE of them); false for `authorize`. */
  usesAny: boolean;
  /** Optional entitlement key, where the app has an entitlement layer. */
  featureKey?: string;
  /** Body factory for routes that reject an empty body before reaching the gate. */
  sampleBody?: () => unknown;
  /** Source file the route was read from. Used by drift detection. */
  sourceFile: string;
}

/**
 * Concrete values substituted into `:param` segments.
 *
 * Defaults are 24-char hex because a controller that casts a path param to an
 * ObjectId will THROW on anything else — producing a 500, which reads as an
 * authorization failure when authorization had already passed. That mistake
 * cost three routes a spurious red in the app this came from.
 */
export const DEFAULT_PARAM_VALUES: Record<string, string> = {
  ":id": "64f000000000000000000789",
  ":pid": "64f000000000000000000789",
};

/** Substitute `:param` tokens with concrete values, longest name first. */
export function resolvePath(
  path: string,
  values: Record<string, string> = DEFAULT_PARAM_VALUES,
): string {
  // Longest first, so `:studentId` is not half-eaten by a `:student` entry.
  const params = Object.keys(values).sort((a, b) => b.length - a.length);
  let out = path;
  for (const param of params) out = out.split(param).join(values[param]);
  return out;
}

/** Every manifest row gated on `permission`. */
export function entriesForPermission(
  manifest: readonly RouteEntry[],
  permission: string,
): RouteEntry[] {
  return manifest.filter((r) => r.requiredPermissions.includes(permission));
}

/**
 * A permission in the same group as `input`, but not in it.
 *
 * Used to prove a route rejects a NEIGHBOUR rather than merely rejecting an
 * empty permission set — an assertion that would pass against a gate checking
 * nothing at all.
 */
export function pickAdjacentPerm(
  catalog: readonly { key: string; group: string }[],
  input: string | string[],
): string | undefined {
  const excluded = new Set(Array.isArray(input) ? input : [input]);
  const primaryKey = Array.isArray(input) ? input[0] : input;
  const primary = catalog.find((p) => p.key === primaryKey);

  const sameGroup = primary
    ? catalog.find((p) => p.group === primary.group && !excluded.has(p.key))
    : undefined;
  if (sameGroup) return sameGroup.key;

  // No sibling in the group — fall back to any other key. Returns undefined
  // rather than a fake so the caller can skip instead of asserting nonsense.
  return catalog.find((p) => !excluded.has(p.key))?.key;
}
