import type { ProjectLocation, RuntimeEvent } from "@/shared/contracts";
import { readSessionFileText, statSessionPaths } from "../../base";
import { resolveMuseSessionLogPath } from "../sessionFiles";
import {
  aliasMuseMspItem,
  completeOpenMuseMspItems,
  createMuseMspItemMapperState,
  mapMuseMspDelta,
  mapMuseMspItem,
  museItemText,
  normalizeMuseMspDelta,
  readMuseMspDelta,
  type MuseMspItemMapperState,
} from "./canonicalMapping";
import type { MuseMspClient } from "./client";
import {
  MuseSubagentDiscovery,
  museJsonRecord,
  museRecord,
  museString,
  type MuseChildState,
} from "./subagentDiscovery";
import { museSubagentId, museSubagentResultStatus } from "./subagentMapping";

type ItemPhase = "started" | "updated" | "completed";

/** Retry transient read failures without retaining an unreachable child forever. */
const CHILD_READ_ATTEMPTS = 3;

interface Invocation {
  item: Record<string, unknown>;
  mapper: MuseMspItemMapperState;
  revisions: Map<string, number>;
  published?: {
    item: Record<string, unknown>;
    status: Child["status"];
    result: string | undefined;
    complete: boolean;
  };
}

interface Child extends MuseChildState {
  generation: number;
  invocations: Map<string, Invocation>;
  items: Map<string, Record<string, unknown>>;
  deltaFields: Map<string, string>;
  nativeState: boolean;
  ready: boolean;
  subscribed: boolean;
  finalRead: boolean;
  cursor: string | undefined;
  readFailures: number;
  retryAt: number;
}

export function museHistoryItems(result: Record<string, unknown>): Record<string, unknown>[] {
  const history = museRecord(result["history"]);
  const state = museRecord(museRecord(history["snapshot"])["state"]);
  const items = history["items"] ?? state["items"];
  return Array.isArray(items) ? items.map(museRecord) : [];
}

/** Owns child transcript attachment without changing the parent turn's lifecycle. */
export class MuseSubagentTranscripts {
  private readonly discovery = new MuseSubagentDiscovery();
  private readonly children = new Map<string, Child>();
  private sessionId: string | undefined;
  private logPath: string | undefined;
  private logMtime: number | undefined;
  private timer: NodeJS.Timeout | undefined;
  private syncing: Promise<void> | undefined;
  private disposed = false;

  constructor(
    private readonly location: ProjectLocation,
    private readonly client: Pick<MuseMspClient, "request">,
    private readonly root: MuseMspItemMapperState,
    private readonly emit: (events: RuntimeEvent[]) => void,
  ) {}

  open(sessionId: string, history: Record<string, unknown>): void {
    this.sessionId = sessionId;
    this.logPath = museString(museRecord(history["session"])["path"]);
    // Stable native item ids update the previous release's persisted launch rows.
    for (const item of museHistoryItems(history)) {
      if (item["kind"] === "subagent" || museString(item["tool"])?.startsWith("subagent_")) {
        this.emit(this.mapItem(item, item["status"] === "inProgress" ? "started" : "completed"));
      }
    }
  }

  owns(sessionId: string): boolean {
    return [...this.children.values()].some((child) => child.sessionId === sessionId);
  }

  onViewDisconnected(): void {
    if (this.disposed) return;
    for (const child of this.children.values()) {
      if (child.status === "inProgress" && child.subscribed) {
        child.subscribed = false;
        child.readFailures = 0;
        child.retryAt = 0;
      }
    }
    // Keep each observed cursor and reattach through the replacement observer.
    this.startMonitoring();
  }

  mapItem(item: Record<string, unknown>, phase: ItemPhase): RuntimeEvent[] {
    const name = museString(item["tool"] ?? item["name"]);
    const native = item["kind"] === "subagent";
    if (!native && !name?.startsWith("subagent_")) return mapMuseMspItem(this.root, item, phase);
    const id = native
      ? museString(item["subagentId"])
      : (museSubagentId(museJsonRecord(item["args"])) ??
        (name === "subagent_spawn"
          ? museSubagentId(museJsonRecord(item["visibleOutput"]))
          : undefined));
    const itemId = museString(item["itemId"]);
    if (!id || !itemId) return mapMuseMspItem(this.root, item, phase);
    const child = this.ensure(id);
    if (native) {
      child.nativeState = true;
      const sessionId = museString(item["childSessionId"]);
      if (sessionId) this.setChildSession(child, sessionId);
      const result = museRecord(item["result"]);
      // 1.4.6 leaves the generic task open after ResultReady until owner close.
      // The child has finished producing its transcript at that point.
      const status =
        item["status"] === "inProgress" && item["controlStatus"] === "resultReady"
          ? museSubagentResultStatus(result["errorKind"])
          : museString(item["status"]);
      if (status)
        this.setChildStatus(
          child,
          status === "inProgress" || status === "completed" || status === "cancelled"
            ? status
            : "failed",
        );
      const text = museString(result["text"] ?? result["summary"] ?? item["failureReason"]);
      if (status === "inProgress") delete child.result;
      if (text) child.result = text;
      this.startMonitoring();
      // Native lifecycle rows describe the child of a launch, not another invocation.
      return child.status === "inProgress" ? this.updateParents(child) : [];
    }
    let invocation = child.invocations.get(itemId);
    if (!invocation) {
      invocation = {
        item,
        mapper: createMuseMspItemMapperState(this.root.threadId),
        revisions: new Map(),
      };
      child.invocations.set(itemId, invocation);
      child.readFailures = 0;
      child.retryAt = 0;
    } else {
      invocation.item = item;
    }
    const accepted =
      name === "subagent_spawn" && museJsonRecord(item["visibleOutput"])["status"] === "accepted";
    if (accepted && !child.status) child.status = "inProgress";
    const status = child.status;
    const events = this.mapParent(
      invocation,
      status,
      phase,
      child.result,
      child.finalRead || child.readFailures >= CHILD_READ_ATTEMPTS,
    );
    for (const childItem of child.items.values())
      events.push(...this.mapChildItem(child, invocation, itemId, childItem));
    this.startMonitoring();
    return events;
  }

  handleNotification(method: string, params: Record<string, unknown>): boolean {
    const child = [...this.children.values()].find(
      (entry) => entry.sessionId === params["sessionId"],
    );
    if (!child) return false;
    if (!child.ready || this.disposed) return true;
    const cursor = museString(params["viewCursor"]);
    if (cursor) child.cursor = cursor;
    if (method === "item/started" || method === "item/updated" || method === "item/completed") {
      const item = museRecord(params["item"]);
      const id = museString(item["itemId"]);
      if (!id) return true;
      child.items.set(id, item);
      for (const [parentId, invocation] of child.invocations) {
        this.emit(this.mapChildItem(child, invocation, parentId, item));
      }
    } else if (method === "item/delta") {
      const parsed = readMuseMspDelta(params);
      if (!parsed) return true;
      const { rawId, field, delta } = parsed;
      const item = child.items.get(rawId);
      if (item) {
        const previous = child.deltaFields.get(rawId);
        const normalized = normalizeMuseMspDelta(museString(item["kind"]), field, previous, delta);
        if (normalized) {
          const reasoning = normalized.stream === "reasoning_text";
          const key = normalized.stream === "command_output" ? "visibleOutput" : "text";
          const text = reasoning ? museItemText(item) : (museString(item[key]) ?? "");
          child.items.set(rawId, {
            ...item,
            [key]: `${text}${normalized.delta}`,
          });
          if (reasoning) child.deltaFields.set(rawId, field);
        }
      }
      for (const invocation of child.invocations.values())
        this.emit(mapMuseMspDelta(invocation.mapper, params));
    }
    // Child turn/config/usage events must never settle or overwrite the root session.
    return true;
  }

  async sync(): Promise<void> {
    if (this.disposed || !this.sessionId) return;
    this.logPath ??= await resolveMuseSessionLogPath(this.location, this.sessionId);
    if (this.disposed) return;
    if (this.logPath) {
      const stats = await statSessionPaths(this.location, [this.logPath]);
      const mtime = stats.get(this.logPath)?.mtimeMs;
      if (this.disposed) return;
      if (mtime === undefined || mtime !== this.logMtime) {
        const text = await readSessionFileText(this.location, this.logPath);
        if (this.disposed) return;
        if (text !== undefined) {
          this.discovery.ingest(text);
          this.logMtime = mtime;
        }
      }
    }
    for (const [id, child] of this.children) {
      const discovered = child.nativeState ? undefined : this.discovery.children.get(id);
      if (discovered?.sessionId) this.setChildSession(child, discovered.sessionId);
      if (discovered?.status) this.setChildStatus(child, discovered.status);
      if (discovered) {
        if (discovered.result) child.result = discovered.result;
        else delete child.result;
      }
      if (
        child.sessionId &&
        child.readFailures < CHILD_READ_ATTEMPTS &&
        Date.now() >= child.retryAt &&
        (!child.ready ||
          (!child.subscribed && child.status === "inProgress") ||
          (!child.finalRead && child.status !== "inProgress"))
      ) {
        const generation = child.generation;
        const status = child.status;
        try {
          await this.readChild(child);
        } catch (error) {
          // A previous attempt must not consume a restarted child's retry budget.
          if (!this.disposed && child.generation === generation && child.status === status) {
            child.readFailures += 1;
            child.retryAt = Date.now() + 1_000 * 2 ** (child.readFailures - 1);
            console.warn("[muse-subagents] child read failed:", error);
          }
        }
        if (this.disposed) return;
      }
      if (
        child.result &&
        child.status !== "inProgress" &&
        (child.finalRead || child.readFailures >= CHILD_READ_ATTEMPTS) &&
        ![...child.items.values()].some(
          (item) => item["kind"] === "agentMessage" && museString(item["text"]),
        )
      ) {
        const resultItem = {
          itemId: `${id}/result`,
          kind: "agentMessage",
          status: "completed",
          revision: 1,
          text: child.result,
        };
        child.items.set(resultItem.itemId, resultItem);
        for (const [parentId, invocation] of child.invocations)
          this.emit(this.mapChildItem(child, invocation, parentId, resultItem));
      }
      this.emit(this.updateParents(child));
    }
    if (
      ![...this.children.values()].some(
        (child) =>
          child.status === "inProgress" ||
          (child.sessionId && !child.finalRead && child.readFailures < CHILD_READ_ATTEMPTS) ||
          (!child.status &&
            [...child.invocations.values()].some(
              (invocation) => invocation.item["status"] === "inProgress",
            )),
      )
    ) {
      this.stopMonitoring();
    }
  }

  dispose(): RuntimeEvent[] {
    this.disposed = true;
    this.stopMonitoring();
    return [...this.children.values()].flatMap((child) =>
      [...child.invocations.values()].flatMap((invocation) =>
        completeOpenMuseMspItems(invocation.mapper),
      ),
    );
  }

  private ensure(id: string): Child {
    let child = this.children.get(id);
    if (!child) {
      child = {
        generation: 0,
        invocations: new Map(),
        items: new Map(),
        deltaFields: new Map(),
        nativeState: false,
        ready: false,
        subscribed: false,
        finalRead: false,
        cursor: undefined,
        readFailures: 0,
        retryAt: 0,
      };
      this.children.set(id, child);
    }
    return child;
  }

  private mapParent(
    invocation: Invocation,
    status: Child["status"],
    phase: ItemPhase,
    result?: string,
    complete = true,
  ): RuntimeEvent[] {
    if (
      invocation.published?.item === invocation.item &&
      invocation.published.status === status &&
      invocation.published.result === result &&
      invocation.published.complete === complete
    )
      return [];
    invocation.published = { item: invocation.item, status, result, complete };
    const events = mapMuseMspItem(
      this.root,
      { ...invocation.item, ...(status ? { status } : {}) },
      status === "inProgress" && phase === "completed"
        ? "updated"
        : status && status !== "inProgress" && complete
          ? "completed"
          : status && status !== "inProgress"
            ? "updated"
            : phase,
    );
    return events.flatMap((event): RuntimeEvent[] => {
      if (event.type !== "item.started" && event.type !== "item.updated") return [event];
      const payload = {
        ...museRecord(event.payload),
        ...(result ? { result } : {}),
        ...(status === "cancelled" ? { subAgentStatus: "cancelled" } : {}),
      };
      const mapped = { ...event, payload } as RuntimeEvent;
      // Existing rows ignore a repeated start, so also patch restored invocations.
      return event.type === "item.started"
        ? [
            mapped,
            { type: "item.updated", threadId: this.root.threadId, itemId: event.itemId, payload },
          ]
        : [mapped];
    });
  }

  private updateParents(child: Child): RuntimeEvent[] {
    if (!child.status) return [];
    return [...child.invocations.values()].flatMap((invocation) =>
      this.mapParent(
        invocation,
        child.status,
        "updated",
        child.result,
        child.finalRead || child.readFailures >= CHILD_READ_ATTEMPTS,
      ),
    );
  }

  private mapChildItem(
    child: Child,
    invocation: Invocation,
    parentId: string,
    item: Record<string, unknown>,
    snapshot = false,
  ): RuntimeEvent[] {
    const rawId = museString(item["itemId"]);
    if (!rawId) return [];
    const revision = typeof item["revision"] === "number" ? item["revision"] : undefined;
    if (!snapshot && revision !== undefined && revision <= (invocation.revisions.get(rawId) ?? -1))
      return [];
    if (revision !== undefined) invocation.revisions.set(rawId, revision);
    const itemId = `${parentId}/${child.sessionId}/${rawId}`;
    aliasMuseMspItem(invocation.mapper, rawId, itemId, {
      optimisticUserMessage: false,
    });
    const previousField = child.deltaFields.get(rawId);
    if (previousField) invocation.mapper.reasoningFields.set(itemId, previousField);
    const events = mapMuseMspItem(
      invocation.mapper,
      item,
      item["status"] === "inProgress" ? "updated" : "completed",
    ).map((event) =>
      event.type === "item.started" ? { ...event, parentItemId: parentId } : event,
    );
    if (snapshot && (item["kind"] === "agentMessage" || item["kind"] === "reasoning")) {
      const replacement: RuntimeEvent = {
        type: "content.delta",
        threadId: this.root.threadId,
        itemId,
        stream: item["kind"] === "reasoning" ? "reasoning_text" : "assistant_text",
        delta: museItemText(item),
        replace: true,
      };
      const completion = events.findIndex((event) => event.type === "item.completed");
      events.splice(completion < 0 ? events.length : completion, 0, replacement);
    }
    return events;
  }

  private async readChild(child: Child): Promise<void> {
    const sessionId = child.sessionId!;
    const generation = child.generation;
    const status = child.status;
    if (!child.ready || (status !== "inProgress" && !child.finalRead)) {
      const result = await this.client.request("session/read", { sessionId, excludeItems: false });
      if (this.disposed || child.sessionId !== sessionId || child.generation !== generation) return;
      for (const item of museHistoryItems(result)) {
        const id = museString(item["itemId"]);
        if (id) child.items.set(id, item);
        for (const [parentId, invocation] of child.invocations)
          this.emit(this.mapChildItem(child, invocation, parentId, item, true));
      }
      child.ready = true;
      child.cursor = museString(result["viewCursor"]);
      // A snapshot requested before ResultReady can lag its arriving notification.
      if (status && status !== "inProgress" && child.status === status) child.finalRead = true;
    }
    if (!child.subscribed && child.status === "inProgress") {
      const after = child.cursor;
      await this.client.request("view/subscribe", { sessionId, ...(after ? { after } : {}) });
      if (this.disposed || child.sessionId !== sessionId || child.generation !== generation) return;
      child.subscribed = true;
    }
    child.readFailures = 0;
    child.retryAt = 0;
  }

  private setChildSession(child: Child, sessionId: string): void {
    if (child.sessionId === sessionId) return;
    child.generation += 1;
    child.sessionId = sessionId;
    child.ready = false;
    child.subscribed = false;
    child.finalRead = false;
    child.cursor = undefined;
    child.readFailures = 0;
    child.retryAt = 0;
    child.items.clear();
    child.deltaFields.clear();
    delete child.result;
    for (const invocation of child.invocations.values()) {
      this.emit(completeOpenMuseMspItems(invocation.mapper));
      invocation.revisions.clear();
    }
  }

  private setChildStatus(child: Child, status: NonNullable<Child["status"]>): void {
    if (child.status !== status) {
      child.finalRead = false;
      // Nested sessions may become readable only after the child has finished.
      // Give the final snapshot its own bounded budget after startup failures.
      child.readFailures = 0;
      child.retryAt = 0;
      if (status === "inProgress") {
        child.generation += 1;
        delete child.result;
      }
    }
    child.status = status;
  }

  private startMonitoring(): void {
    if (this.disposed) return;
    this.timer ??= setInterval(() => this.scheduleSync(), 1_000);
    this.timer.unref();
    this.scheduleSync();
  }

  private scheduleSync(): void {
    if (this.syncing || this.disposed) return;
    this.syncing = this.sync()
      .catch((error: unknown) => {
        if (!this.disposed) console.warn("[muse-subagents] transcript sync failed:", error);
      })
      .finally(() => {
        this.syncing = undefined;
      });
  }

  private stopMonitoring(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
