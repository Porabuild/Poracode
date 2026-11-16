import { getSqlite } from "./connection";
import { readRuntimeSnapshot } from "./runtimeReadSnapshot";

export type RuntimePresentationSource =
  | { status: "ready"; type: string; state: string; payload: unknown; sourceBytes: number }
  | { status: "unavailable"; reason: "missing" | "unsupported" | "too_large" };

/** Keyed scalar preflight followed by payload-only materialization; no streams. */
export function dbReadRuntimePresentationSource(
  threadId: string,
  itemId: string,
  maxSourceBytes: number,
  acceptedTypes: readonly string[] = ["command_execution"],
): RuntimePresentationSource {
  const sqlite = getSqlite();
  return readRuntimeSnapshot(sqlite, () => {
    const metadata = sqlite
      .prepare(
        "SELECT type, state, COALESCE(octet_length(payload), 0) AS bytes FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
      )
      .get(threadId, itemId) as { type: string; state: string; bytes: number } | undefined;
    if (!metadata) return { status: "unavailable", reason: "missing" };
    if (!acceptedTypes.includes(metadata.type))
      return { status: "unavailable", reason: "unsupported" };
    if (metadata.bytes > maxSourceBytes) return { status: "unavailable", reason: "too_large" };
    const row = sqlite
      .prepare("SELECT payload FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?")
      .get(threadId, itemId) as { payload: string | null } | undefined;
    if (!row) return { status: "unavailable", reason: "missing" };
    let payload: unknown;
    try {
      payload = row.payload == null ? undefined : JSON.parse(row.payload);
    } catch {
      return { status: "unavailable", reason: "unsupported" };
    }
    return {
      status: "ready",
      type: metadata.type,
      state: metadata.state,
      payload,
      sourceBytes: metadata.bytes,
    };
  });
}
