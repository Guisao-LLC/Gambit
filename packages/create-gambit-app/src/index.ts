#!/usr/bin/env node
/**
 * Scaffold a new app that already has authentication, RBAC and a profile.
 *
 *   npm create @guisao-llc/gambit-app my-app
 *   npx @guisao-llc/create-gambit-app my-app --tenant practiceId
 *
 * ── What it copies, and what it links ────────────────────────────────────────
 *
 * It COPIES the glue and LINKS the rules. Everything generated here is code the
 * new app owns and will edit: its permission catalog, its user model, its
 * routes. Everything it depends on — how a token is verified, what makes a
 * password acceptable, how a role resolves to permissions — comes from the
 * Gambit packages as pinned dependencies.
 *
 * That split is the whole design. Copied code drifts and cannot be fixed
 * centrally; linked code cannot be adapted. The line between them is: does
 * every app need this to be the SAME, or does every app need it to be its OWN?
 *
 * The numbers behind that: adopting these packages by hand took an afternoon
 * per app and produced roughly 780 lines of glue. This generates that glue.
 */

import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(HERE, "..", "templates");

interface Options {
  /** Directory to create. Also the default package name. */
  name: string;
  /**
   * Field scoping roles and accounts to an organization, e.g. `schoolId`.
   * Omit for a single-tenant app — the fragments make the tenant optional, and
   * an app without one should not carry a field nothing ever sets.
   */
  tenant?: string;
  /** Collection the tenant field references, e.g. "Schools". */
  tenantRef?: string;
}

function parseArgs(argv: string[]): Options | null {
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split("=");
      flags[key] = inline ?? argv[++i] ?? "";
    } else {
      positional.push(arg);
    }
  }

  if (!positional[0] || flags.help !== undefined) return null;
  return {
    name: positional[0],
    tenant: flags.tenant || undefined,
    tenantRef: flags["tenant-ref"] || undefined,
  };
}

const USAGE = `
Scaffold an app with authentication, RBAC and a profile already working.

  npm create @guisao-llc/gambit-app my-app
  npx @guisao-llc/create-gambit-app my-app --tenant practiceId --tenant-ref Practices

  --tenant <field>       scope roles and accounts to an organization, e.g. schoolId.
                         Omit for a single-tenant app: the schema fragments make
                         the tenant optional, and an app without one should not
                         carry a field nothing ever sets.
  --tenant-ref <model>   the collection that field references, e.g. Schools.

Then:
  cd my-app/server && npm install && cp .env.example .env.development.local
  npm test && npm run dev
`;

/**
 * Substitute the placeholders a template carries.
 *
 * Deliberately a plain string replace over a template ENGINE. The templates are
 * real, compiling TypeScript that can be opened and read — adding a syntax on
 * top would make them neither valid code nor a readable template, and the whole
 * value of shipping them is that a person can see what their app will contain.
 */
function render(source: string, options: Options): string {
  const tenantFields = options.tenant
    ? `{ field: "${options.tenant}", type: "ObjectId"${options.tenantRef ? `, ref: "${options.tenantRef}"` : ""} }`
    : "undefined";
  const roleTenant = options.tenant
    ? `{ field: "${options.tenant}"${options.tenantRef ? `, ref: "${options.tenantRef}"` : ""} }`
    : "undefined";

  return source
    .replaceAll("__APP_NAME__", options.name)
    .replaceAll("__ACCOUNT_TENANT__", tenantFields)
    .replaceAll("__ROLE_TENANT__", roleTenant)
    .replaceAll(
      "__TENANT_FIELD_DECL__",
      options.tenant ? `\n  ${options.tenant}?: mongoose.Types.ObjectId;` : "",
    );
}

async function copyTree(from: string, to: string, options: Options): Promise<number> {
  let written = 0;
  for (const entry of await readdir(from)) {
    const src = join(from, entry);
    // `.tmpl` is stripped on the way out: it keeps template files from being
    // picked up by this package's own tsc, lint or test globs, which would
    // otherwise try to compile code full of placeholders.
    const dest = join(to, entry.replace(/\.tmpl$/, ""));

    if ((await stat(src)).isDirectory()) {
      await mkdir(dest, { recursive: true });
      written += await copyTree(src, dest, options);
      continue;
    }

    if (entry.endsWith(".tmpl")) {
      await writeFile(dest, render(await readFile(src, "utf8"), options));
    } else {
      await cp(src, dest);
    }
    written++;
  }
  return written;
}

const options = parseArgs(process.argv.slice(2));
if (!options) {
  console.log(USAGE);
  process.exit(process.argv.length > 2 ? 0 : 1);
}

const target = join(process.cwd(), options.name);
if (existsSync(target)) {
  // Refuse rather than merge. Writing into a directory that already has
  // content is how a generator silently overwrites work.
  console.error(`\n${options.name} already exists. Choose another name or remove it.\n`);
  process.exit(1);
}

await mkdir(target, { recursive: true });
const count = await copyTree(TEMPLATES, target, options);

console.log(`
Created ${relative(process.cwd(), target)} — ${count} files.

  ${options.tenant ? `Tenant: ${options.tenant}${options.tenantRef ? ` -> ${options.tenantRef}` : ""}` : "Single-tenant: no organization scoping."}

Next:

  cd ${options.name}/server
  npm install
  cp .env.example .env.development.local     # then set MONGO_URI and JWT_SECRET
  npm test                                    # the RBAC grid, already passing
  npm run dev

What you get, already working: signup and login, a role-and-permission
system with an authorize() middleware, your own profile with an avatar and
a password change, and a test suite that asserts every gated route allows
the right permission and denies a neighbouring one.

What to edit first: src/config/permissions.ts. It is your app's catalog,
and everything else reads from it.
`);
