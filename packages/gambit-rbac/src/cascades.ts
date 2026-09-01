import { CascadeOperation, SequentialCascade } from "@guisao-llc/gambit-cascade";

/**
 * Deleting a role, and deleting a permission.
 *
 * Both exist because roles and permissions are referenced BY STRING, not by
 * id: a role is identified downstream by its `name`, and a permission by its
 * `key`, which roles store in a plain array. Mongo will not clean either up,
 * so removing one means purging strings out of documents that point at it.
 *
 * Both cascades therefore run keyed on a STRING rather than an ObjectId, which
 * is why the runner is generic over its arguments at all.
 */

/** The narrowest slice of a mongoose model these cascades need. */
export interface RoleCollection {
  deleteOne(filter: Record<string, unknown>): Promise<unknown>;
  updateMany(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface PermissionCollection {
  deleteOne(filter: Record<string, unknown>): Promise<unknown>;
}

export interface RoleDeletionConfig {
  /** The app's role model. */
  roleModel: RoleCollection;
  /**
   * Remove `roleName` from every account that currently holds it.
   *
   * INJECTED, and this is the seam that made the whole RBAC vertical portable.
   * Clearing a deleted role off the accounts holding it is genuinely RBAC's
   * business — but the ACCOUNT MODEL is not. One app's carries a school id and
   * an account kind; another's carries something else entirely. So the cascade
   * asks for one capability and the app supplies it.
   *
   * Accounts left with no role fall back to "no permissions", which is the
   * safer default: a stale role string would otherwise reach the resolver,
   * which cannot resolve it and cannot report that it failed to.
   */
  clearRoleFromAccounts: (roleName: string) => Promise<void>;
}

class ClearRoleFromAccounts implements CascadeOperation<[string]> {
  constructor(private readonly clear: RoleDeletionConfig["clearRoleFromAccounts"]) {}
  async execute(roleName: string) {
    await this.clear(roleName);
  }
}

/** Runs LAST, so the name is still resolvable for every leaf before it. */
class DeleteRoleRecord implements CascadeOperation<[string]> {
  constructor(private readonly roleModel: RoleCollection) {}
  async execute(roleName: string) {
    await this.roleModel.deleteOne({ name: roleName });
  }
}

/**
 * Clear the role off its accounts, THEN delete it.
 *
 * The ordering is load-bearing. Both steps resolve the role by NAME, so
 * deleting the document first destroys the only handle the account step has —
 * leaving every holder pointing at a role that no longer exists.
 */
export function buildRoleDeletion(config: RoleDeletionConfig): SequentialCascade<[string]> {
  return new SequentialCascade<[string]>([
    new ClearRoleFromAccounts(config.clearRoleFromAccounts),
    new DeleteRoleRecord(config.roleModel),
  ]);
}

export interface PermissionDeletionConfig {
  roleModel: RoleCollection;
  permissionModel: PermissionCollection;
}

/**
 * Pull the key out of every role that holds it.
 *
 * A boot-time catalog sync typically prunes unknown keys too, but only on the
 * NEXT boot. This is the runtime mirror, so an authorization decision made a
 * second after the delete does not consult a key that is gone.
 */
class PurgeKeyFromRolePermissions implements CascadeOperation<[string]> {
  constructor(private readonly roleModel: RoleCollection) {}
  async execute(permissionKey: string) {
    await this.roleModel.updateMany(
      { permissions: permissionKey },
      { $pull: { permissions: permissionKey } },
    );
  }
}

/** Runs LAST, for the same reason DeleteRoleRecord does. */
class DeletePermissionRecord implements CascadeOperation<[string]> {
  constructor(private readonly permissionModel: PermissionCollection) {}
  async execute(permissionKey: string) {
    await this.permissionModel.deleteOne({ key: permissionKey });
  }
}

export function buildPermissionDeletion(
  config: PermissionDeletionConfig,
): SequentialCascade<[string]> {
  return new SequentialCascade<[string]>([
    new PurgeKeyFromRolePermissions(config.roleModel),
    new DeletePermissionRecord(config.permissionModel),
  ]);
}
