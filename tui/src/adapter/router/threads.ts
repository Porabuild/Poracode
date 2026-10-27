import type { Thread, ProjectLocation, AgentStatus } from "@/shared/contracts";
import type { RemoteProject } from "@/shared/remote";
import type { SessionInfo } from "@opencode/client";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { toolCallPayloadSchema } from "@/shared/contracts/runtimeEvent";
import { record } from "./helpers";
import { logAdapterDebug } from "../diagnostics";
import { parseSubSessionId, sessionId, subSessionId, threadId } from "../ids";
import type { RouterContext } from "./context";

/** Thread projection helpers: sessions, sub-sessions, paging, and cursors. */
export function createThreads(ctx: RouterContext) {
  const projectLocation = (value: RemoteProject): ProjectLocation => value.location;
  const directoryOf = (value: ProjectLocation) =>
    value.kind === "wsl" ? value.uncPath : value.path;

  const toSession = (value: Thread, currentProject: RemoteProject): SessionInfo => {
    const sessionDirectory = value.worktreePath ?? ctx.directoryOf(currentProject.location);
    const output = {
      id: sessionId(value.id),
      projectID: currentProject.id,
      agent: value.config.mode === "plan" ? "plan" : "build",
      model: { id: value.config.model, providerID: value.agentKind },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: Date.parse(value.createdAt), updated: Date.parse(value.updatedAt) },
      title: value.title,
      // poracode: child threads (isSubAgent) surface as subsessions.
      ...(value.parentThreadId ? { parentID: sessionId(value.parentThreadId) } : {}),
      ...(ctx.pendingReverts.has(sessionId(value.id))
        ? { revert: { messageID: ctx.pendingReverts.get(sessionId(value.id))!.messageID } }
        : {}),
      location: { directory: sessionDirectory },
    } satisfies SessionInfo;
    return output;
  };

  // Virtual read-only subsessions for subagent task items: the canonical
  // tool_call payload carries no child-thread reference, so each subagent item
  // becomes a `ses_<thread>__<item>` session whose messages are the parent's
  // items nested under it via `parentItemId`.
  const listThreadItems = async (rawThreadId: string) => {
    // Pages arrive newest-first (each beforePosition step goes one page
    // older), so reverse page order to get a chronological array.
    const pages: PersistedRuntimeItem[][] = [];
    let beforePosition: number | undefined;
    for (;;) {
      const page = await ctx.input.client.threadRuntimeItemsPage({
        threadId: rawThreadId,
        ...(beforePosition !== undefined ? { beforePosition } : {}),
        limit: 500,
      });
      pages.push(page.items);
      if (page.nextCursor == null) break;
      beforePosition = page.nextCursor;
      if (pages.length >= 200) {
        if (ctx.debug)
          void logAdapterDebug(ctx.input.bootstrap.home, {
            source: "items.page-cap",
            threadId: rawThreadId,
            pages: pages.length,
          });
        break;
      }
    }
    return pages.reverse().flat();
  };

  const isSubAgentItem = (item: PersistedRuntimeItem) =>
    item.type === "tool_call" &&
    toolCallPayloadSchema.safeParse(item.payload).data?.isSubAgent === true;

  // A `ses_<thread>__<item>` id is a live subsession only when no real thread
  // resolves to the same id — real thread ids always win.
  // poracode: desktop terminal-mode threads are hidden in the TUI. A thread's
  // presentation resolves like the renderer model picker: the thread's own
  // field first, then its provider's capability, defaulting to "terminal".
  const presentationOf = (value: Thread, statusList: AgentStatus[]) =>
    value.presentationMode ??
    statusList.find((status) => status.kind === value.agentKind)?.capabilities.presentationMode ??
    "terminal";
  const isGuiThread = (value: Thread, statusList: AgentStatus[]) =>
    presentationOf(value, statusList) === "gui";
  const guiThreads = async () => {
    const threads = await listThreads();
    const statusList =
      typeof ctx.input.client.agentStatuses === "function" ? await ctx.agentStatuses() : [];
    return threads.filter((value) => ctx.isGuiThread(value, statusList));
  };
  // The visibility gates resolve the thread from the cache (kept current by
  // listThreads + refreshChangedThreads) and only fetch on a miss, so hot
  // routes (prompt/interrupt) do not add a host round-trip.
  const cachedThreadById = async (rawId: string) => {
    let hit = ctx.threadCache.get(rawId);
    if (!hit && typeof ctx.input.client.boundedThreadListPage === "function")
      hit = await ctx.findThreadById(rawId);
    return hit;
  };
  // Modules under adapter/router/ reach helpers still declared here through
  // the shared context until their own extraction; bridge at the source.
  const statusListNow = async () =>
    typeof ctx.input.client.agentStatuses === "function" ? await ctx.agentStatuses() : [];
  const isHiddenThread = async (rawId: string) => {
    const hit = await cachedThreadById(rawId);
    return hit !== undefined && !ctx.isGuiThread(hit, await statusListNow());
  };
  const visibleThread = async (rawId: string) => {
    const hit = await cachedThreadById(rawId);
    return hit !== undefined && ctx.isGuiThread(hit, await statusListNow()) ? hit : undefined;
  };

  const isLiveSubSession = async (session: string) => {
    const parsed = parseSubSessionId(session);
    if (!parsed) return false;
    const threads = await guiThreads();
    if (threads.some((value) => value.id === threadId(session))) return false;
    const parent = threads.find((value) => value.id === parsed.threadId);
    if (!parent) return false;
    return (await listThreadItems(parent.id)).some(
      (value) => value.id === parsed.itemId && ctx.isSubAgentItem(value),
    );
  };

  const toSubSession = (
    parent: Thread,
    item: PersistedRuntimeItem,
    currentProject: RemoteProject,
  ): SessionInfo => {
    const payload = toolCallPayloadSchema.safeParse(item.payload);
    return {
      id: subSessionId(parent.id, item.id),
      projectID: currentProject.id,
      agent: parent.config.mode === "plan" ? "plan" : "build",
      model: { id: parent.config.model, providerID: parent.agentKind },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: Date.parse(parent.createdAt), updated: Date.parse(parent.updatedAt) },
      title:
        (payload.success ? (payload.data.title ?? payload.data.name) : undefined) ??
        "Subagent session",
      parentID: sessionId(parent.id),
      location: { directory: ctx.directoryOf(currentProject.location) },
    } satisfies SessionInfo;
  };

  const collectThreads = (page: { threads: Thread[] }) => {
    for (const value of page.threads) {
      ctx.threadCache.set(value.id, value);
      ctx.input.registerThreadContext(value.id, {
        agent: value.config.mode === "plan" ? "plan" : "build",
        providerID: value.agentKind,
        model: value.config.model,
        location: { directory: ctx.input.bootstrap.directory },
      });
    }
  };
  const threadListPage = async (continuation?: {
    cursor: string;
    after: unknown;
  }): Promise<{ threads: Thread[]; next?: { cursor: string; after: unknown } }> => {
    const result = await ctx.input.client.boundedThreadListPage(
      continuation
        ? {
            mode: "page",
            order: "updated",
            limit: 100,
            cursor: continuation.cursor,
            after: continuation.after as never,
          }
        : { mode: "page", order: "updated", limit: 100 },
    );
    collectThreads(result.page);
    const nextCursor = record(result.page).nextCursor;
    const after = record(result).reads ?? record(result.page).proof;
    return {
      threads: result.page.threads,
      // Only page onward when the host gave a real proof — sending the whole
      // result as `after` breaks the continuation contract.
      ...(typeof nextCursor === "string" && nextCursor && after !== undefined
        ? { next: { cursor: nextCursor, after } }
        : {}),
    };
  };
  const listThreads = async () => (await threadListPage()).threads;
  // Older threads than the newest page are reachable: a cachedThreadById miss
  // pages onward (10 pages of 100) until it hits, so deep threads still open.
  const findThreadById = async (rawId: string) => {
    let continuation: { cursor: string; after: unknown } | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await threadListPage(continuation);
      const hit = result.threads.find((value) => value.id === rawId);
      if (hit) return hit;
      continuation = result.next;
      if (!continuation) return undefined;
    }
    return undefined;
  };
  // Opaque vendored cursor: `tp1.` + base64({cursor, after}) — wraps the host's
  // continuation token + the page proof the continuation needs.
  const encodeThreadCursor = (next: { cursor: string; after: unknown }) =>
    `tp1.${Buffer.from(JSON.stringify(next), "utf8").toString("base64url")}`;
  const decodeThreadCursor = (value: string | null) => {
    if (!value?.startsWith("tp1.")) return undefined;
    try {
      return record(JSON.parse(Buffer.from(value.slice(4), "base64url").toString("utf8"))) as {
        cursor: string;
        after: unknown;
      };
    } catch {
      return undefined;
    }
  };

  return {
    projectLocation,
    directoryOf,
    toSession,
    listThreadItems,
    isSubAgentItem,
    presentationOf,
    isGuiThread,
    guiThreads,
    cachedThreadById,
    statusListNow,
    isHiddenThread,
    visibleThread,
    isLiveSubSession,
    toSubSession,
    collectThreads,
    threadListPage,
    listThreads,
    findThreadById,
    encodeThreadCursor,
    decodeThreadCursor,
  };
}
