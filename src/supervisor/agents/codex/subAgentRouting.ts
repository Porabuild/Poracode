import type { RuntimeEvent, ToolCallPayload, ToolCallProgress } from "@/shared/contracts";
import {
  createCodexMapperState,
  mapCodexNotification,
  type CodexMapperState,
} from "./canonicalMapping";
import {
  isCodexCollabAgentToolCall,
  isCodexSpawnAgentToolCall,
} from "./canonicalMapping/collabAgent";
import { canonicalTypeFor, newItemId } from "./canonicalMappingState";
import {
  type CodexItemPayload,
  extractMessageText,
  readItem,
  readItemId,
  readCodexErrorMessage,
  readNonEmptyString,
  readStringArray,
} from "./canonicalMapping/readers";

interface CodexChildThread {
  parentItemId: string;
  mapperState: CodexMapperState;
  itemIds: Set<string>;
  active: boolean;
  failed: boolean;
  resultText: string;
}

/** Routes Codex child-thread notifications into the parent subagent overlay. */
export class CodexSubAgentRouter {
  private mainThreadId: string | undefined;
  private readonly children = new Map<string, CodexChildThread>();
  private readonly parentPayloads = new Map<string, ToolCallPayload>();
  private readonly completedParentItemIds = new Set<string>();
  private readonly collabItems = new Map<string, string>();
  private readonly activityItems = new Map<string, string>();
  private readonly pendingChildNotifications = new Map<
    string,
    Array<{ method: string; params: Record<string, unknown> | undefined }>
  >();
  private defaultProgress: ToolCallProgress = {};

  constructor(
    private readonly localThreadId: string,
    private readonly wslDistro?: string,
  ) {}

  setDefaultModelSettings(model: string, effort: string): void {
    this.defaultProgress = { model, effort };
  }

  routeChildNotification(
    method: string,
    params: Record<string, unknown> | undefined,
    mainThreadId: string | undefined,
  ): RuntimeEvent[] | undefined {
    if (mainThreadId) this.mainThreadId = mainThreadId;
    const notificationThreadId = readNotificationThreadId(params);
    const startedThread = method === "thread/started" ? readStartedThread(params) : undefined;
    const startedThreadId = readNonEmptyString(startedThread?.id);
    const startedParentThreadId = readNonEmptyString(startedThread?.parentThreadId);

    if (
      startedThreadId &&
      mainThreadId &&
      startedThreadId !== mainThreadId &&
      (startedParentThreadId === mainThreadId ||
        (startedParentThreadId !== undefined && this.children.has(startedParentThreadId)))
    ) {
      const child = this.children.get(startedThreadId);
      if (child) {
        const status = readThreadStatusType(startedThread?.status);
        child.active = status !== "notLoaded" && status !== "systemError";
        return child.active ? [this.updateParent(child, { status: "running" })] : [];
      }
      this.bufferChildNotification(startedThreadId, method, params);
      return [];
    }

    if (!notificationThreadId || !mainThreadId || notificationThreadId === mainThreadId) {
      return undefined;
    }

    const child = this.children.get(notificationThreadId);
    if (!child) {
      if (this.pendingChildNotifications.has(notificationThreadId)) {
        this.bufferChildNotification(notificationThreadId, method, params);
      }
      // A single app-server connection can report other loaded threads. Never
      // let an unrelated thread fall through into the main mapper.
      return [];
    }

    const childUserEvents = mapChildUserMessageStarted(child, method, params, this.localThreadId);
    if (childUserEvents) return childUserEvents;

    captureChildResult(child, method, params);

    if (method === "thread/settings/updated") {
      const progress = readThreadSettingsProgress(params);
      return Object.keys(progress).length > 0 ? [this.updateParent(child, { progress })] : [];
    }

    if (method === "turn/started") {
      child.active = true;
      child.failed = false;
      return [this.updateParent(child, { status: "running" })];
    }

    if (method === "turn/completed" || method === "turn/aborted") {
      child.active = false;
      const status = readTurnStatus(params);
      child.failed =
        child.failed ||
        method === "turn/aborted" ||
        status === "failed" ||
        status === "interrupted";
      const childCompletionEvents = mapCodexNotification(
        method,
        params,
        child.mapperState,
        this.wslDistro,
      ).filter((event) => event.type === "item.completed");
      if (this.hasActiveSibling(child)) {
        return childCompletionEvents;
      }
      const result = this.readParentResult(child);
      return [
        ...childCompletionEvents,
        this.completeParent(child, {
          status: this.hasFailedSiblingOrSelf(child) ? "error" : "success",
          ...(result ? { result } : {}),
        }),
      ];
    }

    if (method === "thread/error" || method === "error") {
      child.active = false;
      child.failed = true;
      if (this.hasActiveSibling(child)) return [];
      return [
        this.completeParent(child, {
          status: "error",
          result: readCodexErrorMessage(params) ?? "Codex child thread error",
        }),
      ];
    }

    const events = this.observeMainNotification(
      method,
      params,
      mapCodexNotification(method, params, child.mapperState, this.wslDistro),
    ).filter(
      (event) =>
        event.type === "item.started" ||
        event.type === "item.updated" ||
        event.type === "item.completed" ||
        event.type === "content.delta",
    );
    const routed: RuntimeEvent[] = [];
    let progressChanged = false;
    for (const event of events) {
      if (event.type === "item.started") {
        const providerItemId = readItemId(params, readItem(params));
        if (providerItemId && !child.itemIds.has(providerItemId)) {
          child.itemIds.add(providerItemId);
          progressChanged = true;
        }
        routed.push({ ...event, parentItemId: event.parentItemId ?? child.parentItemId });
      } else {
        routed.push(event);
      }
    }
    if (progressChanged) {
      const lastToolName = readChildToolName(events);
      routed.unshift(
        this.updateParent(child, {
          progress: {
            stepCount: child.itemIds.size,
            ...(lastToolName ? { lastToolName } : {}),
          },
        }),
      );
    }
    return routed;
  }

  observeMainNotification(
    method: string,
    params: Record<string, unknown> | undefined,
    events: RuntimeEvent[],
  ): RuntimeEvent[] {
    const item = readItem(params);
    if (!item) return events;
    if (item.type === "subAgentActivity") {
      const childThreadId = readNonEmptyString(item.agentThreadId);
      const child = childThreadId ? this.children.get(childThreadId) : undefined;
      if (!child) {
        if (
          item.kind !== "started" ||
          !childThreadId ||
          !events.some((event) => event.type === "item.started")
        ) {
          return [];
        }
        const providerItemId = readItemId(params, item);
        const existingParentItemId = providerItemId
          ? this.activityItems.get(providerItemId)
          : undefined;
        if (existingParentItemId) return [];
        const parentItemId = newItemId("tool_call");
        const description = readAgentDescription(item.agentPath);
        const payload: ToolCallPayload = {
          name: "spawnAgent",
          status: "running",
          isSubAgent: true,
          args: {
            ...(description ? { description } : {}),
            ...(readNonEmptyString(item.agentPath) ? { agentPath: item.agentPath } : {}),
            receiverThreadIds: [childThreadId],
          },
          progress: {
            ...this.defaultProgress,
            ...(description ? { description } : {}),
            stepCount: 0,
          },
        };
        this.parentPayloads.set(parentItemId, payload);
        if (providerItemId) this.activityItems.set(providerItemId, parentItemId);
        return [
          {
            type: "item.started",
            threadId: this.localThreadId,
            itemId: parentItemId,
            itemType: "tool_call",
            payload,
          },
          ...this.registerChild(childThreadId, parentItemId, true),
        ];
      }
      if (item.kind === "interrupted") {
        child.active = false;
        return this.hasActiveSibling(child)
          ? []
          : [this.completeParent(child, { status: "error" })];
      }
      if (this.completedParentItemIds.has(child.parentItemId)) return [];
      child.active = true;
      return [this.updateParent(child, { status: "running" })];
    }
    if (!isCodexCollabAgentToolCall(item)) return events;
    if (!isCodexSpawnAgentToolCall(item)) return [];

    const parentStarted = events.find(
      (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
        event.type === "item.started" && isSubAgentPayload(event.payload),
    );
    if (method === "item/started" && parentStarted) {
      const payload = mergeParentPayload(parentStarted.payload as ToolCallPayload, {
        progress: {
          ...this.defaultProgress,
          ...(parentStarted.payload as ToolCallPayload).progress,
        },
      });
      this.parentPayloads.set(parentStarted.itemId, payload);
      const providerItemId = readItemId(params, item);
      if (providerItemId) this.collabItems.set(providerItemId, parentStarted.itemId);
      const routed = events.map((event) =>
        event === parentStarted ? { ...parentStarted, payload } : event,
      );
      for (const childThreadId of readStringArray(
        item.receiverThreadIds ?? item.receiver_thread_ids,
      )) {
        routed.push(
          ...this.registerChild(
            childThreadId,
            parentStarted.itemId,
            readCollabChildActive(item, childThreadId),
            readNonEmptyString(item.prompt),
          ),
        );
      }
      return routed;
    }

    if (method !== "item/completed") return events;
    const receiverThreadIds = readStringArray(item.receiverThreadIds ?? item.receiver_thread_ids);
    const completedEvent = events.find(
      (event): event is Extract<RuntimeEvent, { type: "item.completed" }> =>
        event.type === "item.completed",
    );
    const providerItemId = readItemId(params, item);
    const parentItemId =
      completedEvent?.itemId ?? (providerItemId ? this.collabItems.get(providerItemId) : undefined);
    const routed: RuntimeEvent[] = [];
    if (parentItemId) {
      for (const childThreadId of receiverThreadIds) {
        routed.push(
          ...this.registerChild(
            childThreadId,
            parentItemId,
            readCollabChildActive(item, childThreadId),
            readNonEmptyString(item.prompt),
          ),
        );
      }
    }
    if (!receiverThreadIds.some((threadId) => this.children.get(threadId)?.active)) {
      const parentCompletion = events.find(
        (event): event is Extract<RuntimeEvent, { type: "item.completed" }> =>
          event.type === "item.completed" && event.itemId === parentItemId,
      );
      if (parentCompletion) {
        this.recordParentCompletion(parentCompletion.itemId, parentCompletion.payload);
      }
      return [...routed, ...events];
    }

    routed.push(
      ...events.map((event) => {
        if (event.type !== "item.completed") return event;
        const child = receiverThreadIds
          .map((threadId) => this.children.get(threadId))
          .find((candidate) => candidate?.parentItemId === event.itemId);
        if (!child) return event;
        return this.updateParent(child, { status: "running" });
      }),
    );
    return routed;
  }

  private registerChild(
    threadId: string,
    parentItemId: string,
    active: boolean,
    prompt?: string,
  ): RuntimeEvent[] {
    const existing = this.children.get(threadId);
    if (existing) {
      existing.active = active;
      return [];
    }
    this.children.set(threadId, {
      parentItemId,
      mapperState: createCodexMapperState(this.localThreadId),
      itemIds: new Set(),
      active,
      failed: false,
      resultText: "",
    });
    const pending = this.pendingChildNotifications.get(threadId) ?? [];
    this.pendingChildNotifications.delete(threadId);
    return [
      ...buildChildPromptEvents(this.localThreadId, parentItemId, prompt),
      ...pending.flatMap(
        (notification) =>
          this.routeChildNotification(
            notification.method,
            notification.params,
            this.mainThreadId,
          ) ?? [],
      ),
    ];
  }

  private bufferChildNotification(
    threadId: string,
    method: string,
    params: Record<string, unknown> | undefined,
  ): void {
    const pending = this.pendingChildNotifications.get(threadId);
    const notification = { method, params };
    if (pending) pending.push(notification);
    else this.pendingChildNotifications.set(threadId, [notification]);
  }

  private hasActiveSibling(child: CodexChildThread): boolean {
    for (const candidate of this.children.values()) {
      if (
        candidate !== child &&
        candidate.parentItemId === child.parentItemId &&
        candidate.active
      ) {
        return true;
      }
    }
    return false;
  }

  private hasFailedSiblingOrSelf(child: CodexChildThread): boolean {
    for (const candidate of this.children.values()) {
      if (candidate.parentItemId === child.parentItemId && candidate.failed) return true;
    }
    return false;
  }

  private readParentResult(child: CodexChildThread): string | undefined {
    const result = [...this.children.values()]
      .filter((candidate) => candidate.parentItemId === child.parentItemId)
      .map((candidate) => candidate.resultText.trim())
      .filter(Boolean)
      .join("\n\n");
    return result || undefined;
  }

  private updateParent(
    child: CodexChildThread,
    patch: { status?: ToolCallPayload["status"]; progress?: ToolCallProgress },
  ): Extract<RuntimeEvent, { type: "item.updated" }> {
    const current = this.parentPayloads.get(child.parentItemId) ?? {
      name: "spawnAgent",
      status: "running",
      isSubAgent: true,
    };
    const payload = mergeParentPayload(current, {
      ...(!this.completedParentItemIds.has(child.parentItemId) && patch.status
        ? { status: patch.status }
        : {}),
      ...(patch.progress ? { progress: patch.progress } : {}),
    });
    this.parentPayloads.set(child.parentItemId, payload);
    return {
      type: "item.updated",
      threadId: this.localThreadId,
      itemId: child.parentItemId,
      payload,
    };
  }

  private completeParent(
    child: CodexChildThread,
    payload: Pick<ToolCallPayload, "status"> & { result?: unknown },
  ): Extract<RuntimeEvent, { type: "item.completed" }> {
    this.recordParentCompletion(child.parentItemId, payload);
    return {
      type: "item.completed",
      threadId: this.localThreadId,
      itemId: child.parentItemId,
      payload,
    };
  }

  private recordParentCompletion(itemId: string, payload: unknown): void {
    const current = this.parentPayloads.get(itemId) ?? {
      name: "spawnAgent",
      status: "running",
      isSubAgent: true,
    };
    const completedPayload =
      payload && typeof payload === "object"
        ? ({ ...current, ...(payload as Partial<ToolCallPayload>) } as ToolCallPayload)
        : current;
    this.parentPayloads.set(itemId, completedPayload);
    this.completedParentItemIds.add(itemId);
  }
}

function readNotificationThreadId(params: Record<string, unknown> | undefined): string | undefined {
  const direct = readNonEmptyString(params?.threadId);
  if (direct) return direct;
  const thread = params?.thread;
  if (thread && typeof thread === "object") {
    const id = readNonEmptyString((thread as Record<string, unknown>).id);
    if (id) return id;
  }
  const turn = params?.turn;
  if (turn && typeof turn === "object") {
    const threadId = readNonEmptyString((turn as Record<string, unknown>).threadId);
    if (threadId) return threadId;
  }
  return undefined;
}

function readStartedThread(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  return params?.thread && typeof params.thread === "object"
    ? (params.thread as Record<string, unknown>)
    : undefined;
}

function readThreadStatusType(status: unknown): string | undefined {
  return status && typeof status === "object"
    ? readNonEmptyString((status as Record<string, unknown>).type)
    : undefined;
}

function readTurnStatus(params: Record<string, unknown> | undefined): string | undefined {
  const turn = params?.turn;
  return turn && typeof turn === "object"
    ? readNonEmptyString((turn as Record<string, unknown>).status)
    : undefined;
}

function readThreadSettingsProgress(params: Record<string, unknown> | undefined): ToolCallProgress {
  const settings =
    params?.threadSettings && typeof params.threadSettings === "object"
      ? (params.threadSettings as Record<string, unknown>)
      : undefined;
  const model = readNonEmptyString(settings?.model);
  const effort = readNonEmptyString(settings?.effort);
  return {
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
  };
}

function readCollabChildActive(item: CodexItemPayload, childThreadId: string): boolean {
  const states = item.agentsStates ?? item.agents_states;
  if (!states || typeof states !== "object" || Array.isArray(states)) return true;
  const state = (states as Record<string, unknown>)[childThreadId];
  if (!state || typeof state !== "object" || Array.isArray(state)) return true;
  const status = readNonEmptyString((state as Record<string, unknown>).status);
  return (
    status === undefined ||
    status === "pendingInit" ||
    status === "pending_init" ||
    status === "running"
  );
}

function isSubAgentPayload(payload: unknown): payload is ToolCallPayload {
  return (
    payload !== null &&
    typeof payload === "object" &&
    (payload as Record<string, unknown>).isSubAgent === true
  );
}

function mergeParentPayload(
  current: ToolCallPayload,
  patch: { status?: ToolCallPayload["status"]; progress?: ToolCallProgress },
): ToolCallPayload {
  return {
    ...current,
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.progress ? { progress: { ...current.progress, ...patch.progress } } : {}),
  };
}

function readChildToolName(events: RuntimeEvent[]): string | undefined {
  for (const event of events) {
    if (event.type !== "item.started" || !event.payload || typeof event.payload !== "object") {
      continue;
    }
    const name = readNonEmptyString((event.payload as Record<string, unknown>).name);
    if (name) return name;
  }
  return undefined;
}

function captureChildResult(
  child: CodexChildThread,
  method: string,
  params: Record<string, unknown> | undefined,
): void {
  const item = readItem(params);
  if (item && canonicalTypeFor(item.type ?? item.kind) === "assistant_message") {
    const text = extractMessageText(item);
    if (text) child.resultText = text;
    return;
  }
  if (/agent.?message|assistant/iu.test(method) && method.endsWith("/delta")) {
    const delta = readNonEmptyString(params?.delta);
    if (delta) child.resultText += delta;
  }
}

function mapChildUserMessageStarted(
  child: CodexChildThread,
  method: string,
  params: Record<string, unknown> | undefined,
  threadId: string,
): RuntimeEvent[] | undefined {
  if (method !== "item/started") return undefined;
  const item = readItem(params);
  const providerItemId = readItemId(params, item);
  if (!item || !providerItemId || canonicalTypeFor(item.type ?? item.kind) !== "user_message") {
    return undefined;
  }
  if (child.mapperState.itemIdMap.has(providerItemId)) return [];

  const itemId = newItemId("user_message");
  child.mapperState.itemIdMap.set(providerItemId, itemId);
  child.mapperState.itemTypeMap.set(providerItemId, "user_message");
  const text = extractMessageText(item);
  return [
    {
      type: "item.started",
      threadId,
      itemId,
      itemType: "user_message",
      parentItemId: child.parentItemId,
      payload: { content: text ? [{ kind: "text", text }] : [] },
    },
  ];
}

function buildChildPromptEvents(
  threadId: string,
  parentItemId: string,
  prompt: string | undefined,
): RuntimeEvent[] {
  if (!prompt) return [];
  const itemId = newItemId("user_message");
  return [
    {
      type: "item.started",
      threadId,
      itemId,
      itemType: "user_message",
      parentItemId,
      payload: { content: [{ kind: "text", text: prompt }] },
    },
    {
      type: "item.completed",
      threadId,
      itemId,
    },
  ];
}

function readAgentDescription(agentPath: unknown): string | undefined {
  const path = readNonEmptyString(agentPath);
  const name = path?.split("/").filter(Boolean).at(-1);
  return name?.replace(/[_-]+/gu, " ").trim() || undefined;
}
