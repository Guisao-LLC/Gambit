/**
 * @guisao-llc/gambit-testing
 *
 * The half of an authorization test suite that is the same in every app.
 *
 * An app's routes, permission catalog and models are its own. But the RULES
 * for testing them are not: what counts as "allowed", why a 500 must never
 * pass, that `authorizeAny` is strict even when `authorize` widens, that a
 * denial only proves anything if a NEIGHBOURING permission is also denied.
 *
 * Every one of those was wrong at least once in the app this came from, and
 * each was found by a test that had been quietly passing. Sharing them means
 * the second app inherits the corrections rather than re-deriving them and
 * getting them wrong differently.
 *
 * Framework-agnostic: the assertions are pure functions, and the grid uses the
 * ambient describe/it that jest and vitest both provide.
 */

export {
  expectAllow,
  expectDeny401,
  expectDeny403,
  expectAdjacentPermOutcome,
  AUTHORIZE_DENY_MESSAGES,
} from "./assertions";
export type { HttpResponseLike } from "./assertions";

export {
  resolvePath,
  entriesForPermission,
  pickAdjacentPerm,
  DEFAULT_PARAM_VALUES,
} from "./manifest";
export type { RouteEntry, HttpMethod } from "./manifest";

export { buildPermissionGrid, featuresForRoute } from "./grid";
export type {
  PermissionGridConfig,
  CatalogPermission,
  RequestAgent,
  TestRequest,
} from "./grid";
