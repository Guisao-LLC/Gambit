import nodemailer from "nodemailer";
import { google } from "googleapis";
import type { IEmailStrategy, EmailOptions, EmailResult } from "./types.js";

/**
 * Sending through Google Workspace over SMTP, authenticated with OAuth2.
 *
 * A fresh access token is minted from the refresh token before each send and
 * handed to nodemailer. Access tokens last an hour; nothing here caches one,
 * because a cached token that has just expired fails a send that would
 * otherwise have worked.
 *
 * ── Why the login and the From address are separate ────────────────────────
 *
 * They are usually the same, and for a long time this was a single value. Then
 * a consumer wanted to send as `noreply@` without paying for a licensed user
 * for it — i.e. as an ALIAS of a real mailbox. An alias has no credentials of
 * its own, so:
 *
 *   `user`  the mailbox that AUTHENTICATES — owns the refresh token
 *   `from`  the address recipients SEE — the alias, or the same mailbox
 *
 * Collapsing them breaks the alias case in the worst way available: Gmail
 * accepts the send and silently REWRITES the From header to the authenticated
 * account. Mail arrives, nothing errors, and it is simply from the wrong
 * address until somebody reads a header.
 *
 * For the alias to be honoured it must also be registered under "Send mail as"
 * in the authenticating account's Gmail settings. Workspace usually does that
 * automatically for an alias on the same user; when it has not, the symptom is
 * exactly the silent rewrite above, so it is worth checking rather than
 * assuming.
 */

export interface GoogleWorkspaceConfig {
  /** The address recipients see. An alias is fine, if registered as send-as. */
  from: string;
  /**
   * The mailbox that authenticates. Defaults to `from`, which is correct
   * whenever the sender is a real user rather than an alias.
   */
  user?: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Display name shown beside the address. Omitted renders a bare address —
   *  a quoted empty string shows as `"" <addr>` in some clients. */
  senderName?: string;
}

/**
 * The OAuth client's registered redirect URI.
 *
 * It is not used to redirect anything here — the refresh token already exists.
 * But Google matches it against the client that issued the token, so it has to
 * be the same value the token was minted with. These tokens are produced via
 * the OAuth Playground, so that is the URI.
 */
const PLAYGROUND_REDIRECT = "https://developers.google.com/oauthplayground";

/** Reads the conventional environment variables. Apps may build the config
 *  themselves instead; this exists so the common case is one call. */
export function googleWorkspaceConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GoogleWorkspaceConfig {
  const { EMAIL_FROM, EMAIL_AUTH_USER, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = env;
  if (!EMAIL_FROM || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      "Missing required environment variables: EMAIL_FROM, GOOGLE_CLIENT_ID, " +
        "GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN",
    );
  }
  return {
    from: EMAIL_FROM,
    // Absent is the ordinary case: the sender IS the authenticating mailbox.
    user: EMAIL_AUTH_USER || EMAIL_FROM,
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    refreshToken: GOOGLE_REFRESH_TOKEN,
  };
}

export class GoogleWorkspaceEmailStrategy implements IEmailStrategy {
  /**
   * The mailbox that authenticates, and the address recipients see. PUBLIC,
   * and readonly, because the difference between them is the thing most worth
   * being able to check: an app can log both at boot and see at a glance
   * whether it is sending as an alias or as itself. Keeping them private would
   * make the one interesting fact about this transport unobservable.
   */
  readonly authUser: string;
  readonly fromHeader: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly refreshToken: string;

  constructor(config: GoogleWorkspaceConfig) {
    const { from, user, clientId, clientSecret, refreshToken, senderName } = config;
    if (!from || !clientId || !clientSecret || !refreshToken) {
      throw new Error(
        "GoogleWorkspaceEmailStrategy needs from, clientId, clientSecret and refreshToken",
      );
    }
    this.authUser = user || from;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.fromHeader = senderName ? `"${senderName}" <${from}>` : from;
  }

  private async getAccessToken(): Promise<string> {
    const oauth2Client = new google.auth.OAuth2(this.clientId, this.clientSecret, PLAYGROUND_REDIRECT);
    oauth2Client.setCredentials({ refresh_token: this.refreshToken });
    const { token } = await oauth2Client.getAccessToken();
    if (!token) throw new Error("Failed to obtain Google access token — token was null");
    return token;
  }

  async sendMail(options: EmailOptions): Promise<EmailResult> {
    const accessToken = await this.getAccessToken();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        // The MAILBOX, never the alias. Google answers a mismatch between this
        // and the account that owns the refresh token with SMTP 535
        // BadCredentials — an error naming neither of them.
        user: this.authUser,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        refreshToken: this.refreshToken,
        accessToken,
      },
    });

    const info = await transporter.sendMail({
      from: this.fromHeader,
      to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(", ") : options.cc) : undefined,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
    });

    return { messageId: info.messageId };
  }
}
