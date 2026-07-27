import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CodexUsageScopeTracker,
  createCodexMapperState,
  mapCodexNotification,
  mapCodexServerRequest,
  translateCodexCanonicalResponse,
} from "./canonicalMapping";

describe("mapCodexNotification — turn lifecycle", () => {
  it("emits turn.started with the supplied turnId", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification("turn/started", { turnId: "abc", threadId: "x" }, state);
    expect(events).toEqual([{ type: "turn.started", threadId: "t-codex", turnId: "abc" }]);
    expect(state.currentTurnId).toBe("abc");
  });

  it("emits turn.started with the real app-server nested turn id", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "turn/started",
      { threadId: "x", turn: { id: "turn-real", status: "inProgress" } },
      state,
    );
    expect(events).toEqual([{ type: "turn.started", threadId: "t-codex", turnId: "turn-real" }]);
    expect(state.currentTurnId).toBe("turn-real");
  });

  it("closes any open assistant item when a turn completes", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification("turn/started", { turnId: "t-1", threadId: "x" }, state);
    mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        turnId: "t-1",
        itemId: "msg-1",
        item: { id: "msg-1", type: "agentMessage" },
      },
      state,
    );
    expect(state.openAssistantItemId).toBeDefined();

    const events = mapCodexNotification("turn/completed", { threadId: "x" }, state);
    expect(events.map((e) => e.type)).toEqual(["item.completed", "turn.completed"]);
    expect(state.openAssistantItemId).toBeUndefined();
    expect(state.currentTurnId).toBeUndefined();
  });

  it("treats legacy turn/aborted as turn.completed with state=interrupted", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification("turn/started", { turnId: "t-1", threadId: "x" }, state);
    const events = mapCodexNotification("turn/aborted", { threadId: "x" }, state);
    const completed = events.find((e) => e.type === "turn.completed");
    expect(completed).toMatchObject({ type: "turn.completed", state: "interrupted" });
  });

  it("treats turn/completed with interrupted status as state=interrupted", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification("turn/started", { turnId: "t-1", threadId: "x" }, state);
    const events = mapCodexNotification(
      "turn/completed",
      { threadId: "x", turn: { id: "t-1", status: "interrupted" } },
      state,
    );
    const completed = events.find((e) => e.type === "turn.completed");
    expect(completed).toMatchObject({ type: "turn.completed", state: "interrupted" });
  });

  it("preserves failed turn status and surfaces the Codex error message", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification("turn/started", { turnId: "t-1", threadId: "x" }, state);
    const events = mapCodexNotification(
      "turn/completed",
      {
        threadId: "x",
        turn: { id: "t-1", status: "failed", error: { message: "Rate limit exceeded" } },
      },
      state,
    );

    expect(events).toEqual([
      { type: "error", threadId: "t-codex", message: "Rate limit exceeded" },
      { type: "turn.completed", threadId: "t-codex", turnId: "t-1", state: "failed" },
    ]);
  });

  it("falls back from whitespace-only Codex error messages", () => {
    const state = createCodexMapperState("t-codex");

    expect(mapCodexNotification("error", { error: { message: "   " } }, state)).toEqual([
      { type: "error", threadId: "t-codex", message: "Codex thread error" },
    ]);
  });

  it("maps turn usage into context usage when the app-server provides it", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification("turn/started", { turnId: "t-1", threadId: "x" }, state);
    const events = mapCodexNotification(
      "turn/completed",
      {
        threadId: "x",
        turn: { id: "t-1", usage: { input_tokens: 10_000, output_tokens: 2_000, size: 200_000 } },
      },
      state,
    );

    expect(events[0]).toEqual({
      type: "context.updated",
      threadId: "t-codex",
      usage: {
        usedTokens: 12_000,
        maxTokens: 200_000,
        breakdown: [
          { id: "input", label: "Input", tokens: 10_000 },
          { id: "output", label: "Output", tokens: 2_000 },
        ],
      },
    });
  });

  it("maps Codex token usage notifications into context usage", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "thread/tokenUsage/updated",
      {
        threadId: "x",
        info: {
          last_token_usage: {
            input_tokens: 19_250,
            cached_input_tokens: 2_432,
            output_tokens: 85,
            reasoning_output_tokens: 74,
            total_tokens: 19_335,
          },
          model_context_window: 258_400,
        },
      },
      state,
    );

    expect(events).toEqual([
      {
        type: "context.updated",
        threadId: "t-codex",
        usage: {
          usedTokens: 19_335,
          maxTokens: 258_400,
          breakdown: [
            { id: "input", label: "Input", tokens: 19_250 },
            { id: "output", label: "Output", tokens: 85 },
            { id: "reasoning", label: "Reasoning", tokens: 74 },
            { id: "cache-read", label: "Cache read", tokens: 2_432 },
          ],
        },
      },
    ]);
  });

  it("maps current Codex tokenUsage notifications into context usage", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "thread/tokenUsage/updated",
      {
        threadId: "x",
        turnId: "turn-1",
        tokenUsage: {
          total: {
            inputTokens: 11_833,
            cachedInputTokens: 3456,
            outputTokens: 6,
            reasoningOutputTokens: 0,
            totalTokens: 11_839,
          },
          last: {
            inputTokens: 120,
            cachedInputTokens: 0,
            outputTokens: 6,
            reasoningOutputTokens: 4,
            totalTokens: 130,
          },
          modelContextWindow: 258_400,
        },
      },
      state,
    );

    expect(events).toEqual([
      {
        type: "context.updated",
        threadId: "t-codex",
        usage: {
          usedTokens: 130,
          maxTokens: 258_400,
          breakdown: [
            { id: "input", label: "Input", tokens: 120 },
            { id: "output", label: "Output", tokens: 6 },
            { id: "reasoning", label: "Reasoning", tokens: 4 },
          ],
        },
      },
    ]);
  });
});

describe("mapCodexNotification — usage.spent", () => {
  function tokenUsageParams(totalTokens: number, lastTotalTokens = 130): Record<string, unknown> {
    return {
      threadId: "codex-thread-1",
      turnId: "turn-1",
      tokenUsage: {
        total: {
          inputTokens: totalTokens - 6,
          cachedInputTokens: 0,
          outputTokens: 6,
          reasoningOutputTokens: 0,
          totalTokens,
        },
        last: {
          inputTokens: lastTotalTokens - 6,
          cachedInputTokens: 0,
          outputTokens: 6,
          reasoningOutputTokens: 0,
          totalTokens: lastTotalTokens,
        },
        modelContextWindow: 258_400,
      },
    };
  }

  function spentEventOf(
    state: ReturnType<typeof createCodexMapperState>,
    params: Record<string, unknown>,
  ) {
    return mapCodexNotification("thread/tokenUsage/updated", params, state).find(
      (event) => event.type === "usage.spent",
    );
  }

  it("emits a cumulative usage.spent sample from the total (never last) alongside context.updated", () => {
    const state = createCodexMapperState("t-codex");
    state.usageScope = new CodexUsageScopeTracker("codex-thread-1", true);

    const events = mapCodexNotification(
      "thread/tokenUsage/updated",
      tokenUsageParams(11_839),
      state,
    );

    expect(events).toEqual([
      {
        type: "context.updated",
        threadId: "t-codex",
        usage: {
          usedTokens: 130,
          maxTokens: 258_400,
          breakdown: [
            { id: "input", label: "Input", tokens: 124 },
            { id: "output", label: "Output", tokens: 6 },
          ],
        },
      },
      {
        type: "usage.spent",
        threadId: "t-codex",
        usage: {
          counterKind: "cumulative",
          counter: 11_839,
          scopeId: "codex-thread-1",
          epoch: 0,
          fresh: true,
          sampleId: "codex-thread-1:0:11839",
          occurredAt: expect.any(Number),
        },
      },
    ]);
  });

  it("reads the cumulative total from legacy snake_case payloads", () => {
    const state = createCodexMapperState("t-codex");
    state.usageScope = new CodexUsageScopeTracker("codex-thread-1", false);

    const spent = spentEventOf(state, {
      threadId: "codex-thread-1",
      token_usage: {
        total_token_usage: { total_tokens: 5_000, input_tokens: 4_000, output_tokens: 1_000 },
        last_token_usage: { total_tokens: 42 },
        model_context_window: 200_000,
      },
    });

    expect(spent).toEqual({
      type: "usage.spent",
      threadId: "t-codex",
      usage: {
        counterKind: "cumulative",
        counter: 5_000,
        scopeId: "codex-thread-1",
        epoch: 0,
        sampleId: "codex-thread-1:0:5000",
        occurredAt: expect.any(Number),
      },
    });
  });

  it("marks only the first sample of a brand-new thread fresh", () => {
    const state = createCodexMapperState("t-codex");
    state.usageScope = new CodexUsageScopeTracker("codex-thread-1", true);

    expect(spentEventOf(state, tokenUsageParams(1_000))).toMatchObject({
      usage: { fresh: true, epoch: 0 },
    });
    const second = spentEventOf(state, tokenUsageParams(1_500));
    expect(second).toMatchObject({ usage: { counter: 1_500, epoch: 0 } });
    expect(second?.type === "usage.spent" && second.usage).not.toHaveProperty("fresh");
  });

  it("emits no usage.spent without a usage scope (terminal mode)", () => {
    const state = createCodexMapperState("t-codex");

    const events = mapCodexNotification(
      "thread/tokenUsage/updated",
      tokenUsageParams(11_839),
      state,
    );

    expect(events.every((event) => event.type === "context.updated")).toBe(true);
  });

  it("bumps the epoch when the cumulative counter resets", () => {
    const state = createCodexMapperState("t-codex");
    state.usageScope = new CodexUsageScopeTracker("codex-thread-1", false);

    expect(spentEventOf(state, tokenUsageParams(1_000))).toMatchObject({
      usage: { counter: 1_000, epoch: 0, sampleId: "codex-thread-1:0:1000" },
    });
    expect(spentEventOf(state, tokenUsageParams(1_500))).toMatchObject({
      usage: { counter: 1_500, epoch: 0, sampleId: "codex-thread-1:0:1500" },
    });
    // Upstream reset (e.g. ContextWindowExceeded): a lower total starts a new epoch.
    expect(spentEventOf(state, tokenUsageParams(300))).toMatchObject({
      usage: { counter: 300, epoch: 1, sampleId: "codex-thread-1:1:300" },
    });
    expect(spentEventOf(state, tokenUsageParams(400))).toMatchObject({
      usage: { counter: 400, epoch: 1, sampleId: "codex-thread-1:1:400" },
    });
  });

  it("starts a new epoch on fork (replaceScope) with a baseline, non-fresh sample", () => {
    const state = createCodexMapperState("t-codex");
    state.usageScope = new CodexUsageScopeTracker("codex-thread-1", true);

    expect(spentEventOf(state, tokenUsageParams(1_000))).toMatchObject({
      usage: { scopeId: "codex-thread-1", epoch: 0, fresh: true },
    });

    state.usageScope.replaceScope("codex-thread-2");

    // The forked thread's first sample carries inherited history: new epoch,
    // baseline-only (no fresh), and the lower counter is NOT read as a reset.
    const forked = spentEventOf(state, {
      ...tokenUsageParams(500),
      threadId: "codex-thread-2",
    });
    expect(forked).toMatchObject({
      usage: {
        counter: 500,
        scopeId: "codex-thread-2",
        epoch: 1,
        sampleId: "codex-thread-2:1:500",
      },
    });
    expect(forked?.type === "usage.spent" && forked.usage).not.toHaveProperty("fresh");
  });
});

describe("mapCodexNotification — goals", () => {
  it("maps Codex thread goal updates to a shared goal chat item", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "thread/goal/updated",
      {
        threadId: "provider-thread",
        turnId: "turn-1",
        goal: {
          threadId: "provider-thread",
          objective: "ship unified GUI goal support",
          status: "active",
          tokenBudget: 5000,
          tokensUsed: 120,
          timeUsedSeconds: 3,
          createdAt: 1778570000,
          updatedAt: 1778570003,
        },
      },
      state,
    );

    expect(events).toEqual([
      {
        type: "item.started",
        threadId: "t-codex",
        itemId: expect.stringMatching(/^goal-/u),
        itemType: "goal",
        payload: {
          action: "set",
          objective: "ship unified GUI goal support",
          status: "active",
          availableActions: ["edit", "pause", "clear"],
          tokenBudget: 5000,
          tokensUsed: 120,
          timeUsedSeconds: 3,
          providerThreadId: "provider-thread",
          updatedAt: 1778570003,
        },
      },
      {
        type: "item.completed",
        threadId: "t-codex",
        itemId: events[0]?.type === "item.started" ? events[0].itemId : "",
      },
    ]);
  });

  it.each([
    ["blocked", "paused"],
    ["usageLimited", "budget_limited"],
  ] as const)("maps Codex %s goals to canonical %s goals", (status, expectedStatus) => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "thread/goal/updated",
      {
        threadId: "provider-thread",
        turnId: null,
        goal: {
          threadId: "provider-thread",
          objective: "finish protocol integration",
          status,
          tokenBudget: null,
          tokensUsed: 0,
          timeUsedSeconds: 0,
          createdAt: 1778570000,
          updatedAt: 1778570000,
        },
      },
      state,
    );

    expect(events[0]).toMatchObject({
      type: "item.started",
      payload: { status: expectedStatus },
    });
  });

  it("updates the existing Codex goal item when the goal is cleared", () => {
    const state = createCodexMapperState("t-codex");
    const started = mapCodexNotification(
      "thread/goal/updated",
      {
        threadId: "provider-thread",
        goal: {
          threadId: "provider-thread",
          objective: "ship unified GUI goal support",
          status: "active",
          tokenBudget: null,
          tokensUsed: 0,
          timeUsedSeconds: 0,
          createdAt: 1778570000,
          updatedAt: 1778570000,
        },
      },
      state,
    );
    const goalItemId = started[0]?.type === "item.started" ? started[0].itemId : "";

    const cleared = mapCodexNotification(
      "thread/goal/cleared",
      { threadId: "provider-thread" },
      state,
    );

    expect(cleared).toEqual([
      {
        type: "item.updated",
        threadId: "t-codex",
        itemId: goalItemId,
        payload: {
          action: "cleared",
          providerThreadId: "provider-thread",
        },
      },
      { type: "item.completed", threadId: "t-codex", itemId: goalItemId },
    ]);
  });

  it("starts a new Codex goal item when the provider reports a new goal", () => {
    const state = createCodexMapperState("t-codex");
    const first = mapCodexNotification(
      "thread/goal/updated",
      {
        threadId: "provider-thread",
        goal: {
          objective: "ship initial goal",
          status: "active",
          tokensUsed: 120,
          timeUsedSeconds: 30,
          createdAt: 1778570000,
          updatedAt: 1778570030,
        },
      },
      state,
    );
    const firstGoalItemId = first[0]?.type === "item.started" ? first[0].itemId : "";

    const next = mapCodexNotification(
      "thread/goal/updated",
      {
        threadId: "provider-thread",
        goal: {
          objective: "ship next goal",
          status: "active",
          tokenBudget: null,
          tokensUsed: 0,
          timeUsedSeconds: 0,
          createdAt: 1778570100,
          updatedAt: 1778570100,
        },
      },
      state,
    );
    const nextGoalItemId = next[0]?.type === "item.started" ? next[0].itemId : "";

    expect(next).toEqual([
      {
        type: "item.started",
        threadId: "t-codex",
        itemId: expect.stringMatching(/^goal-/u),
        itemType: "goal",
        payload: {
          action: "set",
          objective: "ship next goal",
          status: "active",
          availableActions: ["edit", "pause", "clear"],
          tokenBudget: null,
          tokensUsed: 0,
          timeUsedSeconds: 0,
          updatedAt: 1778570100,
        },
      },
      { type: "item.completed", threadId: "t-codex", itemId: nextGoalItemId },
    ]);
    expect(nextGoalItemId).not.toBe(firstGoalItemId);
  });
});

describe("mapCodexNotification — plan updates", () => {
  it("maps structured turn plan updates to a stable plan item", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification("turn/started", { turnId: "turn-1", threadId: "x" }, state);

    const started = mapCodexNotification(
      "turn/plan/updated",
      {
        threadId: "x",
        turnId: "turn-1",
        plan: [
          { step: "Inspect Codex protocol", status: "completed" },
          { step: "Patch gaps", status: "inProgress" },
        ],
      },
      state,
    );

    expect(started).toEqual([
      {
        type: "item.started",
        threadId: "t-codex",
        itemId: expect.stringMatching(/^plan-/u),
        itemType: "plan",
        payload: {
          steps: [
            { step: "Inspect Codex protocol", status: "completed" },
            { step: "Patch gaps", status: "in_progress" },
          ],
        },
      },
    ]);

    const planItemId = started[0]?.type === "item.started" ? started[0].itemId : "";
    const updated = mapCodexNotification(
      "turn/plan/updated",
      {
        threadId: "x",
        turnId: "turn-1",
        plan: [
          { step: "Inspect Codex protocol", status: "completed" },
          { step: "Patch gaps", status: "completed" },
        ],
      },
      state,
    );

    expect(updated).toEqual([
      {
        type: "item.updated",
        threadId: "t-codex",
        itemId: planItemId,
        payload: {
          steps: [
            { step: "Inspect Codex protocol", status: "completed" },
            { step: "Patch gaps", status: "completed" },
          ],
        },
      },
    ]);

    expect(mapCodexNotification("turn/completed", { threadId: "x" }, state)).toEqual([
      { type: "item.completed", threadId: "t-codex", itemId: planItemId },
      { type: "turn.completed", threadId: "t-codex", turnId: "turn-1", state: "completed" },
    ]);
  });
});

describe("mapCodexNotification — item lifecycle (item/started, item/completed)", () => {
  it("ignores Codex user_message item/started (user bubble comes from CodexStructuredSession.startTurn)", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "u-1",
        item: { id: "u-1", type: "userMessage", text: "hello" },
      },
      state,
    );
    expect(events).toEqual([]);
    expect(state.itemIdMap.size).toBe(0);
  });

  it("opens an assistant item on item/started with type=agentMessage", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "item/started",
      { threadId: "x", itemId: "msg-1", item: { id: "msg-1", type: "agentMessage" } },
      state,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("item.started");
    expect((events[0] as { itemType: string }).itemType).toBe("assistant_message");
    expect(state.openAssistantItemId).toBeDefined();
  });

  it("classifies known kinds correctly via toCanonicalItemType", () => {
    const state = createCodexMapperState("t-codex");
    const exec = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "i-1",
        item: { id: "i-1", type: "commandExecution", command: "ls" },
      },
      state,
    );
    expect((exec[0] as { itemType: string }).itemType).toBe("command_execution");

    const patch = mapCodexNotification(
      "item/started",
      { threadId: "x", itemId: "i-2", item: { id: "i-2", type: "fileChange", path: "src/foo.ts" } },
      state,
    );
    expect((patch[0] as { itemType: string }).itemType).toBe("file_change");

    const search = mapCodexNotification(
      "item/started",
      { threadId: "x", itemId: "i-3", item: { id: "i-3", type: "webSearch", query: "tokio" } },
      state,
    );
    expect((search[0] as { itemType: string }).itemType).toBe("web_search");

    const reasoning = mapCodexNotification(
      "item/started",
      { threadId: "x", itemId: "i-4", item: { id: "i-4", type: "reasoning" } },
      state,
    );
    expect((reasoning[0] as { itemType: string }).itemType).toBe("reasoning");
  });

  it("extracts web_search query and args from Codex response action", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "ws-action",
        item: {
          id: "ws-action",
          type: "web_search_call",
          status: "in_progress",
          action: {
            type: "search",
            query: "Electron crash reporting Sentry Electron SDK native crashes official",
            queries: [
              "Electron crash reporting Sentry Electron SDK native crashes official",
              "Bugsnag Electron SDK crash reporting official docs pricing free",
            ],
          },
        },
      },
      state,
    );

    expect((events[0] as { itemType: string }).itemType).toBe("web_search");
    expect((events[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
      query: "Electron crash reporting Sentry Electron SDK native crashes official",
      args: {
        type: "search",
        query: "Electron crash reporting Sentry Electron SDK native crashes official",
        queries: [
          "Electron crash reporting Sentry Electron SDK native crashes official",
          "Bugsnag Electron SDK crash reporting official docs pricing free",
        ],
      },
      status: "running",
    });
  });

  it("uses Codex open_page action URL as the web_search query label", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "ws-open-page",
        item: {
          id: "ws-open-page",
          type: "webSearch",
          action: {
            type: "open_page",
            url: "https://github.com/getsentry/sentry-electron",
          },
        },
      },
      state,
    );

    expect((events[0] as { payload: Record<string, unknown> }).payload.query).toBe(
      "https://github.com/getsentry/sentry-electron",
    );
  });

  it("captures MCP tool args at start and result at completion (parity with ACP)", () => {
    const state = createCodexMapperState("t-codex");
    const started = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "tool-1",
        item: {
          id: "tool-1",
          type: "mcp",
          title: "github-search",
          input: { query: "tokio", page: 1 },
        },
      },
      state,
    );
    expect((started[0] as { itemType: string }).itemType).toBe("mcp_tool_call");
    const startedPayload = (started[0] as { payload: Record<string, unknown> }).payload;
    expect(startedPayload).toMatchObject({
      name: "github-search",
      args: { query: "tokio", page: 1 },
      status: "running",
    });

    const completed = mapCodexNotification(
      "item/completed",
      {
        threadId: "x",
        itemId: "tool-1",
        item: { id: "tool-1", status: "completed", output: { hits: 3 } },
      },
      state,
    );
    const completedPayload = (completed.at(-1) as { payload: Record<string, unknown> }).payload;
    expect(completedPayload).toMatchObject({ status: "success", result: { hits: 3 } });
  });

  it("normalizes Codex mcpToolCall items for MCP display", () => {
    const state = createCodexMapperState("t-codex");
    const started = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "mcp-tool-1",
        item: {
          id: "mcp-tool-1",
          type: "mcpToolCall",
          server: "browser",
          tool: "console_logs",
          arguments: { limit: 10 },
        },
      },
      state,
    );

    expect((started[0] as { itemType: string }).itemType).toBe("mcp_tool_call");
    expect((started[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
      name: "mcp__browser__console_logs",
      serverId: "browser",
      args: { limit: 10 },
      status: "running",
    });

    const completed = mapCodexNotification(
      "item/completed",
      {
        threadId: "x",
        itemId: "mcp-tool-1",
        item: {
          id: "mcp-tool-1",
          type: "mcpToolCall",
          status: "completed",
          result: {
            content: [{ type: "text", text: '{"count":1}' }],
            structuredContent: null,
            _meta: null,
          },
        },
      },
      state,
    );

    expect((completed.at(-1) as { payload: Record<string, unknown> }).payload).toMatchObject({
      status: "success",
      result: {
        content: [{ type: "text", text: '{"count":1}' }],
        structuredContent: null,
        _meta: null,
      },
    });
  });

  it("preserves Codex skill-file reads and codex_apps MCP names for usage capture", () => {
    const state = createCodexMapperState("t-codex");
    const skill = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "skill-read-1",
        item: {
          id: "skill-read-1",
          type: "dynamicToolCall",
          title: "Read",
          input: {
            file_path: String.raw`C:\Users\sdsle\.codex\skills\.system\imagegen\SKILL.md`,
          },
        },
      },
      state,
    );

    expect((skill[0] as { itemType: string }).itemType).toBe("dynamic_tool_call");
    expect((skill[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
      name: "Read",
      args: {
        file_path: String.raw`C:\Users\sdsle\.codex\skills\.system\imagegen\SKILL.md`,
      },
      status: "running",
    });

    const mcp = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "codex-app-1",
        item: {
          id: "codex-app-1",
          type: "mcpToolCall",
          server: "codex_apps",
          tool: "target_search",
          arguments: { query: "desk lamp" },
        },
      },
      state,
    );

    expect((mcp[0] as { itemType: string }).itemType).toBe("mcp_tool_call");
    expect((mcp[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
      name: "mcp__codex_apps__target_search",
      serverId: "codex_apps",
      args: { query: "desk lamp" },
      status: "running",
    });
  });

  it("unwraps Codex Apps MCP calls to the inner app", () => {
    const state = createCodexMapperState("t-codex");
    const started = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "codex-app-github-1",
        item: {
          id: "codex-app-github-1",
          type: "mcpToolCall",
          server: "codex_apps",
          tool: "github.fetch_pr",
          arguments: { repo_full_name: "poracode/poracode", pr_number: 264 },
        },
      },
      state,
    );

    expect((started[0] as { itemType: string }).itemType).toBe("mcp_tool_call");
    expect((started[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
      name: "mcp__github__fetch_pr",
      serverId: "github",
      args: { repo_full_name: "poracode/poracode", pr_number: 264 },
      status: "running",
    });
  });

  it("maps Codex spawnAgent items as subagent tool calls", () => {
    const state = createCodexMapperState("t-codex");
    const started = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "collab-1",
        item: {
          id: "collab-1",
          type: "collabAgentToolCall",
          tool: "spawn_agent",
          status: "in_progress",
          senderThreadId: "parent-thread",
          receiverThreadIds: ["child-thread"],
          prompt: "inspect one thing",
          model: "gpt-5.3-codex",
          reasoningEffort: "high",
          agentsStates: {
            "child-thread": { status: "pending_init", message: null },
          },
        },
      },
      state,
    );

    expect((started[0] as { itemType: string }).itemType).toBe("tool_call");
    expect((started[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
      name: "spawn_agent",
      isSubAgent: true,
      args: {
        description: "inspect one thing",
        prompt: "inspect one thing",
        senderThreadId: "parent-thread",
        receiverThreadIds: ["child-thread"],
        model: "gpt-5.3-codex",
        reasoningEffort: "high",
      },
      progress: {
        description: "inspect one thing",
        model: "gpt-5.3-codex",
        effort: "high",
        stepCount: 1,
      },
      status: "running",
    });

    const completed = mapCodexNotification(
      "item/completed",
      {
        threadId: "x",
        itemId: "collab-1",
        item: {
          id: "collab-1",
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          status: "completed",
          agentsStates: {
            "child-thread": { status: "completed", message: "done" },
          },
        },
      },
      state,
    );

    expect((completed.at(-1) as { payload: Record<string, unknown> }).payload).toMatchObject({
      status: "success",
      result: "done",
      progress: {
        description: "done",
        stepCount: 1,
      },
    });
  });

  it("keeps Codex coordination calls out of the subagent classification", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "item/completed",
      {
        threadId: "x",
        item: {
          id: "wait-1",
          type: "collabAgentToolCall",
          tool: "wait",
          status: "completed",
          senderThreadId: "parent-thread",
          receiverThreadIds: [],
          prompt: null,
          model: null,
          reasoningEffort: null,
          agentsStates: {},
        },
      },
      state,
    );

    expect(events[0]).toMatchObject({
      type: "item.started",
      itemType: "tool_call",
      payload: { name: "wait", status: "running" },
    });
    expect((events[0] as { payload: Record<string, unknown> }).payload).not.toHaveProperty(
      "isSubAgent",
    );
    expect(events.at(-1)).toMatchObject({
      type: "item.completed",
      payload: { status: "success" },
    });
    expect((events.at(-1) as { payload: Record<string, unknown> }).payload).not.toHaveProperty(
      "result",
    );
  });

  it("renders the final exitedReviewMode report as an assistant message", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "item/completed",
      {
        threadId: "x",
        item: {
          id: "review-1",
          type: "exitedReviewMode",
          review: "Looks solid overall.\n\n- Fix one edge case.",
        },
      },
      state,
    );

    expect(events).toEqual([
      expect.objectContaining({
        type: "item.started",
        itemType: "assistant_message",
        payload: {
          content: [{ kind: "text", text: "Looks solid overall.\n\n- Fix one edge case." }],
        },
      }),
      expect.objectContaining({
        type: "content.delta",
        stream: "assistant_text",
        delta: "Looks solid overall.\n\n- Fix one edge case.",
      }),
      expect.objectContaining({ type: "item.completed" }),
    ]);
  });

  it("preserves Codex dynamic and image tool item types", () => {
    const state = createCodexMapperState("t-codex");
    const dynamic = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "dynamic-1",
        item: { id: "dynamic-1", type: "dynamicToolCall", title: "custom-tool" },
      },
      state,
    );
    const image = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "image-1",
        item: { id: "image-1", type: "imageView", title: "preview" },
      },
      state,
    );

    expect((dynamic[0] as { itemType: string }).itemType).toBe("dynamic_tool_call");
    expect((image[0] as { itemType: string }).itemType).toBe("image_view");
  });

  it("maps Codex imageView paths into the shared inline image payload", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-codex-image-view-"));
    const imagePath = join(dir, "preview.png");
    const imageBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    writeFileSync(imagePath, Buffer.from(imageBase64, "base64"));
    try {
      const state = createCodexMapperState("t-codex");
      const item = { id: "image-1", type: "imageView", path: imagePath };
      const started = mapCodexNotification(
        "item/started",
        { threadId: "x", itemId: item.id, item },
        state,
      );
      const completed = mapCodexNotification(
        "item/completed",
        { threadId: "x", itemId: item.id, item },
        state,
      );

      expect(started[0]).toMatchObject({
        type: "item.started",
        itemType: "image_view",
        payload: { name: "imageView", args: { path: imagePath }, status: "running" },
      });
      expect(completed).toEqual([
        expect.objectContaining({
          type: "item.completed",
          payload: {
            status: "success",
            images: [`data:image/png;base64,${imageBase64}`],
          },
        }),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("classifies file_change kind from item.changeKind / kind / type", () => {
    const state = createCodexMapperState("t-codex");
    const create = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "fc-1",
        item: { id: "fc-1", type: "fileChange", path: "src/foo.ts", changeKind: "create" },
      },
      state,
    );
    expect((create[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
      path: "src/foo.ts",
      changeKind: "create",
    });

    const del = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "fc-2",
        item: { id: "fc-2", type: "fileChange", path: "old.ts", kind: "delete" },
      },
      state,
    );
    expect((del[0] as { payload: Record<string, unknown> }).payload.changeKind).toBe("delete");

    const edit = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "fc-3",
        item: { id: "fc-3", type: "fileChange", path: "x.ts" },
      },
      state,
    );
    expect((edit[0] as { payload: Record<string, unknown> }).payload.changeKind).toBe("edit");
  });

  it("extracts file_change path from apply_patch text args", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "fc-patch",
        item: {
          id: "fc-patch",
          type: "fileChange",
          args: "*** Begin Patch\n*** Update File: src/foo.ts\n@@\n-old\n+new\n*** End Patch",
        },
      },
      state,
    );
    expect((events[0] as { payload: Record<string, unknown> }).payload.path).toBe("src/foo.ts");
  });

  it("extracts file_change path from edit tool file_path args", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "fc-edit",
        item: {
          id: "fc-edit",
          type: "fileChange",
          args: { file_path: "src/supervisor/agents/codex/canonicalMapping.ts" },
        },
      },
      state,
    );
    expect((events[0] as { payload: Record<string, unknown> }).payload.path).toBe(
      "src/supervisor/agents/codex/canonicalMapping.ts",
    );
  });

  it("counts create content args as file_change diff summary", () => {
    const state = createCodexMapperState("t-codex");
    const args = {
      path: "src/new-file.ts",
      content: "export const value = 1;\nexport const other = 2;\n",
    };
    const events = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "fc-create",
        item: {
          id: "fc-create",
          type: "fileChange",
          changeKind: "create",
          args,
        },
      },
      state,
    );

    expect((events[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
      path: "src/new-file.ts",
      changeKind: "create",
      diffSummary: { added: 2, removed: 0 },
      args,
    });
  });

  it("extracts file_change metadata from real Codex app-server changes arrays", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "fc-changes",
        item: {
          id: "fc-changes",
          type: "fileChange",
          changes: [
            {
              path: "/tmp/poracode-codex-probe/probe.txt",
              kind: { type: "update", move_path: null },
              diff: "@@ -1 +1 @@\n-before\n+after\n",
            },
          ],
          status: "inProgress",
        },
      },
      state,
    );

    expect((events[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
      path: "/tmp/poracode-codex-probe/probe.txt",
      changeKind: "edit",
      diffSummary: { added: 1, removed: 1 },
      args: {
        changes: [
          {
            path: "/tmp/poracode-codex-probe/probe.txt",
            kind: { type: "update", move_path: null },
            diff: "@@ -1 +1 @@\n-before\n+after\n",
          },
        ],
      },
    });
  });

  it("extracts file_change path from Codex title/name fallbacks", () => {
    const state = createCodexMapperState("t-codex");
    const titleEvents = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "fc-title",
        item: {
          id: "fc-title",
          type: "fileChange",
          title: "src/renderer/App.tsx: render => render",
        },
      },
      state,
    );
    expect((titleEvents[0] as { payload: Record<string, unknown> }).payload.path).toBe(
      "src/renderer/App.tsx",
    );

    const nameEvents = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "fc-name",
        item: {
          id: "fc-name",
          type: "fileChange",
          name: "Writing to src/supervisor/agents/codex/canonicalMapping.ts",
        },
      },
      state,
    );
    expect((nameEvents[0] as { payload: Record<string, unknown> }).payload.path).toBe(
      "src/supervisor/agents/codex/canonicalMapping.ts",
    );
  });

  it("updates file_change path from streamed output", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification(
      "item/started",
      { threadId: "x", itemId: "fc-output", item: { id: "fc-output", type: "fileChange" } },
      state,
    );

    const events = mapCodexNotification(
      "item/fileChange/outputDelta",
      {
        threadId: "x",
        itemId: "fc-output",
        delta:
          "Success. Updated the following files:\nM\nC:\\Users\\sdsle\\work\\poracode\\src\\foo.ts",
      },
      state,
    );

    expect(events[0]).toMatchObject({
      type: "item.updated",
      payload: { path: "C:\\Users\\sdsle\\work\\poracode\\src\\foo.ts" },
    });
    expect(events[1]).toMatchObject({
      type: "content.delta",
      stream: "file_change_output",
    });
  });

  it("captures web_search resultCount + name on completion", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "ws-1",
        item: { id: "ws-1", type: "webSearch", query: "rust async", title: "browser_search" },
      },
      state,
    );
    const completed = mapCodexNotification(
      "item/completed",
      {
        threadId: "x",
        itemId: "ws-1",
        item: {
          id: "ws-1",
          status: "completed",
          action: { type: "open_page", url: "https://docs.sentry.io/" },
          results: [{ url: "a" }, { url: "b" }],
        },
      },
      state,
    );
    const payload = (completed.at(-1) as { payload: Record<string, unknown> }).payload;
    expect(payload).toMatchObject({
      query: "https://docs.sentry.io/",
      status: "success",
      resultCount: 2,
    });
  });

  it("emits item.completed with status / exitCode / durationMs for commandExecution", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "cmd-1",
        item: { id: "cmd-1", type: "commandExecution", command: "echo" },
      },
      state,
    );
    const events = mapCodexNotification(
      "item/completed",
      {
        threadId: "x",
        itemId: "cmd-1",
        item: { id: "cmd-1", status: "completed", exitCode: 0, durationMs: 42 },
      },
      state,
    );
    expect(events.at(-1)?.type).toBe("item.completed");
    expect((events.at(-1) as { payload: Record<string, unknown> }).payload).toMatchObject({
      status: "success",
      exitCode: 0,
      durationMs: 42,
    });
  });

  it("emits completed command aggregatedOutput when no output delta was observed", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "cmd-agg",
        item: { id: "cmd-agg", type: "commandExecution", command: "pwd" },
      },
      state,
    );

    const events = mapCodexNotification(
      "item/completed",
      {
        threadId: "x",
        itemId: "cmd-agg",
        item: {
          id: "cmd-agg",
          type: "commandExecution",
          status: "completed",
          aggregatedOutput: "/tmp/project\n",
          exitCode: 0,
        },
      },
      state,
    );

    expect(events.map((event) => event.type)).toEqual(["content.delta", "item.completed"]);
    expect(events[0]).toMatchObject({
      type: "content.delta",
      stream: "command_output",
      delta: "/tmp/project\n",
    });
  });

  it("does not duplicate completed command aggregatedOutput after output deltas", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "cmd-streamed",
        item: { id: "cmd-streamed", type: "commandExecution", command: "pwd" },
      },
      state,
    );
    mapCodexNotification(
      "item/commandExecution/outputDelta",
      {
        threadId: "x",
        itemId: "cmd-streamed",
        delta: "/tmp/project\n",
      },
      state,
    );

    const events = mapCodexNotification(
      "item/completed",
      {
        threadId: "x",
        itemId: "cmd-streamed",
        item: {
          id: "cmd-streamed",
          type: "commandExecution",
          status: "completed",
          aggregatedOutput: "/tmp/project\n",
          exitCode: 0,
        },
      },
      state,
    );

    expect(events.map((event) => event.type)).toEqual(["item.completed"]);
  });

  it("keeps a running command attached to its original item after the turn completes", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification("turn/started", { threadId: "x", turnId: "turn-1" }, state);
    const started = mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "cmd-running",
        item: { id: "cmd-running", type: "commandExecution", command: "pnpm run dev" },
      },
      state,
    );
    const commandItemId = started[0]?.type === "item.started" ? started[0].itemId : "";
    mapCodexNotification(
      "item/commandExecution/outputDelta",
      { threadId: "x", itemId: "cmd-running", delta: "[app] booting\n" },
      state,
    );

    expect(mapCodexNotification("turn/completed", { threadId: "x" }, state)).toEqual([
      {
        type: "turn.completed",
        threadId: "t-codex",
        turnId: "turn-1",
        state: "completed",
      },
    ]);
    expect(state.commandOutputSeenSet.has("cmd-running")).toBe(true);

    expect(
      mapCodexNotification(
        "item/commandExecution/outputDelta",
        { threadId: "x", itemId: "cmd-running", delta: "[app] ready\n" },
        state,
      ),
    ).toEqual([
      {
        type: "content.delta",
        threadId: "t-codex",
        itemId: commandItemId,
        stream: "command_output",
        delta: "[app] ready\n",
      },
    ]);

    expect(
      mapCodexNotification(
        "item/completed",
        {
          threadId: "x",
          itemId: "cmd-running",
          item: {
            id: "cmd-running",
            type: "commandExecution",
            status: "completed",
            aggregatedOutput: "[app] booting\n[app] ready\n",
            exitCode: 0,
          },
        },
        state,
      ),
    ).toEqual([
      {
        type: "item.completed",
        threadId: "t-codex",
        itemId: commandItemId,
        payload: { status: "success", exitCode: 0 },
      },
    ]);
    expect(state.itemIdMap.has("cmd-running")).toBe(false);
  });

  it("synthesises started+completed when only item/completed is observed", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "item/completed",
      {
        threadId: "x",
        itemId: "msg-1",
        item: { id: "msg-1", type: "agentMessage", text: "hello" },
      },
      state,
    );
    expect(events.map((e) => e.type)).toEqual(["item.started", "content.delta", "item.completed"]);
  });
});

describe("mapCodexNotification — streaming deltas", () => {
  it("routes item/agentMessage/delta to the assistant_text stream", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification(
      "item/started",
      { threadId: "x", itemId: "msg-1", item: { id: "msg-1", type: "agentMessage" } },
      state,
    );
    const events = mapCodexNotification(
      "item/agentMessage/delta",
      { threadId: "x", itemId: "msg-1", delta: "Hello" },
      state,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "content.delta",
      stream: "assistant_text",
      delta: "Hello",
    });
  });

  it("routes item/commandExecution/outputDelta to the command_output stream", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "cmd-1",
        item: { id: "cmd-1", type: "commandExecution", command: "ls" },
      },
      state,
    );
    const events = mapCodexNotification(
      "item/commandExecution/outputDelta",
      { threadId: "x", itemId: "cmd-1", delta: "file.txt\n" },
      state,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "content.delta",
      stream: "command_output",
      delta: "file.txt\n",
    });
  });

  it("routes item/reasoning/textDelta and summaryTextDelta to reasoning_text", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification(
      "item/started",
      { threadId: "x", itemId: "rs-1", item: { id: "rs-1", type: "reasoning" } },
      state,
    );
    const text = mapCodexNotification(
      "item/reasoning/textDelta",
      { threadId: "x", itemId: "rs-1", delta: "thinking" },
      state,
    );
    expect(text[0]).toMatchObject({ type: "content.delta", stream: "reasoning_text" });
    const summary = mapCodexNotification(
      "item/reasoning/summaryTextDelta",
      { threadId: "x", itemId: "rs-1", delta: "summary", summaryIndex: 0 },
      state,
    );
    expect(summary[0]).toMatchObject({ type: "content.delta", stream: "reasoning_text" });
  });

  it("preserves boundaries between indexed reasoning summary parts", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification(
      "item/started",
      { threadId: "x", itemId: "rs-1", item: { id: "rs-1", type: "reasoning" } },
      state,
    );

    const events = [
      ...mapCodexNotification(
        "item/reasoning/summaryTextDelta",
        { threadId: "x", itemId: "rs-1", delta: "**Planning sidebar**", summaryIndex: 0 },
        state,
      ),
      ...mapCodexNotification(
        "item/reasoning/summaryTextDelta",
        { threadId: "x", itemId: "rs-1", delta: "**Refining", summaryIndex: 1 },
        state,
      ),
      ...mapCodexNotification(
        "item/reasoning/summaryTextDelta",
        { threadId: "x", itemId: "rs-1", delta: " removal**", summaryIndex: 1 },
        state,
      ),
    ];

    expect(
      events.flatMap((event) => (event.type === "content.delta" ? [event.delta] : [])).join(""),
    ).toBe("**Planning sidebar**\n\n**Refining removal**");
  });

  it("maps MCP tool progress into the existing tool payload", () => {
    const state = createCodexMapperState("t-codex");
    mapCodexNotification(
      "item/started",
      {
        threadId: "x",
        itemId: "mcp-1",
        item: { id: "mcp-1", type: "mcpToolCall", title: "github-search" },
      },
      state,
    );

    const events = mapCodexNotification(
      "item/mcpToolCall/progress",
      { threadId: "x", itemId: "mcp-1", message: "Searching repositories" },
      state,
    );

    expect(events).toEqual([
      {
        type: "item.updated",
        threadId: "t-codex",
        itemId: expect.stringMatching(/^mcp_tool_call-/u),
        payload: {
          status: "running",
          progress: { summary: "Searching repositories" },
        },
      },
    ]);
  });

  it("maps Codex error and serverRequest/resolved notifications", () => {
    const state = createCodexMapperState("t-codex");

    expect(
      mapCodexNotification(
        "error",
        { threadId: "x", turnId: "turn-1", error: { message: "Tool failed" }, willRetry: false },
        state,
      ),
    ).toEqual([{ type: "error", threadId: "t-codex", message: "Tool failed" }]);
    expect(
      mapCodexNotification(
        "error",
        {
          threadId: "x",
          turnId: "turn-1",
          error: { message: "Stream disconnected" },
          willRetry: true,
        },
        state,
      ),
    ).toEqual([{ type: "warning", threadId: "t-codex", message: "Stream disconnected" }]);
    expect(
      mapCodexNotification("serverRequest/resolved", { threadId: "x", requestId: 42 }, state),
    ).toEqual([
      { type: "request.resolved", threadId: "t-codex", requestId: "42", outcome: "answered" },
    ]);
  });

  it("auto-opens an item when delta arrives before item/started", () => {
    const state = createCodexMapperState("t-codex");
    const events = mapCodexNotification(
      "item/agentMessage/delta",
      { threadId: "x", itemId: "msg-2", delta: "boom" },
      state,
    );
    expect(events.map((e) => e.type)).toEqual(["item.started", "content.delta"]);
  });

  it("returns [] for unknown methods", () => {
    const state = createCodexMapperState("t-codex");
    expect(mapCodexNotification("totally/unknown", {}, state)).toEqual([]);
  });

  it("maps legacy execCommandApproval requests", () => {
    const event = mapCodexServerRequest("thread-1", "exec-1", "execCommandApproval", {
      command: ["pnpm", "test"],
      cwd: "C:\\repo",
      reason: "Command needs approval",
    });

    expect(event).toMatchObject({
      type: "request.opened",
      threadId: "thread-1",
      requestId: "exec-1",
      requestType: "command_execution_approval",
      payload: {
        summary: "Command needs approval",
        details: {
          toolName: "command_execution",
          displayName: "Run",
          input: { command: "pnpm test", cwd: "C:\\repo" },
        },
      },
    });
  });

  it("maps legacy file-read approval requests", () => {
    const event = mapCodexServerRequest("thread-1", "read-1", "item/fileRead/requestApproval", {
      path: "src/index.ts",
      reason: "Read outside workspace",
    });

    expect(event).toMatchObject({
      type: "request.opened",
      threadId: "thread-1",
      requestId: "read-1",
      requestType: "file_read_approval",
      payload: {
        summary: "Read outside workspace",
        details: {
          toolName: "file_read",
          displayName: "Read file",
          input: { path: "src/index.ts" },
        },
      },
    });
  });
});

describe("mapCodexServerRequest — approvals", () => {
  it("maps command execution approvals to structured permission details", () => {
    const event = mapCodexServerRequest("thread-1", "0", "item/commandExecution/requestApproval", {
      command: "pnpm test",
      cwd: "C:\\repo",
      reason: "Command needs approval",
      availableDecisions: ["accept", "acceptForSession", "decline", "cancel"],
    });

    expect(event).toEqual({
      type: "request.opened",
      threadId: "thread-1",
      requestId: "0",
      requestType: "command_execution_approval",
      payload: {
        summary: "Command needs approval",
        details: {
          toolName: "command_execution",
          displayName: "Run",
          input: {
            command: "pnpm test",
            cwd: "C:\\repo",
          },
        },
        options: [
          { optionId: "accept", label: "Allow" },
          { optionId: "acceptForSession", label: "Allow always" },
          { optionId: "decline", label: "Deny" },
        ],
      },
    });
  });

  it("skips structured command approval decisions when building options", () => {
    const event = mapCodexServerRequest("thread-1", "0", "item/commandExecution/requestApproval", {
      command: "pnpm test",
      availableDecisions: [
        "accept",
        { acceptWithExecpolicyAmendment: { execpolicy_amendment: {} } },
        { applyNetworkPolicyAmendment: { network_policy_amendment: {} } },
        "decline",
      ],
    });

    expect(event).toMatchObject({
      type: "request.opened",
      payload: {
        options: [
          { optionId: "accept", label: "Allow" },
          { optionId: "decline", label: "Deny" },
        ],
      },
    });
  });

  it("offers and translates session approval for file edits", () => {
    const event = mapCodexServerRequest("thread-1", "edit-1", "item/fileChange/requestApproval", {
      reason: "File changes need approval",
      command: "edit src/foo.ts",
    });

    expect(event).toMatchObject({
      type: "request.opened",
      threadId: "thread-1",
      requestId: "edit-1",
      requestType: "file_change_approval",
      payload: {
        summary: "File changes need approval",
        options: [
          { optionId: "accept", label: "Allow" },
          { optionId: "acceptForSession", label: "Allow always" },
          { optionId: "decline", label: "Deny" },
        ],
      },
    });

    expect(
      translateCodexCanonicalResponse(
        "item/fileChange/requestApproval",
        {},
        { optionId: "acceptForSession" },
      ),
    ).toEqual({ decision: "acceptForSession" });
  });

  it("lets users deny requested permission profiles", () => {
    const permissions = { network: { enabled: true }, fileSystem: null };
    const event = mapCodexServerRequest(
      "thread-1",
      "permissions-1",
      "item/permissions/requestApproval",
      { reason: "Network access", permissions },
    );

    expect(event).toMatchObject({
      payload: {
        options: [
          { optionId: "turn", label: "Allow this turn" },
          { optionId: "session", label: "Allow for session" },
          { optionId: "deny", label: "Deny" },
        ],
      },
    });
    expect(
      translateCodexCanonicalResponse(
        "item/permissions/requestApproval",
        { permissions },
        { optionId: "deny" },
      ),
    ).toEqual({ permissions: {}, scope: "turn" });
  });
});

describe("mapCodexServerRequest — user input", () => {
  it("carries multi-question requestUserInput payloads as structured form details", () => {
    const event = mapCodexServerRequest("thread-1", "req-1", "item/tool/requestUserInput", {
      threadId: "provider-thread",
      turnId: "turn-1",
      itemId: "item-1",
      autoResolutionMs: null,
      questions: [
        {
          id: "scope",
          header: "Scope",
          question: "Which scope?",
          isOther: false,
          isSecret: false,
          options: [{ label: "Scope A", description: "Minimal" }],
        },
        {
          id: "validation",
          header: "Validation",
          question: "Which validation?",
          isOther: false,
          isSecret: false,
          options: [{ label: "After each phase", description: "Incremental" }],
        },
      ],
    });

    expect(event).toMatchObject({
      type: "request.opened",
      threadId: "thread-1",
      requestId: "req-1",
      requestType: "tool_user_input",
      payload: {
        details: {
          codexUserInput: {
            questions: [
              {
                id: "scope",
                header: "Scope",
                question: "Which scope?",
                options: [
                  {
                    optionId: "Scope A",
                    label: "Scope A",
                    description: "Minimal",
                  },
                ],
              },
              {
                id: "validation",
                header: "Validation",
                question: "Which validation?",
                options: [
                  {
                    optionId: "After each phase",
                    label: "After each phase",
                    description: "Incremental",
                  },
                ],
              },
            ],
          },
        },
      },
    });
    if (event?.type !== "request.opened") throw new Error("unexpected event");
    expect(event.payload.options).toBeUndefined();
  });

  it("passes requestUserInput responses through in Codex-native shape", () => {
    const response = {
      answers: {
        scope: { answers: ["Scope A"] },
        validation: { answers: ["After each phase"] },
      },
    };

    expect(
      translateCodexCanonicalResponse("item/tool/requestUserInput", { questions: [] }, response),
    ).toBe(response);
  });
});
