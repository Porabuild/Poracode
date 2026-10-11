import type { ProjectLocation } from "@/shared/contracts";
import { readAgentCommandOutput } from "../base";
import { parseDevinModelCatalog, type DevinModelFamily } from "./models";
import { resolveDevinDefaultCatalogScope } from "./volatileCatalog";

/**
 * Volatile, in-process model catalog cache keyed by full execution identity.
 *
 * The legacy key was location kind/distro only, which let two same-OS profiles
 * (different accounts, orgs, or configs) read each other's catalog. Keys now
 * compose the composite execution identity (location + account + config
 * generation + org + runtime target + binary identity — plan §4) PLUS the
 * volatile scope digest (credential source + effective config content +
 * effective org — see `volatileCatalog.ts`): an external logout/login/token
 * replacement, a same-path native policy edit, or an org change at the same
 * static identity must never be served the previous state's catalog. The
 * volatile dimension is deliberately separate from the immutable session
 * binding: the catalog key changes with it while the resume binding survives
 * (it is bound to the proved stable user id instead — see
 * `accountIdentity.ts`). In-memory only — no persisted boundary (see
 * versioning notes in the runtime audit), so a key-format change invalidates
 * naturally on restart and invalidation is explicit rather than a version
 * bump. Every warm/load lane must pass a FULLY QUALIFIED scope — both fields
 * are required, so a key that omits a volatile dimension cannot be built;
 * lanes that cannot resolve the scope degrade to no catalog instead.
 */

const catalogs = new Map<string, DevinModelFamily[]>();

export interface DevinCatalogScope {
  location: ProjectLocation;
  /** Composite execution identity (see `resolveDevinExecutionContext.generation`). */
  generation: string;
  /**
   * Opaque memory-only digest of the EFFECTIVE credential + config + org
   * scope (see `volatileCatalog.ts`), resolved FRESH per request — external
   * files change under an immutable context. Appended last; the required
   * field makes a missing-dimension key unrepresentable, so no lane can
   * read or write an entry another credential/org/policy state cached.
   */
  volatileGeneration: string;
}

/** Cache key for a fully qualified execution scope. */
export function devinModelCatalogKey(scope: DevinCatalogScope): string {
  return `${scope.generation}|${scope.volatileGeneration}`;
}

export function cachedDevinModelsForKey(key: string): DevinModelFamily[] {
  return catalogs.get(key) ?? [];
}

/**
 * Default-account catalog load (root-adapter detection): resolves the native
 * default volatile scope so a login/logout/token rotation or a same-path
 * config/org change can never be served the previous state's catalog, and so
 * this lane shares one warmed entry with the base adapter's launch lanes.
 */
export async function loadDevinModels(
  location: ProjectLocation,
  executable = "devin",
  signal?: AbortSignal,
): Promise<DevinModelFamily[]> {
  const { generation, volatileGeneration } = await resolveDevinDefaultCatalogScope(
    location,
    signal,
  );
  return loadDevinModelsForKey(
    devinModelCatalogKey({ location, generation, volatileGeneration }),
    location,
    executable,
    signal,
  );
}

export async function loadDevinModelsForKey(
  key: string,
  location: ProjectLocation,
  executable = "devin",
  signal?: AbortSignal,
  /** The execution context's spawn env: the catalog subprocess must resolve the profile's account view, not the supervisor's environment. */
  env?: Record<string, string> | undefined,
  /** Organization and native policy selection are carried by the config prefix. */
  prefixArgs: readonly string[] = [],
): Promise<DevinModelFamily[]> {
  const result = await readAgentCommandOutput(
    location,
    executable,
    [...prefixArgs, "models", "list", "--format", "json"],
    { timeoutMs: 30_000, ...(signal ? { signal } : {}), ...(env ? { env } : {}) },
  );
  if (!result.ok) throw new Error("Unable to read Devin model catalog");
  const families = parseDevinModelCatalog(result.stdout);
  catalogs.set(key, families);
  return families;
}

/**
 * Warm-cache lookup that only spawns a catalog subprocess when the entry is
 * cold and `requiresCatalog` holds. Returns the cached families otherwise —
 * the launch-time fallback policy decides what an empty result means.
 */
export async function warmDevinModels(
  scope: DevinCatalogScope,
  executable: string,
  requiresCatalog: boolean,
  signal?: AbortSignal,
  env?: Record<string, string> | undefined,
  prefixArgs: readonly string[] = [],
): Promise<DevinModelFamily[] | undefined> {
  const key = devinModelCatalogKey(scope);
  const cached = catalogs.get(key);
  if (cached && cached.length > 0) return cached;
  if (!requiresCatalog) return cached ?? undefined;
  return loadDevinModelsForKey(key, scope.location, executable, signal, env, prefixArgs);
}

/**
 * Drop cached catalogs: one exact execution identity (`key`), every identity
 * sharing a prefix (`prefix`, e.g. environment + account after a login or
 * logout), or everything when neither is given.
 */
export function invalidateDevinModelCaches(options?: {
  key?: string | undefined;
  prefix?: string | undefined;
}): void {
  if (!options?.key && !options?.prefix) {
    catalogs.clear();
    return;
  }
  for (const key of [...catalogs.keys()]) {
    if (key === options.key || (options.prefix !== undefined && key.startsWith(options.prefix))) {
      catalogs.delete(key);
    }
  }
}
