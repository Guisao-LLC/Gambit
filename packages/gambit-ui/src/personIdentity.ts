import { z } from "zod";
import { isPlausibleEmail } from "@guisao-llc/gambit-person";

/**
 * One identity rule, shared by every form that collects a first name, last
 * name, email, and (optionally) a phone number.
 *
 * `@guisao-llc/gambit-person`'s `checkIdentity` already runs this exact rule
 * server-side, but it operates on a whole identity object and returns a
 * discriminated result — not a per-field zod-shaped error a form's
 * `zodResolver` can attach to individual inputs. Re-deriving the SAME RULES
 * here (min length + `isPlausibleEmail`) is the correct seam, not a
 * duplication: it mirrors how `ProfileDetailsCard` calls `checkAvatarUpload`
 * directly rather than wrapping it in a schema.
 *
 * Imports `isPlausibleEmail` from `@guisao-llc/gambit-person`'s ROOT entry
 * point only — never `/mongoose`. A Mongoose import reachable from a browser
 * entry point has taken two apps down before with an error naming neither
 * Mongoose nor the package.
 */
export interface PersonIdentitySchemaOptions {
  /** Off by default — see `IdentityOptions.requirePhone` in gambit-person. */
  requirePhone?: boolean;
  /** Enforced only when provided; no default format rule. */
  phoneMinLength?: number;
  /**
   * The floor every consumer starts from. Default 2 — the loosest floor of
   * the forms this was extracted from; a stricter host overrides it, a
   * looser one has nothing looser to ask for.
   */
  nameMinLength?: number;
}

export function createPersonIdentitySchema(options: PersonIdentitySchemaOptions = {}) {
  const { requirePhone = false, phoneMinLength, nameMinLength = 2 } = options;

  let phoneNumber = z.string().trim();
  if (requirePhone) {
    phoneNumber = phoneNumber.min(1, { message: "Enter a phone number." });
  }
  if (phoneMinLength !== undefined) {
    phoneNumber = phoneNumber.min(phoneMinLength, {
      message: `Phone number must be at least ${phoneMinLength} characters.`,
    });
  }

  return z.object({
    firstName: z.string().trim().min(nameMinLength, {
      message: `First name must be at least ${nameMinLength} characters.`,
    }),
    lastName: z.string().trim().min(nameMinLength, {
      message: `Last name must be at least ${nameMinLength} characters.`,
    }),
    // Deliberately the SAME rule checkIdentity runs server-side, not zod's
    // built-in `.email()` — this is the one place both layers can agree, per
    // gambit-person's own doc comment on why isPlausibleEmail is permissive.
    email: z.string().trim().refine(isPlausibleEmail, {
      message: "That does not look like an email address.",
    }),
    phoneNumber: requirePhone || phoneMinLength !== undefined ? phoneNumber : phoneNumber.optional(),
  });
}
