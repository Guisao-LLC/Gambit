# TODO

Package work. App-specific items live in each app's own repo — deliberately,
since this one is public and some of them describe gaps that should not be
advertised.

## Publish `gambit-ui@0.3.0` — four consumers are still blocked on it

`gambit-person@0.1.0` is now on the registry, `displayName` included. The
publish run **skipped `gambit-ui`**: the roles surface and the person-identity
fields landed in its source without a version bump, so `isPublished` saw 0.2.0
already published and moved on. The tarball currently serving as 0.2.0 holds
only `ProfileDetailsCard`, `ChangePasswordCard` and `types` — none of
`RolesPanel`, `PermissionMatrix`, `RoleFormDialog`, `PersonIdentityFields` or
`createPersonIdentitySchema`.

So the version an app would install from the registry does not contain the
components it imports, which is why every `file:` link has to stay.

The version is now bumped to 0.3.0 and committed. One command left:

```bash
node scripts/publish-all.mjs --web
```

Needs npm 2FA. Until it runs, **neither app's client NOR server builds** without
this repo checked out beside it — four `package.json` files carry `file:` links.

Afterwards each app swaps those links back to caret ranges — remembering that
npm's caret on `0.x` admits PATCH ONLY, so `^0.2.0` will not accept `0.3.0` —
and deletes the link scaffolding, all of it commented TEMPORARY.

**A lesson worth keeping:** `publish-all` silently skips a package whose version
already exists. That is correct behaviour (republishing a version is not
allowed), but it means *forgetting a version bump looks identical to a
successful publish*. Bump the version in the same commit as the change, or the
next publish quietly does nothing.

### `gambit-ui` ships CommonJS, and that is what broke both apps

No `module` field, no `exports` map. Installed from the registry it lands in
node_modules where Vite applies CommonJS interop and its named exports resolve;
as a `file:` link outside a project root, Vite treats it as source, skips the
interop, and Rollup reports its exports as missing.

Publishing makes the symptom go away, so this is not urgent — but a
browser-facing package emitting only CJS is still the wrong default, and every
consumer pays for it in bundling. Worth an ESM build (or dual output with an
`exports` map) before 1.0.

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

**Six modules are still staged for extraction and unpackaged**: `email`,
`events`, `change-log`, `data`, `ai`, `diagnostics`. All are leaf nodes except
`data` and `ai`, which depend on `auth`, so any order works.

**`gambit-person@0.1.0` is published and fully adopted** (quick 260904-nf1).
Every account-creation path in both apps runs through `createEnrollment`, and
each app has exactly one `Users.create` call site left — inside the adapter that
feeds it. Note that 0.1.0 is now immutable on the registry, so the next change
to this package needs a version bump before it can ship.

## Not doing, and why

**Merging the packages into one.** Considered and deferred. Merging is
mechanical; splitting is not — and the boundaries are still moving. Revisit at
`1.0`, with subpath exports and `npm deprecate` on the individual packages.

The peer-dependency union across everything staged is `express`,
`jsonwebtoken`, `mongoose`, `nodemailer`, `googleapis`, `zod`. `googleapis`
alone is ~100MB installed, so a single package means an app wanting only the
password rules pulls the Gmail API surface — unless every peer is optional,
which costs the package the ability to state honestly what it needs.
