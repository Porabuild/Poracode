import type {
  CanonicalItemType,
  GoalItemPayload,
  RuntimeEvent,
  ToolCallPayload,
} from "@/shared/contracts";
import {
  goalPayloadFromProviderState,
  startGoalItemEvents,
  updateGoalItemEvents,
  type ProviderGoalState,
} from "../../goalRuntime";
import { mapMuseGoalMetadata } from "./goal";
import { mintMspCommandId } from "./uuidv7";

export type MuseMspItem = Record<string, unknown>;

export interface MuseMspItemMapperState {
  readonly threadId: string;
  readonly startedItemIds: Set<string>;
  readonly itemKinds: Map<string, string>;
  readonly itemAliases: Map<string, string>;
  readonly streamedItemIds: Set<string>;
  readonly reasoningFields: Map<string, string>;
  /** Agent id → declared type from `subagent_spawn`, so companion calls (`subagent_wait`, …) can name the agent they continue. */
  readonly subagentTypes: Map<string, string>;
  goalItemId?: string | undefined;
  goalObjective?: string | undefined;
  goalCreatedAt?: number | undefined;
}

export function createMuseMspItemMapperState(threadId: string): MuseMspItemMapperState {
  return {
    threadId,
    startedItemIds: new Set(),
    itemKinds: new Map(),
    itemAliases: new Map(),
    streamedItemIds: new Set(),
    reasoningFields: new Map(),
    subagentTypes: new Map(),
  };
}

export function aliasMuseMspItem(
  state: MuseMspItemMapperState,
  providerItemId: string,
  optimisticId: string,
): void {
  state.itemAliases.set(providerItemId, optimisticId);
}

export function completeOpenMuseMspItems(state: MuseMspItemMapperState): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const itemId of state.startedItemIds) {
    events.push({
      type: "item.completed",
      threadId: state.threadId,
      itemId,
    });
  }
  state.startedItemIds.clear();
  state.itemKinds.clear();
  state.itemAliases.clear();
  state.streamedItemIds.clear();
  state.reasoningFields.clear();
  return events;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Muse runs sub-agents through its `subagent_*` tool family: `subagent_spawn`
 * launches one, and `subagent_wait` / `subagent_status` / `subagent_read_result`
 * / `subagent_send_message` / `subagent_cancel` continue it by id. Mark those
 * tool calls as sub-agent rows so the composer and thread panel render them as
 * agents instead of plain tool rows; companion calls continue the spawned
 * agent's row (same surface Claude's `SendMessage` resume uses) and are named
 * from the type recorded at spawn when their own args don't carry one.
 *
 * Full child transcripts are not carried on these tool calls — for a richer
 * overlay later, `muse export --session <id>` (documented as stitching in
 * subagent transcripts that finish independently) is the known source.
 */
function museSubagentPayload(
  state: MuseMspItemMapperState,
  name: string,
  args: unknown,
  status: ToolCallPayload["status"],
): Partial<ToolCallPayload> {
  if (!name.startsWith("subagent_")) return {};
  const action = name.slice("subagent_".length);
  const record =
    args && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : undefined;
  const agentId =
    stringValue(record?.["id"]) ??
    stringValue(record?.["subagentId"]) ??
    stringValue(record?.["agentId"]) ??
    stringValue(record?.["subagent"]);
  const type =
    stringValue(record?.["agent"]) ??
    stringValue(record?.["agentType"]) ??
    stringValue(record?.["type"]) ??
    (agentId ? state.subagentTypes.get(agentId) : undefined);
  if (action === "spawn" && agentId && type) {
    state.subagentTypes.set(agentId, type);
  }
  const subAgentStatus =
    status === "running"
      ? ("running" as const)
      : status === "error"
        ? ("failed" as const)
        : ("completed" as const);
  return {
    isSubAgent: true,
    ...(action === "spawn" ? {} : { isSubAgentResume: true }),
    ...(type ? { subAgentType: type } : {}),
    subAgentStatus,
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && !Number.isNaN(value) ? value : undefined;
}

function toolKind(name: string): "read" | "edit" | "search" | "execute" | "fetch" | "other" {
  if (/^(read|ls|glob|list)/i.test(name)) return "read";
  if (/^(edit|write|apply|patch)/i.test(name)) return "edit";
  if (/^(grep|find|search)/i.test(name)) return "search";
  if (/^(bash|exec|shell|command)/i.test(name)) return "execute";
  if (/^(fetch|web|http)/i.test(name)) return "fetch";
  return "other";
}

function parseJsonArgs(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>;
    } catch {
      return { raw };
    }
  }
  return {};
}

/**
 * Shared started/updated/completed state machine for mapped items. First sight
 * emits `item.started`, later phases emit `item.updated`, and `completed`
 * closes with `item.completed` (emitting a synthetic `started` first when the
 * open was never observed, e.g. a replayed completion).
 */
function emitItemLifecycle(
  state: MuseMspItemMapperState,
  itemId: string,
  itemType: CanonicalItemType,
  payload: Record<string, unknown>,
  phase: "started" | "updated" | "completed",
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  const isStarted = state.startedItemIds.has(itemId);

  if (phase === "started" || (!isStarted && phase !== "completed")) {
    state.startedItemIds.add(itemId);
    events.push({
      type: "item.started",
      threadId: state.threadId,
      itemId,
      itemType,
      payload,
    } as RuntimeEvent);
    return events;
  }

  if (phase === "updated") {
    events.push({
      type: "item.updated",
      threadId: state.threadId,
      itemId,
      payload,
    });
    return events;
  }

  if (!isStarted) {
    state.startedItemIds.add(itemId);
    events.push({
      type: "item.started",
      threadId: state.threadId,
      itemId,
      itemType,
      payload,
    } as RuntimeEvent);
  } else {
    events.push({
      type: "item.updated",
      threadId: state.threadId,
      itemId,
      payload,
    });
  }
  state.startedItemIds.delete(itemId);
  events.push({
    type: "item.completed",
    threadId: state.threadId,
    itemId,
  });
  return events;
}

export function mapMuseMspItem(
  state: MuseMspItemMapperState,
  item: MuseMspItem,
  phase: "started" | "updated" | "completed",
): RuntimeEvent[] {
  const rawId = stringValue(item["itemId"]) ?? stringValue(item["id"]) ?? mintMspCommandId();
  const itemId = state.itemAliases.get(rawId) ?? rawId;
  const kind = stringValue(item["kind"]) ?? stringValue(item["type"]) ?? "unknown";
  state.itemKinds.set(itemId, kind);

  // Suppress internal bookkeeping items such as reminders
  if (kind === "reminderChild" || kind === "reminder") {
    return [];
  }

  const events: RuntimeEvent[] = [];

  if (kind === "agentMessage" || kind === "assistantMessage" || kind === "message") {
    const text = stringValue(item["text"]) ?? "";
    const lifecycle = emitItemLifecycle(
      state,
      itemId,
      "assistant_message",
      { content: [{ kind: "text", text }] },
      phase,
    );
    if (phase !== "completed" && text && !state.streamedItemIds.has(itemId)) {
      lifecycle.push({
        type: "content.delta",
        threadId: state.threadId,
        itemId,
        stream: "assistant_text",
        delta: text,
      });
      state.streamedItemIds.add(itemId);
    }
    return lifecycle;
  }

  if (kind === "userMessage") {
    const text = stringValue(item["text"]) ?? "";
    const hasOptimisticAlias = state.itemAliases.has(rawId);

    if (!hasOptimisticAlias && !state.startedItemIds.has(itemId)) {
      state.startedItemIds.add(itemId);
      events.push({
        type: "item.started",
        threadId: state.threadId,
        itemId,
        itemType: "user_message",
        payload: { content: [{ kind: "text", text }] },
      });
    }

    if (phase === "completed") {
      state.startedItemIds.delete(itemId);
      events.push({
        type: "item.completed",
        threadId: state.threadId,
        itemId,
      });
    }
    return events;
  }

  if (kind === "reasoning") {
    const summary = Array.isArray(item["summary"])
      ? item["summary"].filter((part): part is string => typeof part === "string")
      : [];
    const text = stringValue(item["text"]) ?? summary.join("\n\n");
    const lifecycle = emitItemLifecycle(state, itemId, "reasoning", {}, phase);
    if (text && !state.streamedItemIds.has(itemId)) {
      const delta: RuntimeEvent = {
        type: "content.delta",
        threadId: state.threadId,
        itemId,
        stream: "reasoning_text",
        delta: text,
      };
      const completedIndex = lifecycle.findIndex((event) => event.type === "item.completed");
      lifecycle.splice(completedIndex < 0 ? lifecycle.length : completedIndex, 0, delta);
      state.streamedItemIds.add(itemId);
    }
    return lifecycle;
  }

  if (kind === "toolCall") {
    const name = stringValue(item["tool"]) ?? stringValue(item["name"]) ?? "tool";
    const args = parseJsonArgs(item["args"] ?? item["input"]);
    const kindClass = toolKind(name);
    const rawStatus = stringValue(item["status"]);
    const status: ToolCallPayload["status"] =
      rawStatus === "completed" || rawStatus === "success"
        ? "success"
        : rawStatus && rawStatus !== "inProgress"
          ? "error"
          : phase === "completed"
            ? "success"
            : "running";
    const result = stringValue(item["visibleOutput"]);

    const payload: ToolCallPayload = {
      name,
      kind: kindClass,
      args,
      status,
      ...(result ? { result } : {}),
      ...museSubagentPayload(state, name, args, status),
    };

    return emitItemLifecycle(
      state,
      itemId,
      "tool_call",
      payload as unknown as Record<string, unknown>,
      phase,
    );
  }

  // Fallback for future or unhandled item kinds: dynamic_tool_call
  const fallbackTitle =
    stringValue(item["fallbackText"]) ??
    stringValue(item["title"]) ??
    stringValue(item["description"]) ??
    "Activity";
  const dynamicStatus =
    item["status"] === "completed"
      ? "success"
      : item["status"] === "inProgress"
        ? "running"
        : "error";

  return emitItemLifecycle(
    state,
    itemId,
    "dynamic_tool_call",
    { title: fallbackTitle, status: dynamicStatus },
    phase,
  );
}

export function mapMuseMspDelta(
  state: MuseMspItemMapperState,
  params: Record<string, unknown>,
): RuntimeEvent[] {
  const rawId = stringValue(params["itemId"]) ?? stringValue(params["id"]);
  if (!rawId) return [];
  const itemId = state.itemAliases.get(rawId) ?? rawId;
  const field = stringValue(params["field"]) ?? "text";
  const delta = stringValue(params["delta"]);
  if (!delta) return [];

  if (field === "output") {
    state.streamedItemIds.add(itemId);
    return [
      {
        type: "content.delta",
        threadId: state.threadId,
        itemId,
        stream: "command_output",
        delta,
      },
    ];
  }

  if (
    state.itemKinds.get(itemId) === "reasoning" ||
    field === "reasoning" ||
    field === "thought" ||
    field.startsWith("summary.")
  ) {
    const previousField = state.reasoningFields.get(itemId);
    state.reasoningFields.set(itemId, field);
    state.streamedItemIds.add(itemId);
    return [
      {
        type: "content.delta",
        threadId: state.threadId,
        itemId,
        stream: "reasoning_text",
        delta:
          previousField && previousField !== field && field.startsWith("summary.")
            ? `\n\n${delta}`
            : delta,
      },
    ];
  }

  if (field === "text") {
    state.streamedItemIds.add(itemId);
    return [
      {
        type: "content.delta",
        threadId: state.threadId,
        itemId,
        stream: "assistant_text",
        delta,
      },
    ];
  }

  return [];
}

export function isNewMuseGoal(goal: ProviderGoalState, state: MuseMspItemMapperState): boolean {
  if (goal.createdAt !== undefined && state.goalCreatedAt !== undefined) {
    return goal.createdAt !== state.goalCreatedAt;
  }
  return false;
}

/**
 * Maps incoming MSP `session/goalChanged` notifications to Poracode canonical goal runtime events.
 *
 * If `goal` is null or cleared, emits a final cleared event and resets mapper goal tracking.
 * Otherwise emits `item.started` (fresh goal) or `item.updated` (existing goal update).
 */
export function mapMuseMspGoalChanged(
  state: MuseMspItemMapperState,
  params: Record<string, unknown>,
): RuntimeEvent[] {
  const goalObj = params["goal"];
  if (goalObj === null || goalObj === undefined) {
    if (!state.goalItemId) return [];
    const clearedPayload: GoalItemPayload = {
      action: "cleared",
      objective: state.goalObjective ?? "",
      status: "cancelled",
      availableActions: [],
    };
    const events = updateGoalItemEvents(state.threadId, state.goalItemId, clearedPayload);
    state.goalItemId = undefined;
    state.goalObjective = undefined;
    state.goalCreatedAt = undefined;
    return events;
  }

  const goal = typeof goalObj === "object" ? (goalObj as Record<string, unknown>) : {};
  const objective = stringValue(goal["objective"]) ?? state.goalObjective ?? "Active Goal";
  const rawStatus = stringValue(goal["status"]) ?? "active";

  const meta = mapMuseGoalMetadata(rawStatus);
  const status = meta.status;
  const availableActions = meta.availableActions;

  const currentWork = stringValue(goal["currentWork"]);
  const iterations = numberValue(goal["iteration"]);
  const createdAt = numberValue(goal["createdAt"]);
  const updatedAt = numberValue(goal["updatedAt"]);

  const providerState: ProviderGoalState = {
    objective,
    status,
    availableActions,
    ...(iterations !== undefined ? { iterations } : {}),
    ...(currentWork ? { lastReason: currentWork } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };

  const isNew = !state.goalItemId || isNewMuseGoal(providerState, state);

  if (isNew) {
    const goalItemId = mintMspCommandId();
    state.goalItemId = goalItemId;
    state.goalObjective = objective;
    if (createdAt !== undefined) state.goalCreatedAt = createdAt;
    const payload = goalPayloadFromProviderState(providerState, "set");
    return startGoalItemEvents(state.threadId, goalItemId, payload);
  }

  const goalItemId = state.goalItemId!;
  state.goalObjective = objective;
  if (createdAt !== undefined) state.goalCreatedAt = createdAt;
  const payload = goalPayloadFromProviderState(providerState, "updated");
  return updateGoalItemEvents(state.threadId, goalItemId, payload);
}
