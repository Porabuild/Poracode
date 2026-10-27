import type { RuntimeEvent } from "@/shared/contracts";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAcpMapperState,
  mapAcpSessionUpdate,
  PORACODE_ACP_GOAL_META_KEY,
} from "../acp/canonicalMapping";
import goalFixture from "./fixtures/goal-lifecycle.json";
import { createDevinAcpTransform } from "./acpTransform";
import { createDevinGoalTransform } from "./goals";

const GOAL_META_KEY = "cognition.ai/goal";
const INFERENCE_TOOL_NAME_META_KEY = "cognition.ai/inferenceToolName";

type GoalScenarioName =
  | "statusEmpty"
  | "complete"
  | "statusComplete"
  | "clear"
  | "blocked"
  | "statusBlocked"
  | "replaceBlocked"
  | "resumeComplete"
  | "clearNone"
  | "interrupt"
  | "statusPaused"
  | "resume"
  | "clearMidRun"
  | "reloadStatus"
  | "reloadResume"
  | "reloadClear";

interface GoalScenario {
  prompt: string;
  stopReason: string;
  notifications: SessionNotification[];
}

const scenarios = goalFixture as unknown as Record<GoalScenarioName, GoalScenario>;

afterEach(() => {
  vi.useRealTimers();
});

function notification(update: Record<string, unknown>): SessionNotification {
  return { sessionId: "fixture-session", update } as unknown as SessionNotification;
}

function updateRecord(sessionNotification: SessionNotification): Record<string, unknown> {
  return sessionNotification.update as unknown as Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapScenarios(
  names: readonly GoalScenarioName[],
  transform: (notification: SessionNotification) => SessionNotification,
  state = createAcpMapperState("goal-thread"),
  onNotification?: (notification: SessionNotification) => void,
): { events: RuntimeEvent[]; state: ReturnType<typeof createAcpMapperState> } {
  const events: RuntimeEvent[] = [];
  for (const name of names) {
    for (const note of scenarios[name].notifications) {
      onNotification?.(note);
      events.push(...mapAcpSessionUpdate(transform(note), state));
    }
  }
  return { events, state };
}

function goalItems(events: RuntimeEvent[]): Array<{
  itemId: string;
  payloads: Array<Record<string, unknown>>;
}> {
  const items = new Map<string, Array<Record<string, unknown>>>();
  for (const event of events) {
    if (event.type === "item.started" && event.itemType === "goal" && "payload" in event) {
      items.set(event.itemId, [record(event.payload)]);
    } else if (event.type === "item.updated" && items.has(event.itemId) && "payload" in event) {
      items.get(event.itemId)!.push(record(event.payload));
    }
  }
  return [...items].map(([itemId, payloads]) => ({ itemId, payloads }));
}

function assistantMessages(events: RuntimeEvent[]): Array<{ itemId: string; text: string }> {
  const messages = new Map<string, string>();
  const order: string[] = [];
  for (const event of events) {
    if (event.type === "item.started" && event.itemType === "assistant_message") {
      messages.set(event.itemId, "");
      order.push(event.itemId);
    } else if (event.type === "content.delta" && event.stream === "assistant_text") {
      const previous = messages.get(event.itemId);
      if (previous !== undefined) messages.set(event.itemId, previous + event.delta);
    }
  }
  return order.map((itemId) => ({ itemId, text: messages.get(itemId)! }));
}

function findAssistantMessage(
  messages: readonly { itemId: string; text: string }[],
  text: string,
): string {
  return messages.find((message) => message.text.includes(text))!.itemId;
}

function goalPayload(snapshot: unknown): Record<string, unknown> {
  const candidate = record(snapshot);
  const update = candidate.update === undefined ? candidate : record(candidate.update);
  return record(record(update._meta)[GOAL_META_KEY]);
}

function updateGoalSummary(scenarioName: GoalScenarioName, status: "blocked" | "complete"): string {
  const call = scenarios[scenarioName].notifications.find((note) => {
    const update = record(note.update);
    return (
      update.sessionUpdate === "tool_call" &&
      record(update._meta)[INFERENCE_TOOL_NAME_META_KEY] === "update_goal" &&
      record(update.rawInput).status === status
    );
  });
  return String(record(record(call?.update).rawInput).summary);
}

describe("Devin goal lifecycle transform", () => {
  it("maps complete snapshots, deduplicates terminal snapshots, and separates continuation messages", () => {
    vi.useFakeTimers();
    const transform = createDevinAcpTransform();
    const snapshotTimesSeconds = [0, 10, 30, 60, 70];
    let snapshotIndex = 0;
    const { events } = mapScenarios(["complete"], transform, undefined, (note) => {
      if (Object.keys(goalPayload(note.update)).length > 0) {
        vi.setSystemTime(snapshotTimesSeconds[snapshotIndex++]! * 1000);
      }
    });
    const [goal] = goalItems(events);

    expect(
      events.find(
        (event) =>
          event.type === "item.started" &&
          event.itemType === "tool_call" &&
          "payload" in event &&
          record(event.payload).title === "Goal Complete",
      ),
    ).toBeDefined();
    expect(goalItems(events)).toHaveLength(1);
    expect(goal?.payloads).toHaveLength(4);
    expect(goal?.payloads[0]).toMatchObject({
      action: "set",
      status: "active",
      iterations: 0,
      availableActions: ["pause", "clear"],
      timeUsedSeconds: 0,
      updatedAt: 0,
    });
    expect(goal?.payloads[1]).toMatchObject({
      action: "updated",
      status: "active",
      iterations: 1,
      availableActions: ["pause", "clear"],
      timeUsedSeconds: 10,
    });
    expect(goal?.payloads[2]).toMatchObject({
      action: "updated",
      status: "active",
      iterations: 2,
      availableActions: ["pause", "clear"],
      timeUsedSeconds: 30,
    });
    expect(goal?.payloads[3]).toMatchObject({
      action: "updated",
      status: "complete",
      iterations: 3,
      availableActions: ["clear"],
      lastReason: updateGoalSummary("complete", "complete"),
      timeUsedSeconds: 60,
      updatedAt: 60,
    });

    const messages = assistantMessages(events);
    const itemIds = [
      findAssistantMessage(messages, "Created `goal-a.txt` containing `alpha`."),
      findAssistantMessage(messages, "Continuing goal (turn 2)"),
      findAssistantMessage(messages, "Submitted `goal-b.txt` containing `beta`."),
      findAssistantMessage(messages, "Continuing goal (turn 3)"),
      findAssistantMessage(messages, "Completed in three turns. Verified both files exist"),
    ];
    expect(new Set(itemIds).size).toBe(itemIds.length);
  });

  it("maps blocked goals with the latest summary and starts a new item when replaced", () => {
    const transform = createDevinAcpTransform();
    const { events } = mapScenarios(["blocked", "replaceBlocked"], transform);
    const goals = goalItems(events);

    expect(goals).toHaveLength(2);
    expect(goals[0]?.payloads.at(-1)).toMatchObject({
      status: "paused",
      availableActions: ["resume", "clear"],
      lastReason: updateGoalSummary("blocked", "blocked"),
    });
    expect(goals[1]?.itemId).not.toBe(goals[0]?.itemId);
    expect(goals[1]?.payloads[0]).toMatchObject({
      action: "set",
      status: "active",
      objective: "Write a short poem about the sea",
      iterations: 0,
    });
  });

  it("keeps a goal item across interrupt and resume with monotonic active time", () => {
    vi.useFakeTimers();
    const transform = createDevinAcpTransform();
    const snapshotTimesSeconds = [200, 215, 220, 230];
    let snapshotIndex = 0;
    const { events } = mapScenarios(["interrupt", "resume"], transform, undefined, (note) => {
      if (Object.keys(goalPayload(note.update)).length > 0) {
        vi.setSystemTime(snapshotTimesSeconds[snapshotIndex++]! * 1000);
      }
    });
    const [goal] = goalItems(events);

    expect(goalItems(events)).toHaveLength(1);
    expect(goal?.payloads.map((payload) => payload.timeUsedSeconds)).toEqual([0, 15, 15]);
    expect(goal?.payloads[1]).toMatchObject({
      status: "paused",
      availableActions: ["resume", "clear"],
      lastReason: "",
    });
    expect(goal?.payloads[2]).toMatchObject({
      status: "active",
      availableActions: ["pause", "clear"],
      lastReason: "",
    });

    const messages = assistantMessages(events);
    expect(findAssistantMessage(messages, "Continuing goal (turn 3)")).not.toBe(
      findAssistantMessage(messages, "Let me check whether the background ping already finished."),
    );
  });

  it.each(["clear", "clearMidRun"] as const)("maps %s to a cleared goal item", (scenario) => {
    const { events } = mapScenarios([scenario], createDevinAcpTransform());
    const goals = goalItems(events);

    expect(goals).toHaveLength(1);
    expect(goals[0]?.payloads.at(-1)).toEqual({
      action: "cleared",
      availableActions: [],
    });
  });

  it.each(["statusEmpty", "reloadStatus", "clearNone"] as const)(
    "clears a stale goal dock for %s no-goal replies",
    (scenario) => {
      const { events } = mapScenarios([scenario], createDevinAcpTransform());
      const goals = goalItems(events);

      expect(goals).toHaveLength(1);
      expect(goals[0]?.payloads[0]).toEqual({
        action: "cleared",
        availableActions: [],
      });
    },
  );

  it("emits a reload self-heal only once across resume then clear", () => {
    const { events } = mapScenarios(["reloadResume", "reloadClear"], createDevinAcpTransform());

    expect(goalItems(events)).toHaveLength(1);
    expect(goalItems(events)[0]?.payloads).toEqual([{ action: "cleared", availableActions: [] }]);
  });

  it("resets known-empty after a new native goal snapshot", () => {
    const transform = createDevinGoalTransform();
    const state = createAcpMapperState("goal-known-empty");
    const events: RuntimeEvent[] = [];
    const map = (note: SessionNotification) => {
      events.push(...mapAcpSessionUpdate(transform(note), state));
    };
    const noGoal = (text: string) =>
      notification({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text },
        _meta: { "cognition.ai/instant": true },
      });

    map(
      notification({
        sessionUpdate: "session_info_update",
        _meta: {
          [GOAL_META_KEY]: {
            id: "0",
            objective: "Old goal",
            status: "cleared",
            turns: 1,
          },
        },
      }),
    );
    map(noGoal("No goal to clear."));
    expect(goalItems(events)).toHaveLength(1);

    map(
      notification({
        sessionUpdate: "session_info_update",
        _meta: {
          [GOAL_META_KEY]: {
            id: "1",
            objective: "New goal",
            status: "running",
            turns: 0,
          },
        },
      }),
    );
    map(noGoal("No goal to resume."));

    const items = goalItems(events);
    expect(items).toHaveLength(2);
    expect(items[0]?.payloads[0]).toEqual({ action: "cleared", availableActions: [] });
    expect(items[1]?.payloads.map((payload) => payload.action)).toEqual(["set", "cleared"]);
  });

  it.each(["statusComplete", "statusBlocked", "statusPaused", "resumeComplete"] as const)(
    "does not invent a goal transition for %s status text",
    (scenario) => {
      const { events } = mapScenarios([scenario], createDevinAcpTransform());
      expect(goalItems(events)).toEqual([]);
    },
  );

  it("passes through non-goal and malformed snapshots unchanged", () => {
    const transform = createDevinGoalTransform();
    const nonGoal = notification({
      sessionUpdate: "session_info_update",
      _meta: { "cognition.ai/eventType": "status_update" },
    });
    const malformed = [
      null,
      [],
      { ...validGoal(), id: " " },
      { ...validGoal(), status: "unknown" },
      { ...validGoal(), turns: -1 },
      { ...validGoal(), objective: "   " },
      { ...validGoal(), status: "cleared", objective: undefined },
    ];
    expect(transform(nonGoal)).toBe(nonGoal);
    for (const goal of malformed) {
      const input = notification({
        sessionUpdate: "session_info_update",
        _meta: { [GOAL_META_KEY]: goal },
      });
      expect(transform(input)).toBe(input);
    }
  });

  it("preserves vendor metadata and leaves update_goal tool calls untouched", () => {
    const transform = createDevinGoalTransform();
    const snapshot = notification({
      sessionUpdate: "session_info_update",
      _meta: {
        [GOAL_META_KEY]: validGoal(),
        "cognition.ai/timestamp": "stamp",
        "vendor.example/opaque": { value: 1 },
      },
    });
    const normalized = transform(snapshot);
    expect(record(normalized.update._meta)).toMatchObject({
      "cognition.ai/timestamp": "stamp",
      "vendor.example/opaque": { value: 1 },
      poracodeGoal: { action: "set", objective: "Ship the goal feature" },
    });

    const updateGoalCall = notification({
      sessionUpdate: "tool_call",
      toolCallId: "update-goal",
      title: "Goal Complete",
      rawInput: { status: "complete", summary: "Done." },
      _meta: { [INFERENCE_TOOL_NAME_META_KEY]: "update_goal", "vendor.example/keep": true },
    });
    expect(transform(updateGoalCall)).toBe(updateGoalCall);
  });

  it("forgets update_goal outcomes when a running snapshot is processed", () => {
    const transform = createDevinGoalTransform();
    const running = notification({
      sessionUpdate: "session_info_update",
      _meta: { [GOAL_META_KEY]: validGoal() },
    });
    transform(running);
    const updateGoalCall = notification({
      sessionUpdate: "tool_call",
      toolCallId: "update-goal",
      rawInput: { status: "complete", summary: "Stale summary." },
      _meta: { [INFERENCE_TOOL_NAME_META_KEY]: "update_goal" },
    });
    expect(transform(updateGoalCall)).toBe(updateGoalCall);
    expect(transform(running)).toBe(running);

    const completed = notification({
      sessionUpdate: "session_info_update",
      _meta: {
        [GOAL_META_KEY]: {
          ...validGoal(),
          status: "complete",
          turns: 1,
        },
      },
    });
    const normalized = transform(completed);
    expect(
      record(record(updateRecord(normalized)._meta)[PORACODE_ACP_GOAL_META_KEY]),
    ).toMatchObject({ lastReason: "" });
  });

  it("does not let a subagent chunk consume the pending root display boundary", () => {
    const transform = createDevinGoalTransform();
    const display = notification({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Continuing goal (turn 2)" },
      _meta: { "cognition.ai/displayMessage": true, "vendor.example/display": 1 },
    });
    const displayResult = transform(display);
    expect(record(updateRecord(displayResult)._meta)).toMatchObject({
      "vendor.example/display": 1,
      poracodeNewAssistantItem: "owner",
    });

    const subagent = notification({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "subagent output" },
      _meta: {
        "cognition.ai/subagent_context": { parentAgentId: "child" },
        "vendor.example/child": true,
      },
    });
    expect(transform(subagent)).toBe(subagent);

    const nextRoot = notification({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "next root message" },
      _meta: { "vendor.example/root": true },
    });
    expect(record(updateRecord(transform(nextRoot))._meta)).toMatchObject({
      "vendor.example/root": true,
      poracodeNewAssistantItem: "owner",
    });
  });
});

function validGoal(): Record<string, unknown> {
  return { id: "0", objective: "Ship the goal feature", status: "running", turns: 0 };
}
