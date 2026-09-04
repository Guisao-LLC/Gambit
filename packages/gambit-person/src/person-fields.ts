import { Schema, SchemaDefinitionProperty } from "mongoose";

/**
 * The person record — the generic half of "add a learner" / "add a client".
 *
 * Every app in this family enrolls PEOPLE into a TENANT and gives each one a
 * login. The shape of that record is the same every time — a name, contact
 * details, an optional address, a link to the account they sign in with, who
 * added them, and whether they are still active. Only the tenant's NAME
 * differs.
 *
 * This is a schema FRAGMENT, not a model. A person record is always mostly
 * domain — one app's carries spaced-repetition card state and quiz progress,
 * roughly 200 lines of it — so the app spreads these fields into its own schema
 * rather than inheriting a model it would immediately outgrow.
 *
 *   const learnerSchema = new Schema({
 *     ...personFields({ tenant: { field: "orgId", type: "String" } }),
 *     ...everything a learner is that a person is not,
 *   });
 *
 * Two deliberate absences:
 *
 *   No `name`. Splitting first and last is not a stylistic choice — a schedule,
 *   an invoice and a mail merge each need them apart, and re-splitting a
 *   joined name is a guess. `joinName` in `identity.ts` goes the one direction
 *   that is safe, for the account record that does store a single `name`.
 *
 *   No timestamps option. That belongs to the schema the app builds, not to a
 *   fragment spread into it.
 */

export interface PersonAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export const personAddressSchema = new Schema<PersonAddress>(
  {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true },
  },
  { _id: false },
);

export interface PersonFieldsConfig {
  /**
   * The organization this person belongs to.
   *
   * `type` is deliberately open: one app stores its tenant key as a String for
   * historical reasons while its newer models use ObjectId. Forcing one here
   * would mean a migration before anything could adopt this.
   */
  tenant?: {
    field: string;
    type: "ObjectId" | "String";
    ref?: string;
    required?: boolean;
  };
  /** Collection holding login accounts. Defaults to "Users". */
  accountRef?: string;
  /** Whether every person must already have a login. */
  accountRequired?: boolean;
  /** Include the postal address subdocument. */
  includeAddress?: boolean;
  /** Default UI language. Omit to leave the field with no default. */
  defaultLanguage?: string;
}

/**
 * Build the shared person fields for spreading into an app's schema.
 *
 * Contact details are required because a person nobody can reach is not a
 * usable record — every app here mails them. The address is optional because
 * only some apps go to where the person is.
 */
export function personFields(
  config: PersonFieldsConfig = {},
): Record<string, SchemaDefinitionProperty> {
  const {
    tenant,
    accountRef = "Users",
    accountRequired = true,
    includeAddress = false,
    defaultLanguage,
  } = config;

  const fields: Record<string, SchemaDefinitionProperty> = {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    email: { type: String, required: true },
    /** The login this person signs in with. */
    userId: { type: Schema.Types.ObjectId, ref: accountRef, required: accountRequired },
    /** Who enrolled them — staff act on behalf of people who cannot self-serve. */
    createdBy: { type: Schema.Types.ObjectId, ref: accountRef, required: false },
    isActive: { type: Boolean, required: false },
    language: {
      type: String,
      required: false,
      ...(defaultLanguage !== undefined ? { default: defaultLanguage } : {}),
    },
  };

  if (tenant) {
    fields[tenant.field] =
      tenant.type === "ObjectId"
        ? {
            type: Schema.Types.ObjectId,
            ...(tenant.ref ? { ref: tenant.ref } : {}),
            required: tenant.required ?? false,
          }
        : { type: String, required: tenant.required ?? false };
  }

  if (includeAddress) {
    fields.address = { type: personAddressSchema, required: false };
  }

  return fields;
}
