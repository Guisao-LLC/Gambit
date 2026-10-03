# TODO

Package work. App-specific items live in each app's own repo — deliberately,
since this one is public and some of them describe gaps that should not be
advertised.

## Before the merge at `1.0`

Three of the prerequisites are done (below). What is left:

**Boot a generated app against a real database.** Still the item under "Run a
generated app…". Repackaging on top of an unexercised path means a later break
is ambiguous — you would not know whether the merge caused it.

**Decide whether the staged five are in or out.** `ai` brings its own SDK, and
`gambit-email` already shows the shape of the answer: it ships, but its heavy
transport sits behind a `/google` subpath so the root costs nothing. After a
`1.0` that boundary is expensive to move, which is the whole reason `1.0` is the
revisit point.

### Done

**Dual CJS/ESM output with an `exports` map**, every package. See **Module
format** in the README for how it is wired and the two rules that keep it
working. This was the real blocker: a single package lives or dies on subpath
exports, and six of the nine had no `exports` map at all. It also closes the
CommonJS-only problem that took both apps down.

**`gambit-cascade` no longer forces a Mongoose install.** It names Mongoose in
exactly one place — `import type`, as the default type arguments of its two
generics — so nothing is emitted and `SequentialCascade<[string, MySession]>`
compiles with Mongoose absent. npm 7+ auto-installs a required peer, so the
declaration was costing every consumer an install it never used. Optional now.

**Version drift between the two apps is closed.** One app was pinned to
`gambit-rbac@^0.1.0` while the other ran `0.2.0`, and a caret on `0.x` admits
patch only — so it would never have caught up on its own. Verified
behaviour-neutral before moving it: `0.2.0` is additive, an app that does not
pass `isSuperRole` behaves exactly as before, and that app does not.

### Not splitting rbac, settings or auth

Considered while doing the above, and deliberately not done. The `/mongoose`
subpath exists to keep a package root importable from a **browser**; those three
are server-only end to end, have no browser consumer and no prospect of one, and
both apps import `roleFields` and `permissionFields` from the rbac root today.
Moving them would be a breaking change bought with nothing. Revisit only if
something in a browser ever needs them.

## Run a generated app against a real database

Everything so far is verified by tests and typechecks. **Nobody has started a
generated app against Mongo**, signed up, logged in, created a role, and hit a
gated route.

That is the same shape as the bug that took three publishes to fix: green
tests, unexercised path. The suite proves the pieces agree with each other; it
cannot prove the thing boots.

About an hour, and the only place left where something could be confidently
wrong.

## The client half of the scaffold

`create-gambit-app` generates a server only. A generated app has working auth
endpoints and no way to log into them.

Kimorah's client is the template — Berry theme, `api.ts` with a token
interceptor, the Redux store, and a profile page already built on `gambit-ui`.
Most of it is copy-with-substitution, as the server templates were.

Worth deciding first: does the scaffold ship one opinionated client, or offer
`--client none` for an app that brings its own?

## Smaller

**Kimorah's `jwt.ts` reimplements `signToken`/`verifyToken`** that `gambit-auth`
already exports — roughly 40 lines. A missed extraction rather than a
divergence; the behaviour matches.

**Time2Drive's extractability guard is stale.** Several modules it lists as
platform-bound are now shims with legitimate app coupling — `permission-cache`
imports the app's `Roles`, `roles-model` declares its tenant. It passes, so
nothing is broken; it is describing an older arrangement.

**Five modules are still staged for extraction and unpackaged**: `events`,
`change-log`, `data`, `ai`, `diagnostics`. All are leaf nodes except `data` and
`ai`, which depend on `auth`, so any order works. (`email` came out at
`gambit-email@0.1.0` when a second app needed to send.)

**`gambit-person@0.1.0` is published and fully adopted** (quick 260904-nf1).
Every account-creation path in both apps runs through `createEnrollment`, and
each app has exactly one `Users.create` call site left — inside the adapter that
feeds it. Note that 0.1.0 is now immutable on the registry, so the next change
to this package needs a version bump before it can ship.

## Not doing, and why

**Merging into ONE package.** Two, not one — and the reason is the
browser/server split rather than the peer union.

`gambit-ui` is browser code needing React, MUI and emotion; the rest is Node
code needing Express and Mongoose. npm 7+ installs peers automatically, so a
single package means a server app installs MUI and a browser app installs
Mongoose, unless every peer is marked optional — which costs the package the
ability to state honestly what it needs.

So the target is `@guisao-llc/gambit` (server) plus `@guisao-llc/gambit-ui`
(browser): two packages, down from nine, with `npm deprecate` pointing the old
names at them. `create-gambit-app` stays separate regardless — it is a CLI run
via `npx` and cannot be a subpath — and `gambit-testing` has no business in a
runtime package.

Note that the peer union argument as originally written was wrong: `googleapis`
and `nodemailer` belong to the six modules still *staged*, not to anything
published. It is a reason to decide their boundary before `1.0`, not a reason
against merging what exists.
