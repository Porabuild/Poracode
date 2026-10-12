import type { CodexClientRequestMap } from "./protocol";
import { CodexRpcResponseError } from "./appServerRpc";

type Method = "thread/turns/list" | "thread/read";
type Turn = CodexClientRequestMap["thread/turns/list"]["result"]["data"][number];
interface Host {
  request<M extends Method>(
    method: M,
    params: CodexClientRequestMap[M]["params"],
    timeoutMs?: number,
  ): Promise<CodexClientRequestMap[M]["result"]>;
}

/** Newest-first IDs/statuses only. Paginated servers must never reconstruct
 * full item history for revert planning or process retirement. */
export async function readCodexTurnSummaries(
  host: Host,
  threadId: string,
  options: {
    count?: number;
    maxPages?: number;
    timeout?: () => number;
    isCurrent?: () => boolean;
  } = {},
): Promise<Turn[]> {
  const turns: Turn[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  while (options.isCurrent?.() !== false) {
    let page: CodexClientRequestMap["thread/turns/list"]["result"];
    try {
      page = await host.request(
        "thread/turns/list",
        {
          threadId,
          cursor,
          limit: Math.min(100, (options.count ?? Infinity) - turns.length),
          sortDirection: "desc",
          itemsView: "notLoaded",
        },
        options.timeout?.(),
      );
    } catch (error) {
      if (cursor !== null || !(error instanceof CodexRpcResponseError && error.code === -32601))
        throw error;
      // Pre-pagination servers have no paginated-thread deprecation. Preserve
      // their old read behavior only when the new method is unavailable.
      if (options.isCurrent?.() === false) return turns;
      const result = await host.request(
        "thread/read",
        { threadId, includeTurns: true },
        options.timeout?.(),
      );
      return [...(result.thread?.turns ?? [])].reverse().slice(0, options.count);
    }
    if (options.isCurrent?.() === false) return turns;
    if (!Array.isArray(page.data)) throw new Error("Codex omitted the turn summary page.");
    turns.push(...page.data);
    pages++;
    if (
      turns.length >= (options.count ?? Infinity) ||
      pages >= (options.maxPages ?? Infinity) ||
      page.nextCursor === null
    )
      return turns;
    if (typeof page.nextCursor !== "string" || seen.has(page.nextCursor))
      throw new Error("Codex returned an invalid turn continuation cursor.");
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  return turns;
}
