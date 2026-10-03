/**
 * `@guisao-llc/gambit-email/google` — the Google Workspace transport.
 *
 * A separate entry point because it needs `nodemailer` and `googleapis` as
 * VALUES, and the package root must stay importable without them. Same split,
 * and the same reasoning, as `@guisao-llc/gambit-account/mongoose`.
 *
 * `googleapis` is around 100MB installed. An app that wants `EmailService`
 * with its own transport — a preview mailbox in development, a different
 * provider in production — should not pay for the Gmail API surface to get it.
 * Importing from here is the act of saying "yes, Google, and I have installed
 * its dependencies".
 *
 *   import { GoogleWorkspaceEmailStrategy, googleWorkspaceConfigFromEnv }
 *     from "@guisao-llc/gambit-email/google";
 */

export {
  GoogleWorkspaceEmailStrategy,
  googleWorkspaceConfigFromEnv,
} from "./google-workspace.js";
export type { GoogleWorkspaceConfig } from "./google-workspace.js";
