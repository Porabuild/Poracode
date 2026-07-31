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
 * so the stats survive thread delete/archive. Token consumption is the one
 * exception: it is counted by the main-process usage ledger from `usage.spent`
 * events (kind="tokens_v2"), never here.
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
const seenItems = new Set<string>();
const seenTurns = new Set<string>();
const pendingItemHits = new Map<string, ItemHit>();
const itemTypesById = new Map<string, string>();

function flush(): void {
  if (scheduled) {
    scheduled.cancel();
    scheduled = null;
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

// Insert into a bounded item-lifecycle map. Entries are normally evicted on
// item.completed, but an item that starts and never completes (aborted turn,
// dropped frame) would otherwise leak forever - so cap like the dedup sets.
function rememberInMap<V>(map: Map<string, V>, key: string, value: V): void {
  if (map.size >= DEDUP_CAP && !map.has(key)) map.clear();
  map.set(key, value);
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
    model: thread.config?.model ?? null,
    mode: thread.presentationMode === "gui" ? "chat" : "cli",
    fast: thread.config?.fast === true,
    effort: thread.config?.effort ?? null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}
function str(obj: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj?.[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

interface ItemHit {
  kind: "message" | "goal" | "skill" | "subagent" | "workflow" | "mcp";
  name?: string;
}

function genericName(kind: ItemHit["kind"], name: string | undefined): boolean {
  const normalized = name?.trim().toLowerCase();
  if (!normalized) return true;
  if (kind === "skill") return normalized === "skill";
  if (kind === "subagent") {
    return normalized === "subagent" || normalized === "agent" || normalized === "task";
  }
  if (kind === "workflow") return normalized === "workflow";
  if (kind === "mcp") return normalized === "mcp";
  return false;
}

function isSpecificToolHit(hit: ItemHit): boolean {
  if (hit.kind === "message" || hit.kind === "goal") return true;
  return !genericName(hit.kind, hit.name);
}

function betterHit(current: ItemHit | undefined, next: ItemHit): ItemHit {
  if (!current) return next;
  return isSpecificToolHit(next) ? next : current;
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
  const lowerName = name.toLowerCase();

  const mcpServer =
    /^mcp__(.+?)__/.exec(name)?.[1] ??
    str(p, "serverId") ??
    str(p, "server") ??
    str(args, "serverId") ??
    str(args, "server");
  if (itemType === "mcp_tool_call" || mcpServer) {
    const match = /^mcp__(.+?)__/.exec(name);
    return {
      kind: "mcp",
      name: match?.[1] ?? mcpServer ?? "mcp",
    };
  }
  if (
    lowerName === "skill" ||
    /^(loaded|using) skill\b/i.test(name) ||
    /^(loaded|using) skill\b/i.test(title) ||
    readSkillName(p, args) !== undefined
  ) {
    const skill =
      str(args, "skill") ??
      str(args, "name") ??
      readSkillName(p, args) ??
      title
        .replace(/^(loaded|using) skill[:\s]*/i, "")
        .replace(/^skill:\s*/i, "")
        .replace(/^Skill$/i, "")
        .trim();
    return { kind: "skill", name: skill || "skill" };
  }
  const subagentType =
    str(args, "subagent_type") ?? str(args, "agent_type") ?? str(args, "agentType");
  if (lowerName === "workflow") {
    const workflow = str(args, "name") ?? str(args, "description") ?? "workflow";
    return { kind: "workflow", name: workflow };
  }
  if (
    p?.["isSubAgent"] === true ||
    lowerName === "task" ||
    lowerName === "agent" ||
    lowerName === "collabagenttoolcall" ||
    lowerName === "collab agent tool call" ||
    subagentType
  ) {
    const agent = subagentType ?? str(args, "description") ?? str(args, "prompt") ?? "subagent";
    return { kind: "subagent", name: agent };
  }
  return undefined;
}

function readSkillName(
  payload: Record<string, unknown> | undefined,
  args: Record<string, unknown> | undefined,
): string | undefined {
  return (
    str(args, "skill") ??
    str(args, "name") ??
    readSkillNameFromPath(readPathArg(args)) ??
    readSkillNameFromPath(str(payload, "title")) ??
    readSkillNameFromPath(str(payload, "name"))
  );
}

function readPathArg(args: Record<string, unknown> | undefined): string | undefined {
  return (
    str(args, "file_path") ??
    str(args, "filePath") ??
    str(args, "path") ??
    str(args, "relative_path") ??
    str(args, "relativePath") ??
    str(args, "notebook_path") ??
    str(args, "notebookPath")
  );
}

function readSkillNameFromPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/^(?:view(?:\s+\d+(?::\d+)?)?|read(?:ing)?|open(?:ing)?)[:\s]+/i, "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "");
  const parts = cleaned.split(/[\\/]+/).filter(Boolean);
  if (parts.at(-1)?.toLowerCase() !== "skill.md") return undefined;
  const skillsIndex = parts.findLastIndex((part) => part.toLowerCase() === "skills");
  if (skillsIndex === -1 || skillsIndex >= parts.length - 2) return undefined;
  const skill = parts.at(-2);
  return skill && !skill.startsWith(".") ? skill : undefined;
}

/** Record an AI-performed git action (commit / PR / conflict) into the buffer. */
export function recordAiAction(type: AiActionType, provider: string, model: string): void {
  push({ ts: Date.now(), kind: `ai_${type}`, provider, model, value: 1 });
}

/** Record that a thread was started (provider/model/mode/fast/effort). */
export function recordThreadStarted(thread: Thread): void {
  const m = metaOf(thread);
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

function recordItemHit(itemId: string, hit: ItemHit, meta: Meta, ts: number, final: boolean): void {
  const next = betterHit(pendingItemHits.get(itemId), hit);
  if (!isSpecificToolHit(next) && !final) {
    rememberInMap(pendingItemHits, itemId, next);
    return;
  }
  if (next.kind === "mcp" && genericName(next.kind, next.name)) {
    pendingItemHits.delete(itemId);
    return;
  }
  if (!remember(seenItems, itemId)) return;
  pendingItemHits.delete(itemId);
  push({
    ts,
    kind: next.kind,
    provider: meta.provider,
    model: meta.model,
    mode: meta.mode,
    ...(next.name ? { name: next.name } : {}),
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
      case "item.started": {
        rememberInMap(itemTypesById, event.itemId, event.itemType);
        const hit = classifyItem(event.itemType, event.payload);
        if (!hit) break;
        const m = getMeta();
        if (!m) break;
        recordItemHit(event.itemId, hit, m, now, false);
        break;
      }
      case "item.updated": {
        const itemType = itemTypesById.get(event.itemId);
        if (!itemType || seenItems.has(event.itemId)) break;
        const hit = classifyItem(itemType, event.payload);
        if (!hit) break;
        const m = getMeta();
        if (!m) break;
        recordItemHit(event.itemId, hit, m, now, false);
        break;
      }
      case "item.completed": {
        const itemType = itemTypesById.get(event.itemId);
        if (!itemType || seenItems.has(event.itemId)) {
          itemTypesById.delete(event.itemId);
          pendingItemHits.delete(event.itemId);
          break;
        }
        const hit = event.payload ? classifyItem(itemType, event.payload) : undefined;
        const pending = pendingItemHits.get(event.itemId);
        const best = hit ? betterHit(pending, hit) : pending;
        if (best) {
          const m = getMeta();
          if (m) recordItemHit(event.itemId, best, m, now, true);
        }
        itemTypesById.delete(event.itemId);
        break;
      }
      default:
        break;
    }
  }
}
