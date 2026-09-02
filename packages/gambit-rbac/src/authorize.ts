import { Request, RequestHandler } from "express";
import { HttpError } from "@guisao-llc/gambit-auth";
import { CachedRole, getCachedRole, hasAnyPermission, hasPermission } from "./permission-cache";

/**
 * The authorization middleware pair.
 *
 * Knows nothing about tenants, features, or any permission catalog. Everything
 * app-specific arrives through config: how a token is verified, and an optional
 * entitlement check that runs only after the permission check has passed.
 *
 * The two guards it returns differ in ways that are easy to collapse by
 * accident. They are kept as distinct match policies over a shared preamble —
 * see each one.
 */

/** The minimum a decoded token must carry. Apps extend this with their own. */
export interface AuthClaims {
  roles?: string;
}

export interface EntitlementContext<TClaims> {
  /** The permission(s) the route is gated on. */
  required: string[];
  /**
   * The permission(s) that actually DECIDED access — what an entitlement check
   * should price. For `authorize` this is the REQUIREMENT, not whatever the
   * role happened to hold: a `:read` granted by group access still gates on the
   * requirement's entitlement.
   */
  matched: string[];
  roleName: string;
  role: CachedRole | undefined;
  claims: TClaims;
}

/** Return an HttpError to deny, or null to allow. */
export type EntitlementCheck<TClaims> = (
  ctx: EntitlementContext<TClaims>,
) => Promise<HttpError | null> | HttpError | null;

export interface AuthorizeConfig<TClaims extends AuthClaims> {
  /** Verify the raw Authorization header and resolve the claims. Throws to reject. */
  verifyToken: (authorization: string) => Promise<TClaims>;
  /** Optional second layer, run only after the permission check passes. */
  checkEntitlement?: EntitlementCheck<TClaims>;
  /**
   * Accept any permission in the same group for a `:read` requirement.
   *
   * Off by default, because it WIDENS access and a shared package must not
   * widen access silently. Turn it on in an app whose UI no longer grants
   * `<group>:read` keys directly — there, holding `invoices:write` is the only
   * way anyone ends up able to read invoices at all.
   */
  readImpliesGroupAccess?: boolean;
  /**
   * A role that passes every permission check.
   *
   * Defaults to NEVER, and that default is the important part. One consuming
   * app marks such roles with `isGlobal`; the other app has an `isGlobal` flag
   * too and means something completely different by it — a role that is not
   * scoped to a single tenant, with no elevated rights at all. If this package
   * assumed either meaning, the other app's ordinary roles would silently
   * become superusers.
   *
   * So the flag is transported on `CachedRole` and interpreted only here, by
   * the app that knows what it means:
   *
   *   isSuperRole: (role) => role?.isGlobal === true
   *
   * An app that says nothing gets no bypass, which is the safe direction to be
   * wrong in.
   *
   * The entitlement check still runs afterwards. These are separate layers: a
   * role exempt from PERMISSION checks has not necessarily paid for the
   * feature, and collapsing the two would make one flag quietly do two jobs.
   */
  isSuperRole?: (role: CachedRole | undefined, roleName: string) => boolean;
}

/** Any permission in the same group satisfies a `:read` requirement. */
function hasGroupAccess(roleName: string, permission: string): boolean {
  if (hasPermission(roleName, permission)) return true;
  const group = permission.split(":")[0];
  const cached = getCachedRole(roleName);
  if (!cached) return false;
  for (const p of cached.permissions) {
    if (p.startsWith(`${group}:`)) return true;
  }
  return false;
}

/**
 * Build the `authorize` / `authorizeAny` pair for one app.
 *
 * Returns middleware factories with the signatures route files already use, so
 * adopting this changes no route.
 */
export function createAuthorize<TClaims extends AuthClaims>(
  config: AuthorizeConfig<TClaims>,
) {
  const {
    verifyToken,
    checkEntitlement,
    readImpliesGroupAccess = false,
    isSuperRole = () => false,
  } = config;

  /**
   * Everything the two guards share: header presence, verification, claims,
   * the role check, the entitlement hand-off, and the error mapping. `match` is
   * the only part that varies — it returns the permissions that decided access,
   * or null to deny.
   */
  const guard = (
    required: string[],
    match: (roleName: string) => string[] | null,
  ): RequestHandler => {
    return async (req, _res, next) => {
      const { authorization } = req.headers;

      if (!authorization) {
        return next(new HttpError("Not authorized", 401));
      }

      try {
        const claims = await verifyToken(authorization);
        // The host app types `Request.user` through its own augmentation, which
        // this package cannot see. Writing the key without declaring its type
        // is deliberate — see gambit-auth's createAuthenticate.
        (req as unknown as Record<string, unknown>).user = claims;
        const roleName = claims.roles;

        if (!roleName) {
          return next(new HttpError("No role assigned to this user", 403));
        }

        // A super role skips the permission check entirely — but NOT the
        // entitlement check below, which is a separate question.
        const matched = isSuperRole(getCachedRole(roleName), roleName)
          ? required
          : match(roleName);
        if (!matched) {
          return next(
            new HttpError("You do not have permission to perform this action", 403),
          );
        }

        if (checkEntitlement) {
          const denial = await checkEntitlement({
            required,
            matched,
            roleName,
            role: getCachedRole(roleName),
            claims,
          });
          if (denial) return next(denial);
        }

        next();
      } catch {
        return next(new HttpError("Unauthorized", 401));
      }
    };
  };

  /**
   * Requires the exact permission — unless `readImpliesGroupAccess` is on and
   * the requirement ends in `:read`, in which case any permission in the same
   * group satisfies it. Non-read requirements are always strict.
   */
  const authorize = (permission: string): RequestHandler =>
    guard([permission], (roleName) => {
      const granted =
        readImpliesGroupAccess && permission.endsWith(":read")
          ? hasGroupAccess(roleName, permission)
          : hasPermission(roleName, permission);
      return granted ? [permission] : null;
    });

  /**
   * Requires ANY ONE of the listed permissions.
   *
   * Two deliberate differences from `authorize`, kept explicit rather than
   * unified because collapsing them would silently change who gets through:
   * the match is STRICT — no group-prefix fallback, ever — and the entitlement
   * check is priced on every listed permission the role actually holds, rather
   * than on a single requirement.
   */
  const authorizeAny = (permissions: string[]): RequestHandler =>
    guard(permissions, (roleName) => {
      if (!hasAnyPermission(roleName, permissions)) return null;
      const role = getCachedRole(roleName);
      return permissions.filter((p) => role?.permissions.has(p));
    });

  return { authorize, authorizeAny };
}

/** `Request` re-exported so consumers can type their own entitlement checks. */
export type { Request };
