import type {
  RuntimeEvent,
  StartThreadPayload,
  Thread,
  UsageEventInputPayload,
} from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";

const DEFAULT_FLUSH_DEBOUNCE_MS = 2000;
const MAX_BUFFER = 1000;
const DEDUP_CAP = 20_000;

interface Meta {
  provider: string;
  model: string | null;
  mode: string;
  fast: boolean;
  effort: string | null;
}

interface ItemHit {
  kind: "message" | "goal" | "skill" | "subagent" | "workflow" | "mcp";
  name?: string;
}

export interface RuntimeUsageRecorderOptions {
  getThread(threadId: string): Thread | null;
  appendUsageEvents(events: readonly UsageEventInputPayload[]): void;
  readonly flushDebounceMs?: number;
  now?(): number;
  onError?(error: unknown): void;
}

function metaOf(thread: Thread): Meta {
  return {
    // Full account-scoped kind (e.g. "provider:work"), so usage of different
    // profiles of the same provider is counted separately. The global rollup
    // folds to the base provider at read time.
    provider: thread.agentKind,
    model: thread.config?.model ?? null,
    mode: thread.presentationMode === "gui" ? "chat" : "cli",
    fast: thread.config?.fast === true,
    effort: thread.config?.effort ?? null,
  };
}

function metaOfLaunch(payload: StartThreadPayload): Meta {
  return {
    provider: payload.agentKind,
    model: payload.config?.model ?? null,
    mode: payload.presentationMode === "gui" ? "chat" : "cli",
    fast: payload.config?.fast === true,
    effort: payload.config?.effort ?? null,
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

function remember(set: Set<string>, id: string): boolean {
  if (set.has(id)) return false;
  if (set.size >= DEDUP_CAP) set.clear();
  set.add(id);
  return true;
}

function rememberInMap<V>(map: Map<string, V>, key: string, value: V): void {
  if (map.size >= DEDUP_CAP && !map.has(key)) map.clear();
  map.set(key, value);
}

/**
 * Host-owned durable usage capture at the canonical runtime-event layer.
 *
 * Lives in `BackendHostCore` so every desktop (open or zero-window tray),
 * standalone CLI server, mobile/web, MCP, PR Watch, and scheduled thread
 * records identical `usage_events` facts without depending on a mounted
 * renderer. Token consumption (`tokens_v2`) continues to be counted separately
 * by `usageLedger.ts` from `usage.spent` events.
 */
export class RuntimeUsageRecorder {
  private buffer: UsageEventInputPayload[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly turnStartByThread = new Map<string, { turnId: string; startedAt: number }>();
  private readonly seenStartedThreads = new Set<string>();
  private readonly seenItems = new Set<string>();
  private readonly seenTurns = new Set<string>();
  private readonly pendingItemHits = new Map<string, ItemHit>();
  private readonly itemTypesById = new Map<string, string>();
  private disposed = false;

  constructor(private readonly options: RuntimeUsageRecorderOptions) {}

  /** Records a new thread start (excluding resumes, imports, and repeated launches). */
  observeThreadLaunch(payload: StartThreadPayload): void {
    if (this.disposed) return;
    if (payload.sessionRef) return;
    const threadId = payload.threadId;
    if (threadId) {
      if (this.seenStartedThreads.has(threadId)) return;
      const existing = this.options.getThread(threadId);
      if (existing?.sessionRef) return;
      remember(this.seenStartedThreads, threadId);
    }
    const meta = metaOfLaunch(payload);
    this.push({
      ts: this.now(),
      kind: "thread_started",
      provider: meta.provider,
      model: meta.model,
      mode: meta.mode,
      fast: meta.fast,
      effort: meta.effort,
      value: 1,
    });
  }

  observeSupervisorEvent(event: SupervisorEvent): void {
    if (this.disposed) return;
    if (event.type === "thread-runtime-events") {
      this.observeRuntimeEvents(event.threadId, event.events);
      return;
    }
    if (event.type === "thread-exited" || event.type === "thread-reset") {
      this.turnStartByThread.delete(event.threadId);
    }
  }

  /**
   * Derives durable usage events from a batch of admitted canonical runtime
   * events. Thread metadata is resolved lazily so `content.delta` batches do
   * zero database reads and zero allocations.
   */
  observeRuntimeEvents(threadId: string, events: readonly RuntimeEvent[]): void {
    if (this.disposed || events.length === 0) return;
    let metaResolved = false;
    let meta: Meta | null = null;
    const getMeta = (): Meta | null => {
      if (!metaResolved) {
        metaResolved = true;
        const thread = this.options.getThread(threadId);
        meta = thread ? metaOf(thread) : null;
      }
      return meta;
    };

    const now = this.now();

    for (const event of events) {
      switch (event.type) {
        case "turn.started":
          if (this.turnStartByThread.get(threadId)?.turnId !== event.turnId) {
            this.turnStartByThread.set(threadId, { turnId: event.turnId, startedAt: now });
          }
          break;
        case "turn.completed": {
          if (event.state === "completed" && remember(this.seenTurns, event.turnId)) {
            const m = getMeta();
            if (m) {
              const start = this.turnStartByThread.get(threadId);
              const startedAt = start?.turnId === event.turnId ? start.startedAt : now;
              this.push({
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
          this.turnStartByThread.delete(threadId);
          break;
        }
        case "item.started": {
          rememberInMap(this.itemTypesById, event.itemId, event.itemType);
          const hit = classifyItem(event.itemType, event.payload);
          if (!hit) break;
          const m = getMeta();
          if (!m) break;
          this.recordItemHit(event.itemId, hit, m, now, false);
          break;
        }
        case "item.updated": {
          const itemType = this.itemTypesById.get(event.itemId);
          if (!itemType || this.seenItems.has(event.itemId)) break;
          const hit = classifyItem(itemType, event.payload);
          if (!hit) break;
          const m = getMeta();
          if (!m) break;
          this.recordItemHit(event.itemId, hit, m, now, false);
          break;
        }
        case "item.completed": {
          const itemType = this.itemTypesById.get(event.itemId);
          if (!itemType || this.seenItems.has(event.itemId)) {
            this.itemTypesById.delete(event.itemId);
            this.pendingItemHits.delete(event.itemId);
            break;
          }
          const hit = event.payload ? classifyItem(itemType, event.payload) : undefined;
          const pending = this.pendingItemHits.get(event.itemId);
          const best = hit ? betterHit(pending, hit) : pending;
          if (best) {
            const m = getMeta();
            if (m) this.recordItemHit(event.itemId, best, m, now, true);
          }
          this.itemTypesById.delete(event.itemId);
          break;
        }
        default:
          break;
      }
    }
  }

  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    try {
      this.options.appendUsageEvents(batch);
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  dispose(): void {
    this.flush();
    this.disposed = true;
    this.turnStartByThread.clear();
    this.pendingItemHits.clear();
    this.itemTypesById.clear();
  }

  private recordItemHit(
    itemId: string,
    hit: ItemHit,
    meta: Meta,
    ts: number,
    final: boolean,
  ): void {
    const next = betterHit(this.pendingItemHits.get(itemId), hit);
    if (!isSpecificToolHit(next) && !final) {
      rememberInMap(this.pendingItemHits, itemId, next);
      return;
    }
    if (next.kind === "mcp" && genericName(next.kind, next.name)) {
      this.pendingItemHits.delete(itemId);
      return;
    }
    if (!remember(this.seenItems, itemId)) return;
    this.pendingItemHits.delete(itemId);
    this.push({
      ts,
      kind: next.kind,
      provider: meta.provider,
      model: meta.model,
      mode: meta.mode,
      ...(next.name ? { name: next.name } : {}),
      value: 1,
    });
  }

  private push(event: UsageEventInputPayload): void {
    this.buffer.push(event);
    if (this.buffer.length >= MAX_BUFFER) {
      this.flush();
    } else if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, this.options.flushDebounceMs ?? DEFAULT_FLUSH_DEBOUNCE_MS);
      this.timer.unref?.();
    }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}
