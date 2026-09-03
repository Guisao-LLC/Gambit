/**
 * What a host app has to supply.
 *
 * The components in this package never import an HTTP client and never know a
 * URL. That is the same rule the server packages run on — a shared module must
 * not PICK its dependency, it must be GIVEN it — and here it is not optional:
 * the two apps this was extracted from mount their profile endpoints at
 * DIFFERENT paths (`/api/profile/me` and `/api/profile`), so a component with
 * a hardcoded URL would have been wrong in one of them on day one.
 *
 * Each app builds this object from its own axios instance, with its own
 * interceptors and its own idea of how a token is attached.
 */

export interface Avatar {
  base64: string;
  mime: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  /** Shown, never edited here — a profile page says what you are. */
  roles?: string;
  avatar?: Avatar | null;
}

/** The five calls the panels make. Everything else is the app's business. */
export interface ProfileClient {
  load(): Promise<Profile>;
  /** Only the fields a person may change about themselves. */
  save(patch: { name?: string; phoneNumber?: string }): Promise<Profile>;
  uploadAvatar(image: Avatar): Promise<Avatar | null>;
  removeAvatar(): Promise<void>;
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<void>;
}

/**
 * Every string these panels display.
 *
 * Taken as a prop rather than through an i18n library, deliberately. Both apps
 * happen to use i18next today, but a component that calls `useTranslation`
 * forces that choice on every future consumer and needs its keys merged into
 * each app's bundle. Passing the strings in costs one prop and keeps the
 * package free of an i18n dependency — an app using i18next just spreads its
 * own `t()` results into it.
 */
export interface ProfileLabels {
  details: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  save: string;
  saved: string;
  changePhoto: string;
  removePhoto: string;
  password: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  updatePassword: string;
  passwordUpdated: string;
  passwordsDoNotMatch: string;
  nameTooShort: string;
  loading: string;
  loadFailed: string;
}

/** English defaults, so a consumer can render the panels with no labels at all. */
export const DEFAULT_LABELS: ProfileLabels = {
  details: "Your details",
  name: "Name",
  email: "Email",
  phone: "Phone",
  role: "Role",
  save: "Save",
  saved: "Saved",
  changePhoto: "Change photo",
  removePhoto: "Remove",
  password: "Password",
  currentPassword: "Current password",
  newPassword: "New password",
  confirmPassword: "Confirm new password",
  updatePassword: "Update password",
  passwordUpdated: "Password updated",
  passwordsDoNotMatch: "The passwords don't match.",
  nameTooShort: "Enter your name",
  loading: "Loading…",
  loadFailed: "Could not load your profile.",
};
