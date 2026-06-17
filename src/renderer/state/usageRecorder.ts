import {
  type AiActionType,
  type RuntimeEvent,
  type Thread,
  type UsageEventInputPayload,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

/**
 * Durable usage capture at the canonical-event layer.
 *
 * Every provider's runtime events are already normalized into the canonical
 * `RuntimeEvent` stream before they reach here, so this is the single place we
 * derive usage facts - no per-provider splits. Each fact is written to the
 * durable `usage_events` log (no thread FK), with provider/model/mode embedded,
 * so the stats survive thread delete/archive.
 *
 * Writes are buffered and flushed on a debounce (fire-and-forget IPC) so the hot
 * event path is never blocked. This module intentionally does NOT import the app
 * store (callers pass the Thread) to avoid an import cycle with the slices.
 */

// Flush during renderer idle so the write never competes with an active frame;
// the timeout caps latency. A hard buffer cap forces an early flush so a delayed
// idle slot can't let the buffer grow unbounded.
const FLUSH_IDLE_TIMEOUT_MS = 2000;
const MAX_BUFFER = 1000;
// Cap the dedup sets so a marathon session can't grow them without bound. The
// window only needs to span an optimistic-render + supervisor-echo of the same
// id (milliseconds apart), so a periodic reset is harmless.
const DEDUP_CAP = 20000;

let buffer: UsageEventInputPayload[] = [];
let scheduled: { cancel: () => void } | null = null;
const turnStartByThread = new Map<string, { turnId: string; startedAt: number }>();
// Cumulative usedTokens per thread, used for the LAG delta. Intentionally NOT
// cleared per turn: usedTokens is cumulative across a thread's whole life, so
// resetting it would make the next delta count the full context again. One int
// per thread that streamed tokens this session - cleared on app restart.
//
// Presence (`.has`), not just value, carries meaning. A thread created THIS
// session is seeded to 0 by recordThreadStarted, so its first context.updated
// counts the whole new context (delta from 0). A thread RESUMED from a prior
// session has no entry: its first context.updated reports a context whose
// tokens were already counted last session, so we only establish the baseline
// and emit nothing - otherwise the restored context would be double-counted on
// every restart, inflating lifetime/peak. See the context.updated case below.
const lastUsedByThread = new Map<string, number>();
// Token deltas coalesced per provider|model between flushes, so a turn that
// streams many context.updated events produces ONE row, not dozens.
const pendingTokens = new Map<
  string,
  { provider: string | null; model: string | null; value: number }
>();
const seenItems = new Set<string>();
const seenTurns = new Set<string>();

function flush(): void {
  if (scheduled) {
    scheduled.cancel();
    scheduled = null;
  }
  if (pendingTokens.size > 0) {
    const ts = Date.now();
    for (const t of pendingTokens.values()) {
      buffer.push({ ts, kind: "tokens", provider: t.provider, model: t.model, value: t.value });
    }
    pendingTokens.clear();
  }
  if (buffer.length === 0) return;
  const events = buffer;
  buffer = [];
  void readBridge()
    .appendUsageEvents({ events })
    .catch(() => undefined);
}

function scheduleFlush(): void {
  if (scheduled) return;
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(
      () => {
        scheduled = null;
        flush();
      },
      { timeout: FLUSH_IDLE_TIMEOUT_MS },
    );
    scheduled = { cancel: () => cancelIdleCallback(id) };
  } else {
    const id = setTimeout(() => {
      scheduled = null;
      flush();
    }, FLUSH_IDLE_TIMEOUT_MS);
    scheduled = { cancel: () => clearTimeout(id) };
  }
}

function push(event: UsageEventInputPayload): void {
  buffer.push(event);
  if (buffer.length >= MAX_BUFFER) flush();
  else scheduleFlush();
}

/** Add to a bounded dedup set; returns false if already seen. */
function remember(set: Set<string>, id: string): boolean {
  if (set.has(id)) return false;
  if (set.size >= DEDUP_CAP) set.clear();
  set.add(id);
  return true;
}

// Don't lose buffered events when the window is hidden or closed.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

interface Meta {
  provider: string;
  model: string | null;
  mode: string;
  fast: boolean;
  effort: string | null;
}

function metaOf(thread: Thread): Meta {
  return {
    // Full account-scoped kind (e.g. "claude:work"), so usage of different
    // profiles of the same provider is counted separately. The global rollup
    // folds to the base provider at read time.
    provider: thread.agentKind,
    model: thread.config.model ?? null,
    mode: thread.presentationMode === "gui" ? "chat" : "cli",
    fast: thread.config.fast === true,
    effort: thread.config.effort ?? null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}
function str(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = obj?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

interface ItemHit {
  kind: "message" | "goal" | "skill" | "subagent" | "mcp";
  name?: string;
}

function classifyItem(itemType: string, payload: unknown): ItemHit | undefined {
  if (itemType === "user_message") return { kind: "message" };
  const p = asRecord(payload);
  if (itemType === "goal") {
    return str(p, "action") === "set" ? { kind: "goal" } : undefined;
  }
  if (
    itemType !== "tool_call" &&
    itemType !== "dynamic_tool_call" &&
    itemType !== "mcp_tool_call"
  ) {
    return undefined;
  }
  const name = str(p, "name") ?? "";
  const title = str(p, "title") ?? "";
  const args = asRecord(p?.["args"]);

  if (itemType === "mcp_tool_call" || /^mcp__/.test(name)) {
    const match = /^mcp__(.+?)__/.exec(name);
    return { kind: "mcp", name: match?.[1] ?? str(p, "serverId") ?? "mcp" };
  }
  if (
    name === "Skill" ||
    /^(loaded|using) skill\b/i.test(name) ||
    /^(loaded|using) skill\b/i.test(title)
  ) {
    const skill =
      str(args, "skill") ??
      str(args, "name") ??
      title
        .replace(/^(loaded|using) skill[:\s]*/i, "")
        .replace(/^skill:\s*/i, "")
        .trim();
    return { kind: "skill", name: skill || "skill" };
  }
  const subagentType = str(args, "subagent_type");
  if (
    p?.["isSubAgent"] === true ||
    name === "Task" ||
    name === "Workflow" ||
    name === "Agent" ||
    subagentType
  ) {
    // Prefer the agent type (Task/Agent); for workflows use the saved name or
    // description (inline script workflows carry neither, so they bucket under a
    // generic "workflow"); otherwise the task description.
    const agent =
      subagentType ??
      (name === "Workflow"
        ? (str(args, "name") ?? str(args, "description") ?? "workflow")
        : (str(args, "description") ?? "subagent"));
    return { kind: "subagent", name: agent };
  }
  return undefined;
}

/** Record an AI-performed git action (commit / PR / conflict) into the buffer. */
export function recordAiAction(type: AiActionType, provider: string, model: string): void {
  push({ ts: Date.now(), kind: `ai_${type}`, provider, model, value: 1 });
}

/** Record that a thread was started (provider/model/mode/fast/effort). */
export function recordThreadStarted(thread: Thread): void {
  const m = metaOf(thread);
  // Seed the token baseline so this freshly-started thread's first
  // context.updated counts its initial context as new (delta from 0). Resumed
  // threads get no seed and are handled in the context.updated case below.
  if (!lastUsedByThread.has(thread.id)) lastUsedByThread.set(thread.id, 0);
  push({
    ts: Date.now(),
    kind: "thread_started",
    provider: m.provider,
    model: m.model,
    mode: m.mode,
    fast: m.fast,
    effort: m.effort,
    value: 1,
  });
}

/**
 * Derive durable usage events from a batch of canonical runtime events. Thread
 * metadata is resolved lazily so a pure `content.delta` frame (the streaming
 * common case) does no thread lookup and no allocation at all.
 */
export function recordRuntimeUsage(
  threadId: string,
  events: readonly RuntimeEvent[],
  threads: readonly Thread[],
): void {
  let metaResolved = false;
  let meta: Meta | null = null;
  const getMeta = (): Meta | null => {
    if (!metaResolved) {
      metaResolved = true;
      const thread = threads.find((t) => t.id === threadId);
      meta = thread ? metaOf(thread) : null;
    }
    return meta;
  };

  const now = Date.now();
  let tokensTouched = false;

  for (const event of events) {
    switch (event.type) {
      case "turn.started":
        if (turnStartByThread.get(threadId)?.turnId !== event.turnId) {
          turnStartByThread.set(threadId, { turnId: event.turnId, startedAt: now });
        }
        break;
      case "turn.completed": {
        if (event.state === "completed" && remember(seenTurns, event.turnId)) {
          const m = getMeta();
          if (m) {
            const start = turnStartByThread.get(threadId);
            const startedAt = start?.turnId === event.turnId ? start.startedAt : now;
            push({
              ts: now,
              kind: "turn",
              provider: m.provider,
              model: m.model,
              mode: m.mode,
              fast: m.fast,
              effort: m.effort,
              value: Math.max(0, now - startedAt),
            });
          }
        }
        turnStartByThread.delete(threadId);
        break;
      }
      case "context.updated": {
        const used = event.usage.usedTokens;
        if (typeof used === "number" && used > 0) {
          // No baseline means this thread was resumed from a prior session: its
          // usedTokens already reflects context counted then, so only establish
          // the baseline and emit nothing. Counting delta-from-zero here would
          // re-add the whole restored context. Threads started this session are
          // seeded to 0 by recordThreadStarted, so they DO count their first
          // context.
          const hasBaseline = lastUsedByThread.has(threadId);
          const prev = lastUsedByThread.get(threadId) ?? 0;
          lastUsedByThread.set(threadId, used);
          const delta = hasBaseline ? Math.max(0, used - prev) : 0;
          if (delta > 0) {
            const m = getMeta();
            if (m) {
              const key = `${m.provider}|${m.model ?? ""}`;
              const entry = pendingTokens.get(key);
              if (entry) entry.value += delta;
              else pendingTokens.set(key, { provider: m.provider, model: m.model, value: delta });
              tokensTouched = true;
            }
          }
        }
        break;
      }
      case "item.started": {
        const hit = classifyItem(event.itemType, event.payload);
        if (!hit) break;
        if (!remember(seenItems, event.itemId)) break;
        const m = getMeta();
        if (!m) break;
        push({
          ts: now,
          kind: hit.kind,
          provider: m.provider,
          model: m.model,
          mode: m.mode,
          ...(hit.name ? { name: hit.name } : {}),
          value: 1,
        });
        break;
      }
      default:
        break;
    }
  }

  if (tokensTouched) scheduleFlush();
}
