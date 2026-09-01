/** Runs against dist/ — what a consumer actually installs. */
const test = require("node:test");
const assert = require("node:assert/strict");

const { createSingletonSettings } = require("../dist/index.js");

const make = (name, extra = {}) =>
  createSingletonSettings({
    modelName: name,
    collection: name.toLowerCase(),
    fields: { alwaysCc: { type: [String], default: [] } },
    ...extra,
  });

test("the factory returns a model, its key, and a getter", () => {
  const s = make("GambitSettingsProbe");
  assert.ok(s.Model, "Model is exposed so the app can index or migrate it");
  assert.equal(typeof s.get, "function");
  assert.equal(typeof s.KEY, "string");
});

test("the settings ARE a parameter — no app vocabulary in the package", () => {
  // The whole point of the factory: one app's singleton holds a CC list,
  // another's holds something else. Baked-in fields would give the second app
  // the first one's settings page.
  const a = make("GambitSettingsProbeA");
  const b = make("GambitSettingsProbeB", {
    fields: { retentionDays: { type: Number, default: 30 } },
  });

  const pathsOf = (s) => Object.keys(s.Model.schema.paths);
  assert.ok(pathsOf(a).includes("alwaysCc"));
  assert.ok(!pathsOf(a).includes("retentionDays"), "no leakage between apps");
  assert.ok(pathsOf(b).includes("retentionDays"));
  assert.ok(!pathsOf(b).includes("alwaysCc"));
});

test("the key is fixed and unique — that is what makes it a singleton", () => {
  // A deterministic lookup, rather than "the first document in the
  // collection", which guarantees nothing once there are two.
  const s = make("GambitSettingsProbeC");
  const key = s.Model.schema.paths.key;
  assert.ok(key, "every settings document carries the key");
  assert.equal(key.options.unique, true, "a second document cannot exist");
  assert.equal(key.options.default, "singleton", "defaulted so callers need not pass it");
  assert.equal(s.KEY, "singleton");
});

test("the key is overridable, because it carries no meaning", () => {
  const s = make("GambitSettingsProbeD", { key: "platform" });
  assert.equal(s.KEY, "platform");
  assert.equal(s.Model.schema.paths.key.options.default, "platform");
});

test("who changed it, and when, are kept", () => {
  const s = make("GambitSettingsProbeE");
  const paths = Object.keys(s.Model.schema.paths);
  // Denormalized name rather than a reference: an audit trail should outlive
  // the account that made the change.
  assert.ok(paths.includes("updatedByName"));
  // From `timestamps: true`.
  assert.ok(paths.includes("updatedAt"), `expected updatedAt, got: ${paths.join(", ")}`);
});

test("collection name is honoured when given, pluralized when not", () => {
  const explicit = make("GambitSettingsProbeF");
  assert.equal(explicit.Model.collection.collectionName, "gambitsettingsprobef");

  const implicit = createSingletonSettings({
    modelName: "GambitSettingsProbeG",
    fields: { flag: { type: Boolean, default: false } },
  });
  assert.match(implicit.Model.collection.collectionName, /gambitsettingsprobeg/i);
});
