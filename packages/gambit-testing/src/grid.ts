import {
  expectAllow,
  expectDeny401,
  expectDeny403,
  expectAdjacentPermOutcome,
  HttpResponseLike,
} from "./assertions";
import { RouteEntry, entriesForPermission, pickAdjacentPerm, resolvePath } from "./manifest";

/**
 * The per-permission grid.
 *
 * For every permission in a group, for every route that permission gates, it
 * asserts four things: the permission ALLOWS, no token is a 401, no permissions
 * is a 403, and a neighbouring permission gets the right answer. Plus a fifth
 * where the app has entitlements: the feature being off is a 403.
 *
 * That last pair is the whole point. A gate that checks nothing passes "the
 * right permission works". Only the DENIALS prove it is a gate — and the
 * adjacent case proves it is checking the right key rather than merely
 * checking non-emptiness.
 *
 * Uses the ambient `describe`/`it`, so it runs under jest and vitest without
 * either being a dependency.
 */

declare const describe: (name: string, fn: () => void) => void;
declare const it: {
  (name: string, fn: () => unknown): void;
  skip: (name: string, fn?: () => unknown) => void;
};

/** A permission as the app's catalog describes it. */
export interface CatalogPermission {
  key: string;
  group: string;
  label?: string;
  featureKey?: string;
}

export interface PermissionGridConfig {
  /** The catalog group this grid covers, e.g. "Patients". */
  group: string;
  /** The app's whole permission catalog. */
  catalog: readonly CatalogPermission[];
  /** The app's whole route manifest. */
  manifest: readonly RouteEntry[];
  /** Build a fresh request agent against a fresh app. */
  buildApp: () => RequestAgent;
  /**
   * Seed a user holding exactly these permissions, with these features.
   * The app owns this: it knows its cache, its claims, and its token mock.
   */
  withUser: (options: { permissions: string[]; features: string[] }) => void;
  /** Seed the absence of a user, so the next request carries no valid token. */
  withoutUser: () => void;
  /**
   * Does this app enable the group-prefix fallback in `createAuthorize`?
   * Must match what the app actually passes, or the adjacent assertions
   * predict the wrong outcome.
   */
  readImpliesGroupAccess: boolean;
  /** Every non-core feature key, for the deny case. Omit if there is no entitlement layer. */
  allFeatureKeys?: readonly string[];
  /** Routes to skip, e.g. a router that is not mounted in the test app. */
  skipRoute?: (route: RouteEntry) => boolean;
  /** Header used to carry the token. Defaults to a bearer Authorization. */
  authHeader?: () => [string, string];
}

/** The slice of supertest this needs. */
export interface RequestAgent {
  get(path: string): TestRequest;
  post(path: string): TestRequest;
  put(path: string): TestRequest;
  patch(path: string): TestRequest;
  delete(path: string): TestRequest;
}
export interface TestRequest extends PromiseLike<HttpResponseLike> {
  set(field: string, value: string): TestRequest;
  send(body: unknown): TestRequest;
}

/** Features that let a route past an entitlement layer, and nothing more. */
export function featuresForRoute(
  route: { featureKey?: string },
  heldPermission?: CatalogPermission,
): string[] {
  const keys = new Set<string>(["core"]);
  if (route.featureKey) keys.add(route.featureKey);
  // Under `authorizeAny` the entitlement is priced on what the role HOLDS, not
  // on the requirement — so a role reaching a route through its own permission
  // is priced on THAT permission's feature, which may differ from the route's.
  if (heldPermission?.featureKey) keys.add(heldPermission.featureKey);
  return [...keys];
}

export function buildPermissionGrid(config: PermissionGridConfig): void {
  const {
    group,
    catalog,
    manifest,
    buildApp,
    withUser,
    withoutUser,
    readImpliesGroupAccess,
    allFeatureKeys = [],
    skipRoute = () => false,
    authHeader = () => ["Authorization", "Bearer test-token"],
  } = config;

  const groupPerms = catalog.filter((p) => p.group === group);

  if (groupPerms.length === 0) {
    // A typo in the group name would otherwise produce an empty, PASSING suite.
    throw new Error(
      `buildPermissionGrid: no permissions with group "${group}". ` +
        `Known groups: ${[...new Set(catalog.map((p) => p.group))].sort().join(", ")}`,
    );
  }

  describe(`permission grid — ${group}`, () => {
    for (const perm of groupPerms) {
      describe(`${perm.key}${perm.label ? ` — ${perm.label}` : ""}`, () => {
        const routes = entriesForPermission(manifest, perm.key).filter((r) => !skipRoute(r));

        if (routes.length === 0) {
          // Surfaced as a skip rather than silence: a permission the catalog
          // defines and no route uses is worth seeing in the output.
          it.skip(`no routes gated on ${perm.key} (defined but unused)`);
          return;
        }

        for (const route of routes) {
          describe(`${route.method} ${route.path}`, () => {
            const path = resolvePath(route.path);
            const method = route.method.toLowerCase() as
              | "get" | "post" | "put" | "patch" | "delete";
            const send = (app: RequestAgent, body: unknown = {}) =>
              app[method](path).set(...authHeader()).send(body);

            it("ALLOW: holding the permission gets past the gate", async () => {
              const app = buildApp();
              withUser({ permissions: [perm.key], features: featuresForRoute(route, perm) });
              expectAllow(await send(app, route.sampleBody?.() ?? {}), perm.key);
            });

            it("DENY: no token is a 401", async () => {
              const app = buildApp();
              withoutUser();
              expectDeny401(await app[method](path).send({}), perm.key);
            });

            it("DENY: no permissions is a 403", async () => {
              const app = buildApp();
              withUser({ permissions: [], features: featuresForRoute(route, perm) });
              expectDeny403(await send(app), perm.key);
            });

            it("a neighbouring permission gets the documented outcome", async () => {
              const adjacent = pickAdjacentPerm(catalog, route.requiredPermissions);
              if (!adjacent || route.requiredPermissions.includes(adjacent)) return;

              const app = buildApp();
              const adjacentPerm = catalog.find((p) => p.key === adjacent);
              withUser({
                permissions: [adjacent],
                features: featuresForRoute(route, adjacentPerm),
              });
              expectAdjacentPermOutcome(await send(app), {
                requiredPermissions: route.requiredPermissions,
                adjacentPerm: adjacent,
                usesAny: route.usesAny,
                readImpliesGroupAccess,
                context: `${perm.key} vs ${adjacent}`,
              });
            });

            if (perm.featureKey && perm.featureKey !== "core" && allFeatureKeys.length) {
              it("DENY: the feature being disabled is a 403", async () => {
                const app = buildApp();
                // Everything EXCEPT the key under test, so the denial is
                // provably about that key and not about a bare feature set.
                withUser({
                  permissions: [perm.key],
                  features: ["core", ...allFeatureKeys.filter((k) => k !== perm.featureKey)],
                });
                expectDeny403(await send(app), perm.key);
              });
            }
          });
        }
      });
    }
  });
}
