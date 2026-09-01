import type { ClientSession, Types } from "mongoose";

/**
 * @guisao-llc/gambit-cascade
 *
 * Cascading deletion, minus the deletions.
 *
 * Mongo has no foreign keys, so "deleting this takes its dependents with it" is
 * application code in every app that needs it. One app here spreads roughly 700
 * lines of that across eight files; another does the same job in schema hooks.
 * What those have in common is not the deletions — those are entirely domain —
 * but the small amount of machinery around them: an operation interface, and a
 * runner that executes a list of them in order.
 *
 * That is all this package is. It never touches a collection itself.
 */

/**
 * One step of a cascade: delete what this subject owns in one collection.
 *
 * Generic over its arguments, because cascades are not all keyed the same way.
 * Deleting a person runs on `(id, session)`. Deleting a ROLE runs on the role's
 * NAME, because the accounts holding it store a name string rather than a
 * reference — and that difference had produced a second, near-identical copy of
 * the runner before this was generalized.
 *
 * The default parameter keeps the common case free of type noise.
 */
export interface CascadeOperation<
  TArgs extends unknown[] = [Types.ObjectId, ClientSession],
> {
  execute(...args: TArgs): Promise<void>;
}

/**
 * Runs operations in order, inside the caller's transaction.
 *
 * Order is the caller's to decide and it matters: a leaf that RESOLVES a
 * reference — reading `person.accountId` before the account is deleted — has to
 * run before whatever removes the document it reads from.
 *
 * ── Why there is no per-operation catch ──────────────────────────────────────
 *
 * Deliberately none, and this is the load-bearing decision in the file.
 *
 * A cascade runs inside `session.withTransaction(...)`, so a throw from any
 * leaf must abort the whole thing. Catching and continuing would let a PARTIAL
 * delete commit: rows orphaned against a parent that no longer exists, silently,
 * with no error anywhere. That is strictly worse than the failure it would be
 * hiding, because the failure is loud and the orphans are not.
 *
 * If a step is genuinely allowed to fail, it catches its own error and resolves.
 * Making that the exception rather than the default keeps it a visible decision.
 *
 * Composable: this is itself a `CascadeOperation`, so cascades nest.
 */
export class SequentialCascade<
  TArgs extends unknown[] = [Types.ObjectId, ClientSession],
> implements CascadeOperation<TArgs>
{
  constructor(private readonly operations: CascadeOperation<TArgs>[]) {}

  async execute(...args: TArgs): Promise<void> {
    for (const op of this.operations) {
      await op.execute(...args);
    }
  }
}
