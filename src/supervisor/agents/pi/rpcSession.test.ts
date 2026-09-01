import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { StructuredSessionUpdate } from "../base";
import { PiRpcClient } from "./rpcClient";
import { PiRpcSession } from "./rpcSession";

// A minimal stand-in for `pi --mode rpc` so the session's protocol handling is
// exercised deterministically without a live provider or the (removed) SDK.
const MOCK_PI_SOURCE = `#!/usr/bin/env node
import { createInterface } from "node:readline";
const rl = createInterface({ input: process.stdin });
function send(msg) { process.stdout.write(JSON.stringify(msg) + "\\n"); }
rl.on("line", (line) => {
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const { id, type } = req;
  if (type === "prompt") {
    send({ type: "response", id, command: "prompt", success: true });
    const text = req.message || "";
    if (text.includes("GOAL_PLUGIN") && !text.includes("CODEX_GOAL_PLUGIN")) {
      const goal = { id: "pi-goal-1", text: "Finish the goal smoke", status: "active", startedAt: 1700000000000, updatedAt: 1700000000000, iteration: 0, tokenBudget: 10000, tokensUsed: 0, timeUsedSeconds: 0 };
      send({ type: "entry_appended", entry: { type: "custom", customType: "goal-state", data: { goal } } });
      send({ type: "entry_appended", entry: { type: "custom", customType: "goal-state", data: { goal: { ...goal, status: "paused", updatedAt: 1700000001000, iteration: 1, tokensUsed: 4000, timeUsedSeconds: 1 } } } });
      send({ type: "entry_appended", entry: { type: "custom", customType: "goal-state", data: { goal: { ...goal, status: "complete", updatedAt: 1700000002000, iteration: 1, tokensUsed: 5000, timeUsedSeconds: 2 } } } });
      send({ type: "entry_appended", entry: { type: "custom", customType: "goal-state", data: { goal: null } } });
      send({ type: "agent_start" });
      send({ type: "agent_settled" });
      return;
    }
    if (text.includes("GENERIC_PLUGIN")) {
      send({ type: "extension_ui_request", id: "status-1", method: "setStatus", statusKey: "plugin-progress", statusText: "halfway" });
      send({ type: "entry_appended", entry: { type: "custom", customType: "plugin-progress", data: { current: 1, total: 2 } } });
      send({ type: "agent_start" });
      send({ type: "agent_settled" });
      return;
    }
    if (text.includes("CODEX_GOAL_PLUGIN")) {
      const goal = { goalId: "codex-goal-1", objective: "Finish the Codex-style goal", status: "active", tokenBudget: 10000, usage: { tokensUsed: 0, activeSeconds: 0 }, createdAt: 1700000000000, updatedAt: 1700000000000 };
      send({ type: "entry_appended", entry: { type: "custom", customType: "pi-codex-goal", data: { version: 1, kind: "set", source: "tool", goal, at: 1700000000000 } } });
      send({ type: "entry_appended", entry: { type: "custom", customType: "pi-codex-goal", data: { version: 1, kind: "usage", source: "runtime", goalId: "codex-goal-1", status: "budgetLimited", usage: { tokensUsed: 10000, activeSeconds: 7 }, updatedAt: 1700000001000, at: 1700000001000 } } });
      send({ type: "entry_appended", entry: { type: "custom", customType: "pi-codex-goal", data: { version: 1, kind: "set", source: "tool", goal: { ...goal, status: "complete", usage: { tokensUsed: 12000, activeSeconds: 9 }, updatedAt: 1700000002000 }, at: 1700000002000 } } });
      send({ type: "entry_appended", entry: { type: "custom", customType: "pi-codex-goal", data: { version: 1, kind: "clear", source: "tool", clearedGoalId: "codex-goal-1", at: 1700000003000 } } });
      send({ type: "agent_start" });
      send({ type: "agent_settled" });
      return;
    }
    if (text.includes("DIALOG")) {
      send({ type: "extension_ui_request", id: "dlg-1", method: "select", title: "Pick one", options: ["alpha", "beta"] });
      return;
    }
    if (text.includes("ECHO")) {
      send({ type: "agent_start" });
      send({ type: "message_start" });
      send({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "SAW:" + text } });
      send({ type: "message_end" });
      send({ type: "agent_settled" });
      return;
    }
    if (text.includes("FAIL")) {
      send({ type: "agent_start" });
      send({ type: "message_update", assistantMessageEvent: { type: "error", error: { errorMessage: "MOCK_PROVIDER_ERROR" } } });
      send({ type: "agent_settled" });
      return;
    }
    send({ type: "agent_start" });
    send({ type: "turn_start" });
    send({ type: "message_start" });
    send({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "MOCK_" } });
    send({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "RESPONSE" } });
    send({ type: "message_end" });
    send({ type: "turn_end" });
    send({ type: "agent_end" });
    send({ type: "agent_settled" });
    return;
  }
  if (type === "extension_ui_response") {
    send({ type: "agent_start" });
    send({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "DIALOG_DONE:" + (req.value ?? "cancelled") } });
    send({ type: "agent_settled" });
    return;
  }
  if (type === "get_state") {
    send({ type: "response", id, command: "get_state", success: true, data: { sessionId: "mock-session-1", isStreaming: false } });
    return;
  }
  if (type === "get_session_stats") {
    send({ type: "response", id, command: "get_session_stats", success: true, data: { sessionId: "mock-session-1", contextUsage: { tokens: 100, contextWindow: 1000, percent: 10 }, tokens: { input: 60, output: 25, cacheRead: 10, cacheWrite: 5, total: 100 }, cost: 0.01 } });
    return;
  }
  if (type === "get_commands") {
    send({ type: "response", id, command: "get_commands", success: true, data: { commands: [{ name: "mock-command", description: "A mock command" }] } });
    return;
  }
  if (type === "abort" || type === "set_model" || type === "set_thinking_level" || type === "steer") {
    send({ type: "response", id, command: type, success: true });
    return;
  }
});
`;

function waitFor(
  events: RuntimeEvent[],
  predicate: (event: RuntimeEvent) => boolean,
): Promise<RuntimeEvent> {
  return new Promise((resolve) => {
    const existing = events.find(predicate);
    if (existing) return resolve(existing);
    const interval = setInterval(() => {
      const found = events.find(predicate);
      if (found) {
        clearInterval(interval);
        resolve(found);
      }
    }, 5);
  });
}

describe("PiRpcSession (mock pi --mode rpc)", () => {
  let projectDir: string;
  let mockBinary: string;

  beforeAll(() => {
    projectDir = mkdtempSync(join(tmpdir(), "poracode-pi-rpc-mock-"));
    mockBinary = join(projectDir, "mock-pi.mjs");
    writeFileSync(mockBinary, MOCK_PI_SOURCE, "utf8");
    const spawn = PiRpcClient.spawn;
    vi.spyOn(PiRpcClient, "spawn").mockImplementation((spec) =>
      spawn({ ...spec, command: process.execPath, args: [mockBinary, ...spec.args] }),
    );
  });
  afterAll(() => {
    vi.restoreAllMocks();
    rmSync(projectDir, { recursive: true, force: true });
  });

  function makeSession() {
    const events: RuntimeEvent[] = [];
    const updates: StructuredSessionUpdate[] = [];
    return { events, updates };
  }

  async function createSession() {
    const { events, updates } = makeSession();
    const session = await PiRpcSession.create(
      {
        threadId: "thread-mock",
        projectLocation: { kind: "posix", path: projectDir },
        config: { model: "mock/model", effort: "off" },
        presentationMode: "gui",
      },
      { binary: mockBinary },
    );
    session.setListener({
      onClose() {},
      onError() {},
      onUpdate(update) {
        updates.push(update);
      },
      onRuntimeEvent(event) {
        events.push(event);
      },
    });
    return { session, events, updates };
  }

  async function disposeSettledSession(
    session: PiRpcSession,
    events: RuntimeEvent[],
    updates: StructuredSessionUpdate[],
  ): Promise<void> {
    await waitFor(events, (event) => event.type === "context.updated");
    await waitFor(
      events,
      () => updates.filter((update) => update.slashCommands !== undefined).length >= 2,
    );
    await session.dispose();
  }

  it("streams a turn into canonical events and publishes session ref + context", async () => {
    const { session, events, updates } = await createSession();
    await session.startTurn?.("hello", { model: "mock/model", effort: "off" });

    const text = events
      .filter(
        (e): e is Extract<RuntimeEvent, { type: "content.delta" }> =>
          e.type === "content.delta" && e.stream === "assistant_text",
      )
      .map((e) => e.delta)
      .join("");
    expect(text).toBe("MOCK_RESPONSE");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "session.started" }),
        expect.objectContaining({ type: "turn.started" }),
        expect.objectContaining({ type: "item.started", itemType: "assistant_message" }),
        expect.objectContaining({ type: "turn.completed", state: "completed" }),
      ]),
    );
    // Context usage + session ref publish asynchronously after the turn settles.
    await waitFor(events, (e) => e.type === "context.updated");
    expect(events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "context.updated" })]),
    );
    await waitFor(events, () =>
      updates.some((u) => u.sessionRef?.providerSessionId === "mock-session-1"),
    );
    expect(updates.every((update) => update.sessionRef?.providerSessionId !== "")).toBe(true);
    expect(updates.at(-1)?.sessionRef?.providerSessionId).toBe("mock-session-1");
    await disposeSettledSession(session, events, updates);
  });

  it("publishes cumulative usage.spent from get_session_stats tokens.total", async () => {
    const { session, events, updates } = await createSession();
    await session.startTurn?.("hello", { model: "mock/model", effort: "off" });

    // Spend publishes after the turn settles, off the same stats response as
    // context.updated — tokens.total (billed cumulative), not contextUsage.
    const spent = await waitFor(events, (e) => e.type === "usage.spent");
    expect(spent).toMatchObject({
      type: "usage.spent",
      threadId: "thread-mock",
      usage: {
        counterKind: "cumulative",
        counter: 100,
        scopeId: "mock-session-1",
        epoch: 0,
        fresh: true,
        sampleId: "mock-session-1:0:100",
        model: "mock/model",
      },
    });
    await disposeSettledSession(session, events, updates);
  });

  it("sends inline instructions to pi without painting them into the user's message", async () => {
    const { session, events, updates } = await createSession();
    await session.startTurn?.("ECHO please", { model: "mock/model", effort: "off" }, undefined, {
      userMessageItemId: "user-1",
      inlineInstructions: "[provider handoff] read_thread first",
    });

    const seen = events
      .filter(
        (e): e is Extract<RuntimeEvent, { type: "content.delta" }> =>
          e.type === "content.delta" && e.stream === "assistant_text",
      )
      .map((e) => e.delta)
      .join("");
    expect(seen).toBe("SAW:ECHO please\n\n[provider handoff] read_thread first");
    // The painted user_message stays the user's own text.
    const userMessage = events.find(
      (event) => event.type === "item.started" && event.itemType === "user_message",
    );
    expect(JSON.stringify(userMessage)).toContain("ECHO please");
    expect(JSON.stringify(userMessage)).not.toContain("provider handoff");
    await disposeSettledSession(session, events, updates);
  });

  it("surfaces a provider error as a failed turn", async () => {
    const { session, events, updates } = await createSession();
    await session.startTurn?.("FAIL please", { model: "mock/model", effort: "off" });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "error", message: "MOCK_PROVIDER_ERROR" }),
        expect.objectContaining({ type: "turn.completed", state: "failed" }),
      ]),
    );
    await disposeSettledSession(session, events, updates);
  });

  it("maps persisted pi-goal lifecycle entries into a canonical goal item", async () => {
    const { session, events, updates } = await createSession();
    await session.startTurn?.("GOAL_PLUGIN", { model: "mock/model", effort: "off" });

    const goalEvents = events.filter(
      (event): event is Extract<RuntimeEvent, { type: "item.started" | "item.updated" }> =>
        (event.type === "item.started" && event.itemType === "goal") ||
        event.type === "item.updated",
    );
    expect(goalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "item.started",
          itemType: "goal",
          payload: expect.objectContaining({
            action: "set",
            objective: "Finish the goal smoke",
            status: "active",
            tokenBudget: 10000,
          }),
        }),
        expect.objectContaining({
          type: "item.updated",
          payload: expect.objectContaining({ status: "paused", tokensUsed: 4000 }),
        }),
        expect.objectContaining({
          type: "item.updated",
          payload: expect.objectContaining({ status: "complete", tokensUsed: 5000 }),
        }),
      ]),
    );
    expect(
      goalEvents.some(
        (event) =>
          event.type === "item.updated" &&
          (event.payload as { action?: string }).action === "cleared",
      ),
    ).toBe(false);
    await disposeSettledSession(session, events, updates);
  });

  it("maps pi-codex-goal session entries into the native goal lifecycle", async () => {
    const { session, events, updates } = await createSession();
    await session.startTurn?.("CODEX_GOAL_PLUGIN", { model: "mock/model", effort: "off" });

    const goalEvents = events.filter(
      (event): event is Extract<RuntimeEvent, { type: "item.started" | "item.updated" }> =>
        (event.type === "item.started" && event.itemType === "goal") ||
        event.type === "item.updated",
    );
    expect(goalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "item.started",
          itemType: "goal",
          payload: expect.objectContaining({
            objective: "Finish the Codex-style goal",
            status: "active",
          }),
        }),
        expect.objectContaining({
          type: "item.updated",
          payload: expect.objectContaining({ status: "budget_limited", tokensUsed: 10000 }),
        }),
        expect.objectContaining({
          type: "item.updated",
          payload: expect.objectContaining({ status: "complete", tokensUsed: 12000 }),
        }),
      ]),
    );
    expect(
      goalEvents.some(
        (event) =>
          event.type === "item.updated" &&
          (event.payload as { action?: string }).action === "cleared",
      ),
    ).toBe(false);
    await disposeSettledSession(session, events, updates);
  });

  it("preserves unknown Pi plugin status and custom entries as generic activity", async () => {
    const { session, events, updates } = await createSession();
    await session.startTurn?.("GENERIC_PLUGIN", { model: "mock/model", effort: "off" });

    const activities = events.filter(
      (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
        event.type === "item.started" && event.itemType === "dynamic_tool_call",
    );
    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({ name: "plugin-progress", result: "halfway" }),
        }),
        expect.objectContaining({
          payload: expect.objectContaining({
            name: "plugin-progress",
            result: { current: 1, total: 2 },
          }),
        }),
      ]),
    );
    await disposeSettledSession(session, events, updates);
  });

  it("maps an extension UI dialog to a server request and resolves it", async () => {
    const { session, events, updates } = await createSession();
    const turn = session.startTurn?.("DIALOG", { model: "mock/model", effort: "off" });
    const request = (await waitFor(events, (e) => e.type === "request.opened")) as Extract<
      RuntimeEvent,
      { type: "request.opened" }
    >;
    expect(request.payload.summary).toBe("Pick one");
    await session.resolveServerRequest?.(request.requestId, { optionId: "alpha" });
    await turn;
    const text = events
      .filter(
        (e): e is Extract<RuntimeEvent, { type: "content.delta" }> =>
          e.type === "content.delta" && e.stream === "assistant_text",
      )
      .map((e) => e.delta)
      .join("");
    expect(text).toBe("DIALOG_DONE:alpha");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "request.resolved", outcome: "answered" }),
      ]),
    );
    await disposeSettledSession(session, events, updates);
  });
});
