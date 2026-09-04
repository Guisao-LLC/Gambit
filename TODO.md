# TODO

Package work. App-specific items live in each app's own repo — deliberately,
since this one is public and some of them describe gaps that should not be
advertised.

## Publish `create-gambit-app`

`0.1.0` is built, tested and pushed but not on the registry. Until it is,
`npm create @guisao-llc/gambit-app` only works on the machine that built it.

```bash
node scripts/publish-all.mjs --web
```

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

**Seven modules are still staged for extraction and unpackaged**: `email`,
`events`, `person`, `change-log`, `data`, `ai`, `diagnostics`. All are leaf
nodes except `data` and `ai`, which depend on `auth`, so any order works.

## Not doing, and why

**Merging the packages into one.** Considered and deferred. Merging is
mechanical; splitting is not — and the boundaries are still moving. Revisit at
`1.0`, with subpath exports and `npm deprecate` on the individual packages.

The peer-dependency union across everything staged is `express`,
`jsonwebtoken`, `mongoose`, `nodemailer`, `googleapis`, `zod`. `googleapis`
alone is ~100MB installed, so a single package means an app wanting only the
password rules pulls the Gmail API surface — unless every peer is optional,
which costs the package the ability to state honestly what it needs.
