import type { CatalogKind } from "./boundedCatalogAlgorithm";

/**
 * Per-connection, per-kind manual-order fence shared by the bounded-catalog
 * consumers (the managed root adapter and the paired/remote server store).
 *
 * Threads and projects are independent order spaces: a completed paint pass of
 * one kind must never invalidate an in-flight pass of the other, and two
 * connections must never invalidate each other's walks. The fence is keyed by
 * the connection key (`managed-root` for the desktop's own catalog, the
 * connection key for each paired/remote catalog), so configuring one consumer
 * can neither reset nor clobber another consumer's order generation.
 *
 * Every actor that starts a new manual order for a connection and kind bumps
 * that kind's generation: a user reorder intent (which paints optimistically
 * before the host confirms), an authoritative manual paint pass that applies
 * the host's id order, the failed-order recovery when it applies, and an
 * authority (activation) replacement (which invalidates both kinds of that
 * connection). A long multi-page walk captures its kind's generation when it
 * starts and refuses to apply its captured order once that kind's generation
 * moved, so a late recovery can never overwrite a newer local intent or a
 * newer authoritative order of the same connection and kind.
 *
 * A local intent stays "in flight" from dispatch until it settles, and paint
 * applications of that kind are deferred while one of its intents is in flight
 * so an unrelated pass cannot clobber the acting client's optimistic paint
 * before the host confirms it. When the intent settles its generation is bumped
 * again, and the intent's own success/failure path re-runs the authoritative
 * convergence.
 */
interface CatalogOrderFence {
  generation: number;
  inFlightIntents: number;
}

const fences = new Map<string, Record<CatalogKind, CatalogOrderFence>>();

function connectionFence(connectionKey: string): Record<CatalogKind, CatalogOrderFence> {
  let fence = fences.get(connectionKey);
  if (!fence) {
    fence = {
      threads: { generation: 0, inFlightIntents: 0 },
      projects: { generation: 0, inFlightIntents: 0 },
    };
    fences.set(connectionKey, fence);
  }
  return fence;
}

export function catalogOrderGenerationFor(connectionKey: string, kind: CatalogKind): number {
  return connectionFence(connectionKey)[kind].generation;
}

export function bumpCatalogOrderGenerationFor(connectionKey: string, kind: CatalogKind): number {
  const fence = connectionFence(connectionKey)[kind];
  fence.generation += 1;
  return fence.generation;
}

/**
 * Mark the start of a local order intent (optimistic paint) for one connection
 * and kind, and return an idempotent settle function for its success/failure
 * path.
 */
export function beginCatalogOrderIntentFor(connectionKey: string, kind: CatalogKind): () => void {
  const fence = connectionFence(connectionKey)[kind];
  fence.inFlightIntents += 1;
  bumpCatalogOrderGenerationFor(connectionKey, kind);
  let settled = false;
  return () => {
    if (settled) return;
    settled = true;
    fence.inFlightIntents -= 1;
    bumpCatalogOrderGenerationFor(connectionKey, kind);
  };
}

export function catalogOrderIntentInFlightFor(connectionKey: string, kind: CatalogKind): boolean {
  return connectionFence(connectionKey)[kind].inFlightIntents > 0;
}

/** An authority (activation) replacement invalidates every in-flight walk. */
export function bumpCatalogOrderGenerations(connectionKey: string): void {
  bumpCatalogOrderGenerationFor(connectionKey, "threads");
  bumpCatalogOrderGenerationFor(connectionKey, "projects");
}

/**
 * Drop one connection's fence state. Only the owner that knows no intent of
 * that connection can still settle may call this (a test reset); production
 * fences are left in place so a late settle can never decrement a fresh fence
 * below zero.
 */
export function forgetCatalogOrderFence(connectionKey: string): void {
  fences.delete(connectionKey);
}

/** Test-only: drop every connection's fence state. */
export function __resetCatalogOrderFencesForTest(): void {
  fences.clear();
}
