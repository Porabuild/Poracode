/**
 * Model context windows from the V2 catalog.
 *
 * The V2 event stream reports token counts but never the window they fill, so
 * the session has to read `limit.context` itself. Without it the renderer falls
 * back to whatever `maxTokens` an earlier provider reported on the same thread
 * (a provider handoff never clears that row), and the context dock keeps showing
 * the old provider's window — e.g. 250K on a model whose catalog window is 1M.
 */

import type { ModelInfo, OpenCodeClient } from "./clientTypes";
import { modelCatalogKey, readOpenCodeContextLimit } from "./model";

type CatalogLimits = ReadonlyMap<string, number>;

interface CatalogSnapshot {
  fetchedAt: number;
  limits: Promise<CatalogLimits>;
}

/**
 * A pooled `opencode serve` keeps one catalog, but signing into a provider mid-
 * session adds models to it. Refreshing bounds that staleness without polling.
 */
const CATALOG_TTL_MS = 5 * 60 * 1000;

/**
 * `model.list` answers the whole provider catalog, and a pooled `opencode serve`
 * keeps that catalog for its lifetime, so one request serves every thread on the
 * pool. Keyed by the client instance (one per server process) and then by
 * location directory, which is the catalog's own scope. Each entry is the last
 * snapshot plus its fetch time; a superseded snapshot's request is dropped by the
 * identity checks below so a slow refresh cannot overwrite a newer one.
 */
const catalogLimits = new WeakMap<OpenCodeClient, Map<string, CatalogSnapshot>>();

function catalogCacheFor(client: OpenCodeClient): Map<string, CatalogSnapshot> {
  let byDirectory = catalogLimits.get(client);
  if (!byDirectory) {
    byDirectory = new Map();
    catalogLimits.set(client, byDirectory);
  }
  return byDirectory;
}

/** `providerID/modelID` → `limit.context`, for every model the catalog advertises. */
function readCatalogLimits(models: readonly ModelInfo[] | undefined): Map<string, number> {
  const limits = new Map<string, number>();
  for (const model of models ?? []) {
    if (!model || typeof model !== "object") continue;
    const { providerID, id } = model;
    if (typeof providerID !== "string" || typeof id !== "string") continue;
    const context = readOpenCodeContextLimit(model);
    if (context === undefined) continue;
    limits.set(modelCatalogKey(model), context);
  }
  return limits;
}

function fetchCatalog(
  client: OpenCodeClient,
  directory: string,
  signal: AbortSignal | undefined,
  byDirectory: Map<string, CatalogSnapshot>,
): CatalogSnapshot {
  const input = { location: { directory } };
  const request = (signal ? client.model.list(input, { signal }) : client.model.list(input)).then(
    (result) => readCatalogLimits(result.data),
  );
  let snapshot: CatalogSnapshot | undefined;
  const limits = request.catch((error: unknown) => {
    // A failed lookup must not poison the cache for later turns.
    if (snapshot && byDirectory.get(directory) === snapshot) byDirectory.delete(directory);
    throw error;
  });
  snapshot = { fetchedAt: Date.now(), limits };
  byDirectory.set(directory, snapshot);
  return snapshot;
}

/**
 * Context window (`limit.context`) of one catalog model, in tokens, or
 * `undefined` when the catalog does not advertise that model.
 */
export async function readOpenCodeContextWindowTokens(
  client: OpenCodeClient,
  directory: string,
  modelKey: string,
  signal?: AbortSignal,
): Promise<number | undefined> {
  const byDirectory = catalogCacheFor(client);
  const cached = byDirectory.get(directory);
  const snapshot =
    cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS
      ? cached
      : fetchCatalog(client, directory, signal, byDirectory);
  const limits = await snapshot.limits;
  // An unsettled activation answers with no models; retry on the next turn
  // instead of pinning "unknown" for the server's lifetime. A non-empty catalog
  // that merely omits this model stays cached: a model the catalog cannot answer
  // for must not turn every turn into a whole-catalog request, and the TTL is
  // what notices a model that appears after a provider connects mid-session.
  if (limits.size === 0 && byDirectory.get(directory) === snapshot) {
    byDirectory.delete(directory);
  }
  return limits.get(modelKey);
}
