/**
 * @guisao-llc/gambit-email
 *
 * Delivering a message, minus the message.
 *
 * Every app in this family sends mail, and the part they genuinely share is
 * small: a context that addresses and dispatches, and a transport behind it.
 * What they do NOT share is everything that makes an email look like it came
 * from them — the branded shell, the templates, who gets copied, what a
 * "brand" even is. Those stay in the apps, which is why this package has no
 * opinion about any of them.
 *
 * The CC list is the clearest case. It is config here, and a RESOLVER rather
 * than an array, so one app can read it from a database another app does not
 * have.
 *
 * Everything at THIS entry point is dependency-free: types and a class that
 * takes its transport as config. The Google Workspace transport lives at
 * `@guisao-llc/gambit-email/google`, because it needs nodemailer and
 * googleapis at runtime and a root that reached for them would make every
 * consumer install ~100MB of Gmail API to get a send() method.
 */

export type {
  IEmailStrategy,
  EmailOptions,
  EmailResult,
  EmailAttachment,
} from "./types.js";

export { EmailService } from "./email-service.js";
export type { EmailServiceConfig } from "./email-service.js";
