import type { IEmailStrategy, EmailOptions, EmailResult } from "./types.js";

/**
 * Knows how to address and dispatch a message. Knows nothing about WHICH
 * transport carries it or WHO gets copied — both arrive as config, which is
 * what leaves this class free of any provider or app coupling.
 *
 * ── The transport is built on the FIRST SEND ────────────────────────────────
 *
 * Not at construction, and the difference is not cosmetic. A strategy that
 * reads credentials THROWS when they are absent, so an eagerly-built singleton
 * means merely importing this module explodes in any environment without mail
 * configured. That is how a test suite which never sends an email ends up
 * failing at import, because a controller three hops away reached the module.
 *
 * Inject a strategy directly in tests:
 *   new EmailService(new MyFakeStrategy())
 */

export interface EmailServiceConfig {
  /** Called once, lazily, on the first send. */
  createStrategy: () => IEmailStrategy;
  /**
   * Addresses copied on every outgoing message. Empty by default.
   *
   * May be a RESOLVER rather than a fixed array, and that is the point: an
   * array is read once, so the copy list could only change by redeploying. A
   * resolver runs per send, so an administrator turning "copy me" on takes
   * effect on the next email instead of the next release.
   *
   * It must not be relied upon to succeed — see `resolveAlwaysCc`.
   */
  alwaysCc?: string[] | (() => string[] | Promise<string[]>);
}

function isStrategy(value: EmailServiceConfig | IEmailStrategy): value is IEmailStrategy {
  return typeof (value as IEmailStrategy).sendMail === "function";
}

export class EmailService {
  private strategy?: IEmailStrategy;
  private readonly createStrategy: () => IEmailStrategy;
  private readonly alwaysCc: string[] | (() => string[] | Promise<string[]>);

  constructor(config: EmailServiceConfig | IEmailStrategy) {
    if (isStrategy(config)) {
      // Direct strategy — already resolved, nothing to build later.
      this.strategy = config;
      this.createStrategy = () => config;
      this.alwaysCc = [];
    } else {
      this.createStrategy = config.createStrategy;
      this.alwaysCc = config.alwaysCc ?? [];
    }
  }

  /** Swap the transport at runtime, e.g. once configuration has loaded. */
  setStrategy(strategy: IEmailStrategy): void {
    this.strategy = strategy;
  }

  private resolveStrategy(): IEmailStrategy {
    if (!this.strategy) this.strategy = this.createStrategy();
    return this.strategy;
  }

  /**
   * The copy list for THIS send.
   *
   * A resolver that throws is swallowed to an empty list and logged, on
   * purpose: losing the copies is a far smaller failure than losing the
   * message, and the person it was addressed to still gets it.
   */
  private async resolveAlwaysCc(): Promise<string[]> {
    if (typeof this.alwaysCc !== "function") return this.alwaysCc;
    try {
      return await this.alwaysCc();
    } catch (error) {
      console.error("[Email] Could not resolve the CC list; sending without copies.", error);
      return [];
    }
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    const existingCc = options.cc
      ? Array.isArray(options.cc) ? options.cc : [options.cc]
      : [];
    const cc = [...new Set([...existingCc, ...(await this.resolveAlwaysCc())])];
    const to = Array.isArray(options.to) ? options.to.join(", ") : options.to;
    console.log(`[Email] Sending "${options.subject}" → To: ${to} | CC: ${cc.join(", ")}`);
    return this.resolveStrategy().sendMail({ ...options, cc });
  }
}
