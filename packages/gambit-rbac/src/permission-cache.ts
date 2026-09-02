/**
 * Role → permission cache.
 *
 * Every authorization decision reads from here, so it is a synchronous
 * in-memory map rather than a query. It knows nothing about tenants: this
 * answers "what may this ROLE do", which is the same question in any app.
 *
 * ── Why the loader is injected, and the cache is not ─────────────────────────
 *
 * The cache itself is module-level state, deliberately. Every consumer imports
 * `hasPermission` directly and expects the same cache; handing out instances
 * would mean threading one through every call site for no benefit, since a
 * process has exactly one set of roles.
 *
 * But WHERE roles come from is the app's business — its model, its tenant
 * scoping, its connection. So `refreshCache` does not import a model; it calls
 * the loader the app registered. Same rule as everywhere else here: a shared
 * module must not PICK the thing it depends on, it must be GIVEN it.
 */

export interface CachedRole {
  permissions: Set<string>;
  bypassFeatureChecks: boolean;
  /**
   * Carried through from the role record, and deliberately UNINTERPRETED here.
   *
   * The two apps this was extracted from both have this flag and mean
   * different things by it: in one it marks a role that is not scoped to a
   * single tenant; in the other it marks a role that bypasses every permission
   * check. A package that picked either meaning would silently break the app
   * that meant the other, so this layer only transports it — see
   * `isSuperRole` in `createAuthorize`, which is where an app says what it
   * means.
   */
  isGlobal: boolean;
}

/** The shape `loadRoles` must return. Anything else about a role is the app's. */
export interface LoadedRole {
  name: string;
  permissions: string[];
  bypassFeatureChecks?: boolean;
  isGlobal?: boolean;
}

export interface PermissionCacheConfig {
  /** Read every role. Called by `refreshCache` on boot and after role writes. */
  loadRoles: () => Promise<LoadedRole[]>;
  /** Where to report a refresh. Defaults to no output — a library should be quiet. */
  onRefresh?: (roleCount: number) => void;
}

const _cache = new Map<string, CachedRole>();
let _config: PermissionCacheConfig | undefined;

/** Register how roles are loaded. Call once, during app startup. */
export function configurePermissionCache(config: PermissionCacheConfig): void {
  _config = config;
}

/** Every permission held by a role. Empty set when the role is unknown. */
export function getPermissions(roleName: string): Set<string> {
  return _cache.get(roleName)?.permissions ?? new Set();
}

/** Does the role hold this exact permission? */
export function hasPermission(roleName: string, permission: string): boolean {
  return _cache.get(roleName)?.permissions.has(permission) ?? false;
}

/** Does the role hold at least one of these? */
export function hasAnyPermission(roleName: string, permissions: string[]): boolean {
  const entry = _cache.get(roleName);
  if (!entry) return false;
  return permissions.some((p) => entry.permissions.has(p));
}

/**
 * Which roles hold this permission.
 *
 * Lenient about junk input — empty or whitespace returns `[]` rather than
 * throwing — to match `hasPermission`, which answers `false` for an unknown
 * role instead of failing. Never mutates the cache.
 */
export function listRoleNamesWithPermission(permission: string): string[] {
  if (typeof permission !== "string" || permission.trim() === "") return [];
  const names: string[] = [];
  for (const [roleName, entry] of _cache.entries()) {
    if (entry.permissions.has(permission)) names.push(roleName);
  }
  return names;
}

/** The whole cached entry, including `bypassFeatureChecks`. */
export function getCachedRole(roleName: string): CachedRole | undefined {
  return _cache.get(roleName);
}

/**
 * Rebuild from the loader. Call on boot and after any role write.
 *
 * Throws on failure rather than swallowing: a silent refresh failure leaves
 * the cache stale after a write, so the app keeps enforcing permissions that
 * were just changed — and nothing anywhere says so.
 */
export async function refreshCache(): Promise<void> {
  if (!_config) {
    throw new Error(
      "gambit-rbac: refreshCache() before configurePermissionCache(). " +
        "Register a loadRoles during startup.",
    );
  }

  const roles = await _config.loadRoles();
  _cache.clear();
  for (const role of roles) {
    _cache.set(role.name, {
      permissions: new Set(role.permissions),
      bypassFeatureChecks: role.bypassFeatureChecks ?? false,
      isGlobal: role.isGlobal ?? false,
    });
  }
  _config.onRefresh?.(roles.length);
}

/**
 * Seed the cache directly. TESTS ONLY — never call this in production code.
 *
 * Clears before seeding, which matters more than it looks: a test that seeds
 * the role under test and expects a previously-seeded admin to survive gets
 * neither. Seed every role a single assertion needs in ONE call.
 */
export function _seedCacheForTesting(
  entries: Record<
    string,
    | string[]
    | { permissions: string[]; bypassFeatureChecks?: boolean; isGlobal?: boolean }
  >,
): void {
  _cache.clear();
  for (const [role, value] of Object.entries(entries)) {
    _cache.set(
      role,
      Array.isArray(value)
        ? { permissions: new Set(value), bypassFeatureChecks: false, isGlobal: false }
        : {
            permissions: new Set(value.permissions),
            bypassFeatureChecks: value.bypassFeatureChecks ?? false,
            isGlobal: value.isGlobal ?? false,
          },
    );
  }
}

/** Drop the loader and the contents. Tests that call `refreshCache` need this. */
export function _resetForTesting(): void {
  _cache.clear();
  _config = undefined;
}
