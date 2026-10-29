import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { createAcpMapperState, mapAcpSessionUpdate } from "../acp/canonicalMapping";
import { makeConfigSyncSession } from "../acp/sessionTestFixture";
import type { AcpSessionConfigSync } from "../acp/sessionConfigSync";
import { toAcpResourceUri } from "../acp/sessionPaths";
import { DEEPSEEK_ACP_SESSION_BEHAVIOR } from ".";
import { deepSeekGoalExtension } from "./goals";

const FLASH = '["deepseek-official","deepseek-v4-flash"]';
const PRO = '["deepseek-official","deepseek-v4-pro"]';

// Wire shape observed from @deepseek-ai/dsh 0.2.1-rc.2. The route strings are
// opaque ACP values, not slash-separated ids or JSON to rewrite on transport.
function configOptions(model = FLASH, effort = "high") {
  return [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: model,
      options: [
        {
          group: "deepseek-official",
          name: "DeepSeek",
          options: [
            { value: FLASH, name: "deepseek-v4-flash" },
            { value: PRO, name: "deepseek-v4-pro" },
          ],
        },
      ],
    },
    {
      id: "reasoning_effort",
      name: "Reasoning effort",
      category: "thought_level",
      type: "select",
      currentValue: effort,
      options: ["off", "low", "high", "max"].map((value) => ({ value, name: value })),
    },
  ];
}

describe("DeepSeek Harness ACP compatibility", () => {
  const nativeGoal = {
    id: "native-goal",
    revision: 1,
    objective: "Ship goal support",
    phase: "active",
    roundsStarted: 0,
    maxGoalRounds: 100,
  };

  function goalResult(
    state: ReturnType<typeof createAcpMapperState>,
    result: unknown,
    name = "get_goal",
    status: "completed" | "failed" = "completed",
  ) {
    const sessionId = "native-session";
    mapAcpSessionUpdate(
      {
        sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "goal-call",
          title: name,
          kind: "other",
          status: "in_progress",
          rawInput: {},
        },
      },
      state,
    );
    return mapAcpSessionUpdate(
      {
        sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "goal-call",
          status,
          content: [{ type: "content", content: { type: "text", text: JSON.stringify(result) } }],
        },
      },
      state,
    ).filter((event) => "itemId" in event && event.itemId.startsWith("deepseek-goal-"));
  }

  it("projects native goal tools through the session without replacing their tool rows", () => {
    const { session, listener } = makeConfigSyncSession({
      textStreamExtension: deepSeekGoalExtension,
    });
    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "create-call",
        title: "create_goal",
        kind: "other",
        status: "in_progress",
        rawInput: { objective: nativeGoal.objective },
      },
    });
    session.handleSessionUpdate({
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "create-call",
        status: "completed",
        content: [
          {
            type: "content",
            content: {
              type: "text",
              text: JSON.stringify({ goal: nativeGoal, activation: "armed" }),
            },
          },
        ],
      },
    });
    const events = listener.onRuntimeEvent.mock.calls.map(([event]) => event);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "goal",
        payload: expect.objectContaining({
          objective: nativeGoal.objective,
          status: "active",
          iterations: 0,
          availableActions: [],
        }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: "item.started", itemType: "tool_call" }),
    );
  });

  it("keeps one goal identity across edits, pause, rearm, blocking, completion and clear", () => {
    const state = createAcpMapperState("goal-thread", deepSeekGoalExtension);
    const created = goalResult(state, { goal: nativeGoal, activation: "armed" }, "create_goal");
    expect(created[0]).toMatchObject({
      type: "item.started",
      itemId: "deepseek-goal-goal-thread-native-goal",
    });
    const phases = [
      ["paused", "disarmed", "paused"],
      ["active", "disarmed", "paused"],
      ["active", "armed", "active"],
      ["blocked", "disarmed", "paused"],
      ["complete", "disarmed", "complete"],
    ] as const;
    for (const [index, [phase, activation, status]] of phases.entries()) {
      const result = {
        goal: {
          ...nativeGoal,
          objective: "Edited goal",
          revision: index + 2,
          roundsStarted: index + 1,
          phase,
          ...(phase === "blocked"
            ? { blockedReason: { code: "model-reported", message: "Missing access" } }
            : {}),
        },
        activation,
      };
      expect(goalResult(state, result, "update_goal")[0]).toMatchObject({
        type: "item.updated",
        itemId: "deepseek-goal-goal-thread-native-goal",
        payload: {
          objective: "Edited goal",
          status,
          iterations: index + 1,
          lastReason: phase === "blocked" ? "Missing access" : "",
          availableActions: [],
        },
      });
      expect(goalResult(state, result)).toEqual([]);
    }
    expect(goalResult(state, { goal: null })[0]).toMatchObject({
      type: "item.updated",
      payload: { action: "cleared" },
    });
    expect(goalResult(state, { goal: null })).toEqual([]);
    expect(
      goalResult(state, { goal: { ...nativeGoal, id: "replacement" }, activation: "armed" })[0],
    ).toMatchObject({
      type: "item.started",
      itemId: "deepseek-goal-goal-thread-replacement",
    });
  });

  it("restores stable snapshots after reconnect and maps the native round limit", () => {
    const result = {
      goal: {
        ...nativeGoal,
        phase: "blocked",
        roundsStarted: 100,
        blockedReason: { code: "round-limit", message: "Round limit reached" },
      },
      activation: "disarmed",
    };
    for (let connection = 0; connection < 2; connection++) {
      const events = goalResult(createAcpMapperState("restored", deepSeekGoalExtension), result);
      expect(events).toEqual([
        expect.objectContaining({
          type: "item.started",
          itemId: "deepseek-goal-restored-native-goal",
          payload: expect.objectContaining({ status: "budget_limited", iterations: 100 }),
        }),
        expect.objectContaining({
          type: "item.completed",
          itemId: "deepseek-goal-restored-native-goal",
          payload: expect.objectContaining({ status: "budget_limited" }),
        }),
      ]);
    }
    expect(
      goalResult(createAcpMapperState("restored", deepSeekGoalExtension), { goal: null })[0],
    ).toMatchObject({
      type: "item.started",
      payload: { action: "cleared" },
    });
  });

  it("accumulates observed active time across updates and freezes it while paused", () => {
    const clock = vi.spyOn(Date, "now");
    try {
      const state = createAcpMapperState("timed", deepSeekGoalExtension);
      const steps = [
        [0, "active", 0],
        [30, "active", 30],
        [50, "paused", 50],
        [100, "active", 50],
        [110, "complete", 60],
      ] as const;
      for (const [index, [seconds, phase, elapsed]] of steps.entries()) {
        clock.mockReturnValue(seconds * 1000);
        expect(
          goalResult(state, {
            goal: { ...nativeGoal, revision: index + 1, phase },
            activation: phase === "active" ? "armed" : "disarmed",
          })[0],
        ).toMatchObject({ payload: { timeUsedSeconds: elapsed, updatedAt: seconds } });
      }
      clock.mockReturnValue(200_000);
      expect(
        goalResult(state, { goal: { ...nativeGoal, id: "next" }, activation: "armed" })[0],
      ).toMatchObject({
        payload: { timeUsedSeconds: 0, updatedAt: 200 },
      });
    } finally {
      clock.mockRestore();
    }
  });

  it("ignores failed, malformed, unrelated and stale goal results", () => {
    const state = createAcpMapperState("guarded", deepSeekGoalExtension);
    for (const goal of [
      { ...nativeGoal, revision: 0 },
      { ...nativeGoal, phase: "unknown" },
      { ...nativeGoal, roundsStarted: -1 },
    ]) {
      expect(goalResult(state, { goal })).toEqual([]);
    }
    expect(goalResult(state, { goal: nativeGoal }, "create_goal", "failed")).toEqual([]);
    expect(goalResult(state, { goal: nativeGoal }, "pwsh")).toEqual([]);
    expect(
      goalResult(state, { goal: { ...nativeGoal, revision: 2 }, activation: "armed" }),
    ).not.toEqual([]);
    expect(goalResult(state, { goal: nativeGoal, activation: "armed" })).toEqual([]);
    // Older ACP tool updates without a goal result remain ordinary tool rows.
    expect(
      mapAcpSessionUpdate(
        {
          sessionId: "native-session",
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: "old-call",
            status: "completed",
          },
        } as SessionNotification,
        state,
      ).some((event) => "itemId" in event && event.itemId.startsWith("deepseek-goal-")),
    ).toBe(false);
  });

  it("sends readable images as file links on initial and follow-up Account turns", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "deepseek-image-"));
    try {
      const imagePath = join(projectRoot, "diagram.png");
      writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const config = { model: '["deepseek-account","deepseek-flash"]' };
      const { session, connection } = makeConfigSyncSession({
        currentConfig: config,
        agentPromptCapabilities: { image: true },
        behavior: DEEPSEEK_ACP_SESSION_BEHAVIOR,
      });
      const location = {
        kind: process.platform === "win32" ? "windows" : "posix",
        path: projectRoot,
      } as const;
      Object.assign(session, { projectLocation: location });
      for (const prompt of ["inspect", "inspect again"]) {
        await session.startTurn(prompt, config, [
          { kind: "attachment", path: imagePath, mimeType: "image/png" },
        ]);
        expect(connection.prompt).toHaveBeenLastCalledWith({
          sessionId: "session-1",
          prompt: [
            {
              type: "resource_link",
              uri: toAcpResourceUri(location, imagePath),
              name: "diagram.png",
              mimeType: "image/png",
            },
            { type: "text", text: prompt },
          ],
        });
      }
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("switches the exact model route and reasoning option before sending the next prompt", async () => {
    const config = {
      model: FLASH,
      effort: "high",
      mode: "agent" as const,
      approvalPolicy: "default",
    };
    const { session, connection } = makeConfigSyncSession({ currentConfig: config });
    const internals = session as unknown as { sessionConfigSync: AcpSessionConfigSync };
    internals.sessionConfigSync.rememberOptions([], configOptions());
    connection.setSessionConfigOption.mockImplementation(async ({ configId, value }) => ({
      configOptions: configId === "model" ? configOptions(value) : configOptions(PRO, value),
    }));
    await session.startTurn("DSH_FOLLOWUP", { ...config, model: PRO, effort: "low" });
    expect(
      connection.setSessionConfigOption.mock.calls.map(([value]) => [value.configId, value.value]),
    ).toEqual([
      ["model", PRO],
      ["reasoning_effort", "low"],
    ]);
    expect(connection.prompt).toHaveBeenCalledWith({
      sessionId: "session-1",
      prompt: [{ type: "text", text: "DSH_FOLLOWUP" }],
    });
  });

  it("reopens a persisted session with session/resume when session/load is absent", async () => {
    const config = { model: FLASH, effort: "high", approvalPolicy: "default" };
    const { session, connection } = makeConfigSyncSession({ currentConfig: config });
    Object.assign(session, {
      agentSessionCapabilities: { resume: {}, close: {}, list: {} },
      agentCapabilities: { loadSession: false },
    });
    connection.resumeSession.mockResolvedValue({ configOptions: configOptions() });
    expect(
      await session.openThread(config, {
        providerSessionId: "harness-persisted",
        discoveredAt: "2026-10-17T00:00:00Z",
      }),
    ).toBe("harness-persisted");
    expect(connection.resumeSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "harness-persisted" }),
    );
    expect(connection.loadSession).not.toHaveBeenCalled();
  });

  it.each(["never", "default"])(
    "honors the %s permission policy with Harness's one-shot choices",
    async (approvalPolicy) => {
      const config = { model: FLASH, mode: "agent" as const, approvalPolicy };
      const { session, connection, listener } = makeConfigSyncSession({ currentConfig: config });
      const request = {
        sessionId: "session-1",
        toolCall: { toolCallId: "dsh-tool" },
        options: [
          { optionId: "allow-once", name: "Allow once", kind: "allow_once" as const },
          { optionId: "reject-once", name: "Reject", kind: "reject_once" as const },
        ],
      };
      const pending = session.handlePermissionRequest(request);
      const opened = listener.onRuntimeEvent.mock.calls.flatMap(([event]) => {
        const value = event as { type?: string; requestId?: string };
        return value.type === "request.opened" && value.requestId ? [value.requestId] : [];
      });
      if (opened[0]) await session.resolveServerRequest(opened[0], { optionId: "reject-once" });
      expect(await pending).toEqual({
        outcome: {
          outcome: "selected",
          optionId: approvalPolicy === "never" ? "allow-once" : "reject-once",
        },
      });
      expect(opened).toHaveLength(approvalPolicy === "never" ? 0 : 1);
      expect(connection.prompt).not.toHaveBeenCalled();
    },
  );
});
