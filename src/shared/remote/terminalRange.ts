import type { RemoteTerminalOutputCursorSyncV1 } from "./protocol";

export interface TerminalPosition {
  readonly generation: string | null;
  readonly cursor: number;
}

export type TerminalRangeResult =
  | { readonly kind: "append"; readonly data: string; readonly toCursor: number }
  | { readonly kind: "duplicate" }
  | { readonly kind: "resync"; readonly reason: "generation" | "gap" };

/** Reconcile a schema-validated output range with an installed snapshot.
 * Cursors use UTF-16 units, exactly like String.length/slice and the server.
 * A null snapshot generation is replace-only, never append-compatible. */
export function reconcileTerminalRange(
  position: TerminalPosition,
  data: string,
  range: RemoteTerminalOutputCursorSyncV1,
): TerminalRangeResult {
  if (position.generation === null || position.generation !== range.generation) {
    return { kind: "resync", reason: "generation" };
  }
  if (range.fromCursor > position.cursor) return { kind: "resync", reason: "gap" };
  if (range.toCursor <= position.cursor) return { kind: "duplicate" };
  return {
    kind: "append",
    data: data.slice(position.cursor - range.fromCursor),
    toCursor: range.toCursor,
  };
}
