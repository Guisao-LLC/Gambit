/**
 * @guisao-llc/gambit-ui
 *
 * Drop-in panels for the screens every app has.
 *
 * Two rules make these portable, and they are the same rules the server
 * packages follow:
 *
 *   NOTHING IS IMPORTED THAT THE APP OWNS. No HTTP client, no URL, no store, no
 *   i18n library, no router. The app passes a `client` object and, if it wants,
 *   its own strings. That is not tidiness — the two apps this came from mount
 *   their profile endpoints at DIFFERENT paths, so a hardcoded URL would have
 *   been wrong in one of them immediately.
 *
 *   VALIDATION IS THE SERVER'S OWN. These panels call `checkNewPassword` and
 *   `checkAvatarUpload` from @guisao-llc/gambit-account — the same functions
 *   the API calls — so the message someone reads before submitting is the
 *   message they would have got back. The form cannot disagree with the API
 *   about what is acceptable, because there is only one definition.
 *
 * MUI and React are peer dependencies: the app owns the versions and, more
 * importantly, the THEME. These components style with MUI tokens and inherit
 * whatever palette and typography the host provides.
 */

export { ProfileDetailsCard } from "./ProfileDetailsCard";
export type { ProfileDetailsCardProps } from "./ProfileDetailsCard";

export { ChangePasswordCard } from "./ChangePasswordCard";
export type { ChangePasswordCardProps } from "./ChangePasswordCard";

export { DEFAULT_LABELS } from "./types";
export type { Profile, Avatar, ProfileClient, ProfileLabels } from "./types";

/**
 * The roles surface: a permission matrix, a merged create/edit dialog, and
 * the panel that wires them to a role list. Every genuine divergence found
 * between the two hosts this was extracted from — read-key handling, the
 * create/edit isGlobal behavior, what "global" even means, who gates the
 * "new role" trigger — is threaded through as a prop, never picked. See each
 * component's own doc comment for the specific seam.
 */
export { PermissionMatrix } from "./roles/PermissionMatrix";
export type { PermissionMatrixProps } from "./roles/PermissionMatrix";
export { RoleFormDialog } from "./roles/RoleFormDialog";
export type { RoleFormDialogProps } from "./roles/RoleFormDialog";
export { RolesPanel } from "./roles/RolesPanel";
export type { RolesPanelProps } from "./roles/RolesPanel";
export { DEFAULT_ROLES_LABELS } from "./roles/types";
export type {
  RoleRecord,
  PermissionRecord,
  RoleDisplayGroup,
  RoleFormValues,
  RolesLabels,
} from "./roles/types";

/**
 * Person identity: one validation rule and one fields component, shared by
 * every form that enrolls or invites someone. Built on
 * @guisao-llc/gambit-person's `isPlausibleEmail` — the same permissive email
 * check the server runs — so a form can't disagree with the API about what
 * counts as a usable address.
 */
export { createPersonIdentitySchema } from "./personIdentity";
export type { PersonIdentitySchemaOptions } from "./personIdentity";
export { PersonIdentityFields } from "./PersonIdentityFields";
export type { PersonIdentityFieldsProps } from "./PersonIdentityFields";
