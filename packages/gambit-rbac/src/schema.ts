import { Schema, SchemaDefinitionProperty } from "mongoose";

/**
 * The two records RBAC keeps: a role, and a permission.
 *
 * Schema FRAGMENTS rather than models, for the reason the account and person
 * fragments are: a role belongs to a TENANT, and the tenant is the one thing
 * this package cannot know. One app scopes roles by school, another by
 * practice. A model defined here would have to pick, and picking means every
 * other app carries a field named after somebody else's domain.
 *
 * The app builds the model:
 *
 *   const roleSchema = new Schema(
 *     roleFields({ tenant: { field: "schoolId", ref: "Schools" } }),
 *     { timestamps: true },
 *   );
 *   roleSchema.index({ name: 1, schoolId: 1 }, { unique: true, sparse: true });
 *   export const Roles = mongoose.model("Roles", roleSchema);
 *
 * and hands it to whatever here needs one.
 */

export interface RoleFieldsConfig {
  /**
   * Scope roles to an organization. Omit for an app whose roles are global.
   *
   * Optional rather than required because a single-tenant app has no such
   * concept, and forcing one on it would mean a field nothing ever sets.
   */
  tenant?: {
    field: string;
    ref?: string;
  };
}

/**
 * Build the role fields for spreading into an app's schema.
 *
 * `permissions` holds permission KEY STRINGS, not references. That is
 * deliberate and it propagates: because a role is identified downstream by its
 * name and its permissions by their keys, deleting either one has to purge
 * strings out of arrays rather than rely on referential integrity. The cascades
 * in this package exist for exactly that reason.
 */
export function roleFields(
  config: RoleFieldsConfig = {},
): Record<string, SchemaDefinitionProperty> {
  const { tenant } = config;

  const fields: Record<string, SchemaDefinitionProperty> = {
    name: { type: String, required: true },
    /** Permission keys, e.g. "invoices:read". Strings, not refs — see above. */
    permissions: { type: [String], default: [] },
    /** A role every tenant sees, rather than one belonging to a single tenant. */
    isGlobal: { type: Boolean, default: false },
    /**
     * Skip the host app's entitlement check entirely.
     *
     * Only meaningful in an app that HAS entitlements (see `createAuthorize`'s
     * `checkEntitlement`). Keep it off the API surface: a role that can grant
     * itself this can grant itself everything the entitlement layer was
     * protecting.
     */
    bypassFeatureChecks: { type: Boolean, default: false },
    /** Whether the role can be handed out through the app's UI. */
    assignable: { type: Boolean, default: true },
  };

  if (tenant) {
    fields[tenant.field] = {
      type: Schema.Types.ObjectId,
      ...(tenant.ref ? { ref: tenant.ref } : {}),
    };
  }

  return fields;
}

/**
 * The actions a permission can express.
 *
 * `add` is in this list because a catalog that uses it and a schema that
 * forbids it is a lie waiting to be found. In the app this was extracted from,
 * fourteen permissions declared `action: "add"` against an enum of
 * `["read", "write", "delete"]` — and nothing failed, because the sync path
 * used `bulkWrite`, which does not run validators by default. The enum was
 * simply not enforced. Any validated write would have rejected those fourteen.
 */
export const PERMISSION_ACTIONS = ["read", "add", "write", "delete"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export interface PermissionFieldsConfig {
  /** Override the permitted actions if an app needs a different vocabulary. */
  actions?: readonly string[];
}

/**
 * Build the permission fields. No tenant: a permission is a definition, not a
 * grant. Which ROLE holds it is the tenant-scoped part, and that lives on the
 * role.
 */
export function permissionFields(
  config: PermissionFieldsConfig = {},
): Record<string, SchemaDefinitionProperty> {
  const { actions = PERMISSION_ACTIONS } = config;

  return {
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    group: { type: String, required: true },
    action: { type: String, enum: [...actions], required: true },
  };
}
