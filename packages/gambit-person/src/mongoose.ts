/**
 * `@guisao-llc/gambit-person/mongoose` — the SERVER-ONLY half.
 *
 * A separate entry point because `person-fields` needs `Schema` as a VALUE
 * (`new Schema(…)`, `Schema.Types.ObjectId`), and the package root must stay
 * importable from a browser: `checkIdentity` is meant to validate the enrollment
 * form client-side, and a root that reached for Mongoose would drag Node's
 * `events` into every bundle that touched it.
 *
 * Import from here in server code:
 *
 *   import { personFields } from "@guisao-llc/gambit-person/mongoose";
 */

export { personFields, personAddressSchema } from "./person-fields";
export type { PersonAddress, PersonFieldsConfig } from "./person-fields";
