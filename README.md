# Gambit

The parts of an application that are not the application.

Every app in this family needs the same things before it can start being itself:
someone can log in, someone holds a role, mail gets delivered, a record has a
history, deleting a thing deletes what hung off it. Gambit is those parts, kept
in one place and versioned, so a new app starts with them already solved.

Two apps consume it today — a driving-school platform and a clinic platform.
Neither one's vocabulary appears anywhere in here, and that is enforced rather
than trusted (see **The rule**, below).

## Layout

```
packages/
  gambit-auth/        HTTP errors, JWT, request authentication
  gambit-cascade/     deleting a thing deletes what hung off it
  gambit-rbac/        roles, permissions, the authorize middleware, the cache
  gambit-account/     what an account IS — fields, password and avatar rules
  gambit-person/      who holds one — the person record, and enrolling them
  gambit-settings/    app settings with typed defaults
  gambit-testing/     the RBAC route grid every consuming app runs
  gambit-ui/          React panels built on the rules above
  create-gambit-app/  the generator that starts a new app with all of it
```

They landed in dependency order, and the graph is shallow: most depend on
nothing, `rbac` depends on `auth` and `cascade`, `person` and `ui` depend on
`account`. `gambit-auth` went first because everything else needs it.

`account` and `person` are the pair worth explaining, since the names do not
separate themselves. An account is a **credential**; a person is **who holds
it**. An app has accounts with no person behind them — a service account, a
seed administrator — and people who do not have an account yet.

Still staged for extraction and unpackaged: `email`, `events`, `change-log`,
`data`, `ai`, `diagnostics`.

## Install

```bash
npm install @guisao-llc/gambit-auth
```

That is the whole of it. Public packages on the public registry: no `.npmrc`,
no token, no registry configuration, nothing to add to a deploy environment.

That is a deliberate choice rather than an accident. The first plan put these in
GitHub Packages, which would have meant a `read:packages` token in every
consuming app's build environment — and that cost lands at deploy time, in a
clean container, as an install failure whose error message never mentions
tokens. There is nothing in here worth protecting: it is authentication,
authorization and mail plumbing. The value being kept private lives in the apps
that consume it, and stays there.

## Publishing

```bash
npm publish --workspace @guisao-llc/gambit-auth
```

`prepublishOnly` builds, runs the tests, and then runs `scripts/prepublish-check.mjs`
against the files that will actually ship. That last gate exists because npm
restricts unpublishing after 72 hours, so a leaked secret is public forever. It
refuses to publish on:

- an email address (`example.com` excepted — that is what docs are for)
- a private key block, AWS key id, GitHub or Slack token
- an assigned secret/password/token literal
- a connection string carrying credentials
- **app vocabulary** — a package naming a specific application is not a leak,
  but it is a design failure, and shipping it publicly makes that claim to
  strangers

It scans `dist/`, not `src/`, because those are different sets: `files`
controls what ships, and a comment stripped from source can still sit in a
stale build.

## Working on it

```bash
npm install        # once, at the root — npm workspaces
npm run build      # both module formats, across all packages
npm test           # each package's own suite
```

Tests run against `dist/`, not `src/`, deliberately: they assert what a consumer
actually receives after install — the compiled entrypoint, the exports
`package.json` points at, the runtime behavior. A test against source can pass
while the published artifact is broken.

## Module format

Every package ships **both** formats from one source tree:

```
dist/           CommonJS + the .d.ts files, shared by both halves
dist/esm/       the same code as ES modules
```

`exports` picks between them — `require` gets `dist/`, `import` gets `dist/esm/`
— and `main`/`module`/`types` stay as they were, so a resolver too old to read
`exports` still finds the CommonJS build. The type declarations are emitted once,
by the CommonJS pass, because two identical copies could only ever disagree.

This is not housekeeping. CommonJS-only is what took both apps down once:
installed from the registry a CJS package lands in `node_modules` and Vite
applies interop, but as a `file:` link it is treated as source, the interop is
skipped, and Rollup reports every named export as missing. `gambit-ui` is
browser code, and a browser package that cannot be tree-shaken makes every
consumer pay for the parts it does not import.

Two rules keep the dual build working:

- **Relative imports are written with a `.js` extension** — `./password-policy.js`,
  not `./password-policy`. TypeScript resolves it back to the `.ts` file and
  emits the specifier verbatim. Node's ESM loader requires the extension and
  `require` tolerates it, so it is the only spelling that satisfies both.
- **`dist/esm/package.json` is generated** (`scripts/mark-esm.mjs`) and contains
  `{"type": "module"}`. Without it Node reads those files under the root
  package's default — CommonJS — and throws on the first `import`.

Anything server-only sits behind its own subpath rather than the root, so the
root stays importable from a browser: `@guisao-llc/gambit-account/mongoose`,
`@guisao-llc/gambit-person/mongoose`. That split exists because re-exporting a
Mongoose schema from the root once dragged Node's `events` into a client bundle
and killed both apps with `Class extends value undefined` — a stack trace naming
neither Mongoose nor the package.

## The rule

**A Gambit package may import another Gambit package, a node builtin, or an npm
dependency. Nothing else.**

That sounds obvious and is easy to break by accident. In the app this was
extracted from, the guard originally checked two *denylists* — don't import from
`models/`, don't import from `config/` — and a middleware sat for months
importing the app's own JWT module, because it was neither of those. It would
have surfaced only when the foundation package failed to extract.

The check is an allowlist now, derived from the list of packages itself, so
there is no second table to keep in sync.

### A clean import graph is not proof of portability

Learned the expensive way. A generic CRUD handler passed every static measure —
named no app concept, imported no app model, 109 lines of pure express and
mongoose. Repointing its JWT import from the app's module to the generic one
turned four authorization tests red, because the app's test harness *mocked*
that module and reaching around the mock made the handler really verify a fake
token.

So: **anything that needs to know who the caller is takes that knowledge as
config.** `createAuthenticate` takes a `verifyToken`. So does the authorization
middleware, and so does the CRUD layer. Three seams, one shape — and the host
app's mocks keep working, which is the part that catches this class of bug.

Run the consuming app's full suite after moving any import. Compare test
**counts**, not just pass/fail: a suite that fails to compile contributes zero
tests and hides in the totals rather than failing.

## Versioning

Packages are versioned independently and pinned by consumers. The point of the
whole exercise is that the core can change on its own branch without either app
moving until it chooses to.

Two traps, both of which have already cost something:

- **A caret on a `0.x` version admits PATCH ONLY.** `^0.1.0` will never install
  `0.2.0`. An app pinned that way does not fall behind loudly — it simply stays
  where it is, and the gap only shows up when someone compares two apps by hand.
- **`publish-all` skips a package whose version already exists**, which is
  correct (a published version is immutable) but means *forgetting a version
  bump looks exactly like a successful publish*. Bump in the same commit as the
  change.
