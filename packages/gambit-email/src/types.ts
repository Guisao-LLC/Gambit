/**
 * The shapes the mail layer passes around.
 *
 * Deliberately NOT here: anything about branding or templates. A branded
 * header belongs to whoever owns the brand, and the apps differ on what a
 * brand even is — a school, a practice, a single tenant. This package stops at
 * "deliver this message", which is the part that is genuinely the same
 * everywhere.
 */

export interface EmailAttachment {
  filename: string;
  /** Text (an .ics body) or binary (a CID-embedded PNG). */
  content: string | Buffer;
  /** Optional — nodemailer infers from the filename when absent. An .ics
   *  still passes it explicitly: "text/calendar; charset=utf-8; method=REQUEST". */
  contentType?: string;
  /** Content-ID, for inline embedding via `<img src="cid:…">`. */
  cid?: string;
  /**
   * Explicit MIME disposition. Without it some clients fall through to
   * "attachment" and strip the `cid:` reference, leaving an `<img>` with no
   * source — a broken image rather than an error.
   */
  contentDisposition?: "inline" | "attachment";
}

export interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface EmailResult {
  messageId: string;
  /** Only populated by preview transports (e.g. Ethereal in development). */
  previewUrl?: string;
}

export interface IEmailStrategy {
  sendMail(options: EmailOptions): Promise<EmailResult>;
}
