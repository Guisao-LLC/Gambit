import { RequestHandler } from "express";
import { HttpError } from "@guisao-llc/gambit-auth";
import { CachedRole, getCachedRole, hasAnyPermission, hasPermission } from "./permission-cache";

/**
 * @guisao-llc/gambit-rbac
 *
 * Roles, permissions, and the middleware that enforces them.
 *
 * The whole vertical is portable because every place it would otherwise reach
 * for something app-shaped, it takes that thing as configuration instead: the
 * cache is given a loader rather than a model, the cascades are given models
 * rather than importing them, and the role schema is a fragment so the app owns
 * its tenant field. What is left names no application.
 */

export {
  configurePermissionCache,
  getPermissions,
  hasPermission,
  hasAnyPermission,
  listRoleNamesWithPermission,
  getCachedRole,
  refreshCache,
  _seedCacheForTesting,
  _resetForTesting,
} from "./permission-cache";
export type { CachedRole, LoadedRole, PermissionCacheConfig } from "./permission-cache";

export { createAuthorize } from "./authorize";
export type {
  AuthClaims,
  AuthorizeConfig,
  EntitlementCheck,
  EntitlementContext,
} from "./authorize";

export { roleFields, permissionFields, PERMISSION_ACTIONS } from "./schema";
export type {
  RoleFieldsConfig,
  PermissionFieldsConfig,
  PermissionAction,
} from "./schema";

export { buildRoleDeletion, buildPermissionDeletion } from "./cascades";
export type {
  RoleDeletionConfig,
  PermissionDeletionConfig,
  RoleCollection,
  PermissionCollection,
} from "./cascades";

// ── Direct questions, for code that is not middleware ────────────────────────

/** Does this role hold the permission? Undefined role answers false. */
export function can(roleName: string | undefined, permission: string): boolean {
  if (!roleName) return false;
  return hasPermission(roleName, permission);
}

/** Does this role hold at least one of these? Undefined role answers false. */
export function canAny(roleName: string | undefined, permissions: string[]): boolean {
  if (!roleName) return false;
  return hasAnyPermission(roleName, permissions);
}

// ── Platform administration ──────────────────────────────────────────────────

export interface PlatformAdminConfig {
  /**
   * Decide whether a role is a platform administrator.
   *
   * Required, with no default, on purpose. This gate sits ABOVE every tenant —
   * it guards settings that affect all of them at once — so a package must not
   * guess at what qualifies. An app that gets this wrong grants the keys to
   * everything, and a silent default is exactly how that happens.
   */
  isPlatformAdmin: (role: CachedRole | undefined) => boolean;
  /** Where the role name lives on the request. Defaults to `req.user.roles`. */
  getRoleName?: (req: unknown) => string | undefined;
}

/**
 * "Is the caller a platform-level administrator?"
 *
 * Mount AFTER authentication — this never verifies a token itself, which keeps
 * exactly one place doing that.
 */
export function createRequirePlatformAdmin(config: PlatformAdminConfig): RequestHandler {
  const {
    isPlatformAdmin,
    getRoleName = (req) =>
      (req as { user?: { roles?: string } }).user?.roles,
  } = config;

  return (req, _res, next) => {
    const roleName = getRoleName(req);
    if (!roleName || !isPlatformAdmin(getCachedRole(roleName))) {
      return next(
        new HttpError("Only a platform administrator can change this setting", 403),
      );
    }
    return next();
  };
}
