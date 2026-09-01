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
```

More land in dependency order. The graph across the modules staged for
extraction is shallow — most packages depend on nothing, `ai` and `data` depend
on `auth`, `rbac` depends on `auth` and `cascade` — so `gambit-auth` goes first
because everything else needs it.

## Install

Packages publish to **GitHub Packages**, not npmjs. A consuming app needs two
things.

An `.npmrc` telling npm where the scope lives:

```
@guisao-llc:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

And `NODE_AUTH_TOKEN` in the environment — a PAT with `read:packages` to
install, `write:packages` to publish.

> **This bites at deploy time, not at your desk.** Render runs `npm ci` in a
> clean container with no token unless you put one there. Add `NODE_AUTH_TOKEN`
> to the service environment for **every** app that consumes Gambit, before the
> first deploy that depends on it — otherwise the build fails at install and the
> error will not obviously be about a token.

Then:

```bash
npm install @guisao-llc/gambit-auth
```

## Working on it

```bash
npm install        # once, at the root — npm workspaces
npm run build      # tsc --build across all packages
npm test           # each package's own suite
```

Tests run against `dist/`, not `src/`, deliberately: they assert what a consumer
actually receives after install — the compiled entrypoint, the exports
`package.json` points at, the runtime behavior. A test against source can pass
while the published artifact is broken.

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
