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
