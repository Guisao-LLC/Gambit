/**
 * Contracts for the roles surface: a role list, a permission catalog, and the
 * groups the matrix folds them into.
 *
 * Extracted from two apps whose roles screens were ~83% identical and 17%
 * genuinely divergent — every divergence found during that extraction is
 * threaded through as a prop on the components that use these types, never
 * picked here. See `PermissionMatrix`, `RoleFormDialog`, `RolesPanel`.
 */

export interface RoleRecord {
  _id: string;
  name: string;
  permissions: string[];
  isGlobal?: boolean;
  /** A signup-default concept some hosts don't have; harmless extra field otherwise. */
  isDefault?: boolean;
}

export interface PermissionRecord {
  key: string;
  group: string;
  /** Matched by `p.action === action || p.key.endsWith(':'+action)`. */
  action?: string;
  label?: string;
}

/**
 * One row of the matrix. `members` folds one or more catalog `group` values
 * into a single displayed row — a row with zero matching permissions across
 * every action renders nothing at all, which is what lets a host's row list
 * safely lead its own permission catalog (see `PermissionMatrix`'s behavior).
 */
export interface RoleDisplayGroup {
  label: string;
  members: string[];
}

export interface RoleFormValues {
  name: string;
  permissions: string[];
  isGlobal: boolean;
  isDefault?: boolean;
}

/**
 * Every string this surface displays.
 *
 * Taken as a prop rather than through an i18n library — same rationale as
 * `ProfileLabels` in `../types.ts`: an app using i18next just spreads its own
 * `t()` results into it, and the package stays free of that dependency.
 *
 * `isGlobalTooltip` in particular has NO real-world default: `isGlobal` means
 * two different things across the hosts this was extracted from (one app's
 * SCOPE flag, another's AUTHORIZATION-BYPASS flag), so the default below is
 * deliberately neutral — every real caller is expected to override it with
 * its own actual meaning.
 */
export interface RolesLabels {
  featureColumn: string;
  addColumn: string;
  editColumn: string;
  deleteColumn: string;
  title: string;
  subtitle: string;
  newRole: string;
  noPermissions: string;
  editTitle: string;
  deleteTitle: string;
  roleName: string;
  permissionsHeading: string;
  cancel: string;
  create: string;
  saveChanges: string;
  readOnlyMessage: string;
  scopeGlobal: string;
  scopeNonGlobal: string;
  isGlobalLabel: string;
  isGlobalTooltip: string;
  /** Optional extra caption below the isGlobal switch. Undefined means "don't render". */
  isGlobalHelperText?: string;
  /** Optional info Alert shown above the matrix while isGlobal is true. Undefined means "don't render". */
  isGlobalActiveNote?: string;
  defaultRoleLabel: string;
  defaultRoleTooltip: string;
}

/** Generic English defaults, so a host can render with no labels at all. */
export const DEFAULT_ROLES_LABELS: RolesLabels = {
  featureColumn: "Feature",
  addColumn: "Add",
  editColumn: "Edit",
  deleteColumn: "Delete",
  title: "Roles",
  subtitle: "Configure roles and assign permissions",
  newRole: "New Role",
  noPermissions: "No permissions",
  editTitle: "Edit Role",
  deleteTitle: "Delete role",
  roleName: "Role Name",
  permissionsHeading: "Permissions",
  cancel: "Cancel",
  create: "Create",
  saveChanges: "Save Changes",
  readOnlyMessage: "Read-only — contact your administrator to request edit access.",
  scopeGlobal: "Global",
  scopeNonGlobal: "Standard",
  isGlobalLabel: "Global role",
  // Deliberately neutral — see the doc comment above. Every real caller
  // overrides this with its own actual meaning.
  isGlobalTooltip: "Applies without the default scoping rules.",
  defaultRoleLabel: "Default role for new signups",
  defaultRoleTooltip:
    "New signups are given this role. Only one role can be the default — turning it on here turns it off elsewhere.",
};
