/** Runs against dist/ — what a consumer actually installs. */
const test = require("node:test");
const assert = require("node:assert/strict");

const { SequentialCascade } = require("../dist/index.js");

/** A leaf that records when it ran, and can be told to blow up. */
const leaf = (log, name, { throws = false } = {}) => ({
  async execute(...args) {
    log.push({ name, args });
    if (throws) throw new Error(`${name} failed`);
  },
});

test("runs every operation, in the order given", async () => {
  const log = [];
  await new SequentialCascade([
    leaf(log, "steps"),
    leaf(log, "quizzes"),
    leaf(log, "account"),
  ]).execute("id-1", "session-1");

  assert.deepEqual(log.map((e) => e.name), ["steps", "quizzes", "account"]);
});

test("runs them SEQUENTIALLY, not concurrently", async () => {
  // The ordering guarantee is the whole contract: a leaf that resolves a
  // reference must finish before the leaf that deletes what it read from.
  const order = [];
  const slow = {
    async execute() {
      order.push("slow:start");
      await new Promise((r) => setTimeout(r, 20));
      order.push("slow:end");
    },
  };
  const fast = {
    async execute() {
      order.push("fast");
    },
  };

  await new SequentialCascade([slow, fast]).execute();
  assert.deepEqual(order, ["slow:start", "slow:end", "fast"]);
});

test("passes every argument through to each leaf, unchanged", async () => {
  const log = [];
  const id = { toString: () => "abc" };
  const session = { id: "s1" };
  await new SequentialCascade([leaf(log, "a")]).execute(id, session);

  assert.equal(log[0].args[0], id);
  assert.equal(log[0].args[1], session);
});

test("a failing leaf ABORTS the cascade — nothing after it runs", async () => {
  // The load-bearing behavior. A cascade runs inside withTransaction, so a
  // throw has to reach the caller and roll the whole thing back. Swallowing it
  // would let a PARTIAL delete commit: rows orphaned against a parent that no
  // longer exists, silently.
  const log = [];
  const cascade = new SequentialCascade([
    leaf(log, "first"),
    leaf(log, "second", { throws: true }),
    leaf(log, "third"),
  ]);

  await assert.rejects(() => cascade.execute("id", "session"), /second failed/);
  assert.deepEqual(log.map((e) => e.name), ["first", "second"]);
  assert.ok(!log.some((e) => e.name === "third"), "must not continue past a failure");
});

test("nests, because a cascade is itself an operation", async () => {
  const log = [];
  const inner = new SequentialCascade([leaf(log, "inner-a"), leaf(log, "inner-b")]);
  await new SequentialCascade([leaf(log, "outer-1"), inner, leaf(log, "outer-2")])
    .execute("id", "session");

  assert.deepEqual(log.map((e) => e.name), ["outer-1", "inner-a", "inner-b", "outer-2"]);
});

test("a failure inside a nested cascade aborts the outer one too", async () => {
  const log = [];
  const inner = new SequentialCascade([leaf(log, "inner", { throws: true })]);
  const outer = new SequentialCascade([inner, leaf(log, "never")]);

  await assert.rejects(() => outer.execute("id", "session"), /inner failed/);
  assert.ok(!log.some((e) => e.name === "never"));
});

test("an empty cascade is a no-op rather than an error", async () => {
  await new SequentialCascade([]).execute("id", "session");
});

test("works with any argument shape — a role NAME, not just an id", async () => {
  // Deleting a role runs on the role's NAME, because the accounts holding it
  // store a name string rather than a reference. That difference is why the
  // runner is generic over its arguments at all.
  const log = [];
  await new SequentialCascade([leaf(log, "clear-accounts")]).execute("Instructor");
  assert.deepEqual(log[0].args, ["Instructor"]);
});
