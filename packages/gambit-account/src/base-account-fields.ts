import { Schema, SchemaDefinitionProperty } from "mongoose";

/**
 * The login account — the generic half of `models/user-model.ts`
 * (quick 260901-h8k).
 *
 * Every app in this family has accounts that sign in: they hold a name and an
 * email, one role, a verification flag, a password reset token and a magic-link
 * token. `platform-auth` and `platform-rbac` were made extractable one module
 * at a time, and in three of those the account model was the specific thing
 * that had to be pushed out through a seam — `role-cascade` gained
 * `clearRoleFromAccounts` purely so it could stop importing `Users`. This is
 * the piece those seams were pointing at.
 *
 * A schema FRAGMENT, not a base model, for the same reason `personFields` is
 * one: an account is always partly domain. Time2Drive's carries instructor
 * working hours and zone coverage; a clinic's would carry something else
 * entirely. So the app spreads these into its own schema rather than inheriting
 * a model it would immediately outgrow.
 *
 *   const userSchema = new Schema({
 *     ...baseAccountFields({
 *       tenant: { field: "schoolId", type: "ObjectId", ref: "Schools" },
 *       accountType: { values: ["staff", "student"], default: "staff" },
 *     }),
 *     ...everything an account here is that an account anywhere is not,
 *   });
 *   applyAccountStatics(userSchema);
 *
 * `accountType` is the field worth explaining. The FIELD is generic — every app
 * distinguishes the people who run it from the people it serves — but the
 * VALUES are not: `staff`/`student` here, `staff`/`patient` elsewhere. So the
 * field is emitted and its enum is configuration, the same treatment
 * `personFields` gives the tenant's type. It keeps the name `userType` because
 * that is what is already on disk and in every JWT.
 *
 * `avatar` and `emailCopyOptIn` are emitted unconditionally rather than behind
 * flags. The platform has already decided both are account concerns by having
 * modules for them — `avatar-image.ts` and `cc-policy.ts` sit beside this file.
 * An app that ignores them carries two unset fields, which costs nothing.
 *
 * One deliberate absence: no timestamps option. That belongs to the schema the
 * app builds, not to a fragment spread into it.
 */

/**
 * What any app in this family can assume an account has.
 *
 * Apps extend this with their own fields; `IUser` in Time2Drive adds the
 * tenant, instructor availability and zone coverage. Nothing here names a
 * tenant, because the tenant's field name is configuration.
 */
export interface BaseAccount<TAccountType extends string = string> {
  name: string;
  email: string;
  passwordHash?: string;
  /** The role NAME this account holds. RBAC resolves permissions from it. */
  roles?: string;
  isVerified?: boolean;
  phoneNumber?: string;
  resetToken?: string;
  resetTokenExpiry?: Date;
  magicToken?: string;
  magicTokenExpiry?: Date;
  /**
   * Which kind of account this is.
   *
   * Generic in the app's own union rather than a bare `string`, so an app that
   * knows its kinds keeps that knowledge: Time2Drive's `IUser` extends
   * `BaseAccount<"staff" | "student">` and its JWT claims stay narrow. An app
   * that does not care gets `string` from the default and pays nothing.
   */
  userType?: TAccountType;
  /** Seed accounts that must survive a cascade — see the app's delete paths. */
  isProtected?: boolean;
  /**
   * Profile picture, stored inline as base64 + mime rather than as a file.
   *
   * These apps deploy to a single service with an EPHEMERAL disk, so a file
   * written on upload is gone after the next deploy while the document still
   * points at it. Inline travels with every read of the account, so whatever
   * writes it must cap the size — `avatar-image.ts` is the check.
   */
  avatar?: { base64: string; mime: string };
  /**
   * "Copy me on outgoing email."
   *
   * Stored on every account even where only some can see the setting, so the
   * flag survives a role change rather than being silently re-enabled if the
   * role comes back. Opt-IN: nobody starts receiving copies of other people's
   * correspondence without choosing to.
   */
  emailCopyOptIn?: boolean;
}

/**
 * The statics every app's account model wants.
 *
 * `findByName` is declared as returning ONE account, not an array. The
 * signature it replaced said `Promise<IUser[]>` while the implementation was
 * `findOne(...)` — so a caller writing `.length` or `.map` would have compiled
 * and then failed at runtime. Nothing called it, which is why the mismatch
 * survived; carrying it into a shared package would have handed the same trap
 * to every app that adopted this.
 */
export interface AccountStatics<TAccount> {
  findByEmail(email: string): Promise<TAccount | null>;
  findByName(name: string): Promise<TAccount | null>;
  updateByEmail(email: string, updateData: Partial<TAccount>): Promise<TAccount | null>;
  deleteByEmail(email: string): Promise<TAccount>;
  updateById(id: unknown, updateData: Partial<TAccount>): Promise<TAccount | null>;
}

export interface BaseAccountFieldsConfig {
  /**
   * The organization this account belongs to.
   *
   * `type` is open for the same reason it is in `personFields`: Time2Drive
   * stores `schoolId` as an ObjectId here but as a String on Student, and
   * forcing one shape would mean a migration before anything could adopt this.
   */
  tenant?: {
    field: string;
    type: "ObjectId" | "String";
    ref?: string;
    required?: boolean;
  };
  /** The kinds of account this app has. Omit to leave `userType` off entirely. */
  accountType?: {
    values: string[];
    default?: string;
  };
  /**
   * Whether an account must have a password.
   *
   * Not every app requires one — magic-link-only accounts exist. Time2Drive
   * requires it today, so that is the default.
   */
  passwordRequired?: boolean;
  /** Minimum password-hash length enforced by the schema. */
  passwordMinLength?: number;
}

/**
 * Build the shared account fields for spreading into an app's schema.
 *
 * `email` is unique because every sign-in path in this family resolves an
 * account by it — `findByEmail` below, password reset, and the magic link all
 * assume at most one match.
 */
export function baseAccountFields(
  config: BaseAccountFieldsConfig = {},
): Record<string, SchemaDefinitionProperty> {
  const {
    tenant,
    accountType,
    passwordRequired = true,
    passwordMinLength = 6,
  } = config;

  const fields: Record<string, SchemaDefinitionProperty> = {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: passwordRequired, minlength: passwordMinLength },
    roles: { type: String, required: false },
    isVerified: { type: Boolean, required: true },
    phoneNumber: { type: String, required: false },
    resetToken: { type: String, required: false },
    resetTokenExpiry: { type: Date, required: false },
    magicToken: { type: String, required: false },
    magicTokenExpiry: { type: Date, required: false },
    isProtected: { type: Boolean, default: false },
    avatar: {
      type: new Schema(
        {
          base64: { type: String, required: true },
          mime: { type: String, required: true },
        },
        { _id: false },
      ),
      required: false,
      default: undefined,
    },
    emailCopyOptIn: { type: Boolean, required: false, default: false },
  };

  if (accountType) {
    fields.userType = {
      type: String,
      enum: accountType.values,
      ...(accountType.default !== undefined ? { default: accountType.default } : {}),
    };
  }

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

  return fields;
}

/**
 * Attach the account statics to an app's schema.
 *
 * Separate from the fields because a schema fragment cannot carry them —
 * statics live on the Schema object, not in its definition. Call this right
 * after constructing the schema.
 */
export function applyAccountStatics(schema: Schema): void {
  schema.statics.findByName = function (name: string) {
    return this.findOne({ name }).exec();
  };
  schema.statics.findByEmail = function (email: string) {
    return this.findOne({ email }).exec();
  };
  schema.statics.updateByEmail = function (email: string, updateData: Record<string, any>) {
    return this.findOneAndUpdate(
      { email },
      { $set: updateData },
      { new: true, runValidators: true },
    ).exec();
  };
  schema.statics.deleteByEmail = function (email: string) {
    return this.findOneAndDelete({ email }).exec();
  };
  schema.statics.updateById = function (id: unknown, updateData: Record<string, any>) {
    return this.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true },
    ).exec();
  };
}
