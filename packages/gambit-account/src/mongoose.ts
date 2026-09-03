/**
 * `@guisao-llc/gambit-account/mongoose` — the SERVER-ONLY half.
 *
 * A separate entry point because it needs Mongoose at runtime, and the package
 * root must stay importable from a browser (quick 260903-r5n): the UI package
 * uses the password and avatar rules, and a root that reached for Mongoose
 * dragged Node's `events` into every client bundle that touched it.
 *
 * Import from here in server code:
 *
 *   import { baseAccountFields, applyAccountStatics }
 *     from "@guisao-llc/gambit-account/mongoose";
 */

export { baseAccountFields, applyAccountStatics } from "./base-account-fields";
export type {
  BaseAccount,
  AccountStatics,
  BaseAccountFieldsConfig,
} from "./base-account-fields";
