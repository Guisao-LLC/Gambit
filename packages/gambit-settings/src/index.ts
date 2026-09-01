import { Schema, model, Document, Model, SchemaDefinitionProperty } from "mongoose";

/**
 * A settings document there is exactly ONE of (quick 260831-c4k).
 *
 * Every app in this family eventually grows platform-wide configuration that
 * belongs above any tenant — the outgoing CC list here, a retention window or a
 * default locale elsewhere. The shape is the same each time, and three details
 * of it are decisions rather than incidentals:
 *
 *   FETCHED BY A FIXED KEY, not by id, so no caller ever has to know which
 *   document is "the" settings record — a question with no good answer the
 *   moment someone inserts a second one.
 *
 *   UPSERTED ON READ, so a fresh database and a running one behave identically
 *   and introducing the collection needs no migration. A migration for a single
 *   row with defaults has to be ordered, logged and made idempotent to reach
 *   exactly the same state.
 *
 *   CARRIES `updatedByName`, denormalized. Settings that change behaviour for
 *   everyone deserve an audit trail, and "deleted user changed the CC list" is
 *   history nobody can act on — the same reasoning as the change log's actor.
 *
 * What the settings ARE is the app's business, so `fields` is a parameter and
 * nothing here names one.
 */

export interface SingletonSettingsConfig {
  /** Mongoose model name, e.g. "PlatformSettings". */
  modelName: string;
  /** Explicit collection name. Omit to let mongoose pluralize the model name. */
  collection?: string;
  /**
   * Value of the discriminator field. Any constant works — it exists to make
   * the lookup deterministic, not to carry meaning.
   */
  key?: string;
  /** The settings themselves. */
  fields: Record<string, SchemaDefinitionProperty>;
  /**
   * Written only when the document is first created. Keep in step with the
   * defaults on `fields`: a value set here but not there appears on a fresh
   * document and is absent on an older one.
   */
  insertDefaults?: Record<string, unknown>;
}

export interface SingletonSettingsBase {
  key: string;
  /** Who last changed these. Denormalized so it outlives the account. */
  updatedByName?: string;
  updatedAt?: Date;
}

export interface SingletonSettings<T> {
  /** The mongoose model, for writes. */
  Model: Model<T & Document>;
  /** The discriminator value this settings document is stored under. */
  KEY: string;
  /** The settings document, created on first use. Never returns null. */
  get(): Promise<T>;
}

export function createSingletonSettings<T extends SingletonSettingsBase>(
  config: SingletonSettingsConfig,
): SingletonSettings<T> {
  const { modelName, collection, key = "singleton", fields, insertDefaults = {} } = config;

  const schema = new Schema<T & Document>(
    {
      key: { type: String, required: true, unique: true, default: key },
      ...fields,
      updatedByName: { type: String, required: false },
    } as never,
    { timestamps: true, ...(collection ? { collection } : {}) },
  );

  const SettingsModel = model<T & Document>(modelName, schema) as Model<T & Document>;

  return {
    Model: SettingsModel,
    KEY: key,
    async get(): Promise<T> {
      const doc = await SettingsModel.findOneAndUpdate(
        { key },
        { $setOnInsert: { key, ...insertDefaults } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();
      return doc as unknown as T;
    },
  };
}
