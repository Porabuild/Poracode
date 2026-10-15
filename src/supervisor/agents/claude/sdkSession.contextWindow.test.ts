import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { awaitProcessTermination } from "@/shared/awaitProcessTermination";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SDKControlGetContextUsageResponse,
  SDKMessage,
  SpawnedProcess,
  query,
} from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, ThreadConfig } from "@/shared/contracts";
import { ClaudeSdkSession } from "./sdkSession";
import {
  assistantMessage,
  createClaudeTestQuery,
  flushSdkMessages,
  resultMessage,
} from "./sdkSessionTestHarness";

vi.mock("@/shared/awaitProcessTermination", () => ({
  awaitProcessTermination: vi.fn<typeof awaitProcessTermination>().mockResolvedValue(undefined),
}));

const sdk = vi.hoisted(() => ({ query: vi.fn<typeof query>() }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: sdk.query }));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => "/mock/claude" }));

const config: ThreadConfig = { model: "claude-fable-5-1", contextSize: "1m" };

async function createSession(initialConfig = config) {
  return ClaudeSdkSession.create({
    threadId: "claude-context-window",
    projectLocation: { kind: "posix", path: "/tmp/claude-context-window" },
    config: initialConfig,
    presentationMode: "gui",
  });
}

function contextResponse(maxTokens: number): SDKControlGetContextUsageResponse {
  return {
    categories: [],
    totalTokens: 0,
    maxTokens,
    rawMaxTokens: maxTokens,
    percentage: 0,
    gridRows: [],
    model: config.model,
    memoryFiles: [],
    mcpTools: [],
    isAutoCompactEnabled: true,
    agents: [],
    apiUsage: null,
  };
}

beforeEach(() => {
  sdk.query.mockReset();
  vi.mocked(awaitProcessTermination).mockReset().mockResolvedValue(undefined);
});

describe("Claude SDK working-window selection", () => {
  it("waits for query cleanup and owned descendant termination before launching the replacement", async () => {
    const original = createClaudeTestQuery();
    const replacement = createClaudeTestQuery();
    const drained = Promise.withResolvers<IteratorResult<SDKMessage, void>>();
    const terminated = Promise.withResolvers<void>();
    original.return.mockReturnValue(drained.promise);
    vi.mocked(awaitProcessTermination).mockReturnValue(terminated.promise);
    sdk.query.mockReturnValueOnce(original.runtime).mockReturnValueOnce(replacement.runtime);
    const session = await createSession();
    await session.openThread(config);
    const child = Object.assign(new EventEmitter(), {
      pid: 1234,
      exitCode: null,
      signalCode: null,
    }) as unknown as ChildProcess;
    const internal = session as unknown as {
      spawnTrackedProcess(spawn: () => SpawnedProcess, ownedProcessGroup: boolean): SpawnedProcess;
    };
    internal.spawnTrackedProcess(() => child as unknown as SpawnedProcess, true);
    const pending = session.startTurn("Resize", { ...config, contextSize: "400k" });
    await flushSdkMessages();
    expect(original.return).toHaveBeenCalledOnce();
    expect(awaitProcessTermination).not.toHaveBeenCalled();
    expect(sdk.query).toHaveBeenCalledTimes(1);
    drained.resolve({ done: true, value: undefined });
    await flushSdkMessages();
    expect(awaitProcessTermination).toHaveBeenCalledWith(child, { ownedProcessGroup: true });
    expect(sdk.query).toHaveBeenCalledTimes(1);
    terminated.resolve();
    await pending;
    expect(sdk.query).toHaveBeenCalledTimes(2);
    await session.dispose();
  });

  it("retains failed process custody and refuses to launch a competing replacement", async () => {
    const original = createClaudeTestQuery();
    sdk.query.mockReturnValue(original.runtime);
    const session = await createSession();
    await session.openThread(config);
    const child = Object.assign(new EventEmitter(), {
      pid: 1234,
      exitCode: null,
      signalCode: null,
    }) as unknown as ChildProcess;
    const internal = session as unknown as {
      spawnedProcesses: Set<ChildProcess>;
      spawnTrackedProcess(spawn: () => SpawnedProcess, ownedProcessGroup: boolean): SpawnedProcess;
    };
    internal.spawnTrackedProcess(() => child as unknown as SpawnedProcess, true);
    vi.mocked(awaitProcessTermination).mockRejectedValueOnce(new Error("Still alive"));
    await expect(session.startTurn("Resize", { ...config, contextSize: "400k" })).rejects.toThrow(
      "Still alive",
    );
    expect(sdk.query).toHaveBeenCalledTimes(1);
    expect(internal.spawnedProcesses.has(child)).toBe(true);
    await session.dispose();
    expect(awaitProcessTermination).toHaveBeenCalledTimes(2);
  });

  it("does not resume a cancelled first prompt that the SDK never consumed", async () => {
    const original = createClaudeTestQuery();
    const replacement = createClaudeTestQuery();
    sdk.query.mockReturnValueOnce(original.runtime).mockReturnValueOnce(replacement.runtime);
    const session = await createSession();
    const events: RuntimeEvent[] = [];
    session.setListener({
      onRuntimeEvent: (event) => events.push(event),
      onUpdate: () => {},
      onClose: () => {},
      onError: () => {},
    });
    const sessionId = await session.openThread(config);
    await session.startTurn("Unread first prompt", config);
    await session.interruptTurn();
    session.forceCompleteTurn();
    await session.startTurn("Replacement", { ...config, contextSize: "400k" });
    expect(sdk.query.mock.calls[1]?.[0].options).toMatchObject({ sessionId });
    expect(sdk.query.mock.calls[1]?.[0].options).not.toHaveProperty("resume");
    await session.steerTurn("Follow-up", { ...config, contextSize: "400k" });
    replacement.output.write(assistantMessage(sessionId, "replacement-reply"));
    replacement.output.write(resultMessage(sessionId));
    await flushSdkMessages();
    expect(events.filter((event) => event.type === "turn.completed").at(-1)?.state).toBe(
      "completed",
    );
    expect(events.filter((event) => event.type === "turn.started")).toHaveLength(3);
    replacement.output.write(assistantMessage(sessionId, "follow-up-reply"));
    replacement.output.write(resultMessage(sessionId));
    await flushSdkMessages();
    expect(events.filter((event) => event.type === "turn.completed").at(-1)?.state).toBe(
      "completed",
    );
    await session.dispose();
  });

  it("preserves an absolute rollback anchor without a local turn ledger until provider activity advances it", async () => {
    const queries = Array.from({ length: 4 }, () => createClaudeTestQuery());
    for (const fake of queries) sdk.query.mockReturnValueOnce(fake.runtime);
    const session = await createSession();
    const sessionId = "11111111-1111-4111-8111-111111111111";
    await session.openThread(config, {
      providerSessionId: sessionId,
      discoveredAt: "2026-10-12T00:00:00Z",
    });
    await session.restoreToRevertAnchor({
      version: 1,
      data: { resumeSessionAt: "retained-assistant" },
    });
    await session.startTurn("Revised", { ...config, contextSize: "400k" });
    expect(sdk.query.mock.calls[2]?.[0].options).toMatchObject({
      resume: sessionId,
      resumeSessionAt: "retained-assistant",
    });
    queries[2]!.output.write(assistantMessage(sessionId, "revised-assistant"));
    queries[2]!.output.write(resultMessage(sessionId));
    await flushSdkMessages();
    await session.startTurn("Next", { ...config, contextSize: "1m" });
    expect(sdk.query.mock.calls[3]?.[0].options).not.toHaveProperty("resumeSessionAt");
    await session.dispose();
  });

  it("keeps background work alive and defers a resize until it drains", async () => {
    const original = createClaudeTestQuery();
    const replacement = createClaudeTestQuery();
    vi.spyOn(original.runtime, "close").mockImplementation(() => {});
    sdk.query.mockReturnValueOnce(original.runtime).mockReturnValueOnce(replacement.runtime);
    const session = await createSession();
    const events: RuntimeEvent[] = [];
    session.setListener({
      onRuntimeEvent: (event) => events.push(event),
      onUpdate: () => {},
      onClose: () => {},
      onError: () => {},
    });
    const sessionId = await session.openThread(config);
    await session.startTurn("Launch background work", config);
    original.output.write({
      ...assistantMessage(sessionId, "agent-proposal"),
      message: {
        id: "agent-proposal",
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "agent-tool",
            name: "Agent",
            input: { description: "Background work", prompt: "Read a file" },
          },
        ],
      },
    } as unknown as SDKMessage);
    original.output.write({
      type: "system",
      subtype: "task_started",
      session_id: sessionId,
      uuid: "11111111-1111-4111-8111-111111111110",
      task_id: "background-task",
      tool_use_id: "agent-tool",
      subagent_type: "general-purpose",
      description: "Background work",
    } satisfies SDKMessage);
    original.output.write({
      ...assistantMessage(sessionId, "child-proposal"),
      parent_tool_use_id: "agent-tool",
      message: {
        id: "child-proposal",
        role: "assistant",
        content: [
          { type: "tool_use", id: "child-tool", name: "Read", input: { file_path: "/tmp/file" } },
        ],
      },
    } as unknown as SDKMessage);
    await flushSdkMessages();
    const toolIds = events.flatMap((event) =>
      event.type === "item.started" && ["agent-tool", "child-tool"].includes(event.itemId)
        ? [event.itemId]
        : [],
    );
    expect(toolIds).toHaveLength(2);
    const resized = { ...config, contextSize: "200k" };
    await session.steerTurn("Resize", resized);
    await session.steerTurn("Later", resized);
    original.output.write(resultMessage(sessionId));
    await flushSdkMessages();
    await flushSdkMessages();
    original.output.write(assistantMessage(sessionId, "resized-reply"));
    original.output.write(resultMessage(sessionId));
    await flushSdkMessages();
    await flushSdkMessages();
    await session.startTurn("Direct", resized);
    // Every accepted prompt runs, in order, on the process that owns the task.
    expect(sdk.query).toHaveBeenCalledTimes(1);
    const input = sdk.query.mock.calls[0]![0].prompt;
    if (typeof input === "string") throw new Error("Expected the SDK prompt queue");
    const messages = input[Symbol.asyncIterator]();
    const delivered = [];
    for (let index = 0; index < 4; index++) {
      delivered.push((await messages.next()).value.message.content);
    }
    expect(delivered).toEqual(["Launch background work", "Resize", "Later", "Direct"]);
    // The old window's model variant stays until the relaunch applies the new one.
    expect(original.setModel).not.toHaveBeenCalled();
    expect(
      events.filter((event) => event.type === "item.completed" && toolIds.includes(event.itemId)),
    ).toEqual([]);
    original.output.write(assistantMessage(sessionId, "direct-reply"));
    original.output.write(resultMessage(sessionId));
    original.output.write({
      type: "system",
      subtype: "task_notification",
      session_id: sessionId,
      uuid: "11111111-1111-4111-8111-111111111112",
      task_id: "background-task",
      status: "completed",
      output_file: "/tmp/background-task.output",
      summary: "Background work completed",
    } satisfies SDKMessage);
    await flushSdkMessages();
    expect(
      events.filter((event) => event.type === "item.completed" && event.itemId === "agent-tool"),
    ).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ status: "success" }) }),
    ]);

    await session.startTurn("After drain", resized);
    expect(sdk.query).toHaveBeenCalledTimes(2);
    expect(sdk.query.mock.calls[1]?.[0].options).toMatchObject({
      resume: sessionId,
      model: config.model,
      env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "200000" },
    });
    const next = sdk.query.mock.calls[1]![0].prompt;
    if (typeof next === "string") throw new Error("Expected the SDK prompt queue");
    expect((await next[Symbol.asyncIterator]().next()).value.message.content).toBe("After drain");
    await session.dispose();
    original.output.end();
  });

  it.each([
    ["200k", "200000"],
    ["400k", "400000"],
    ["1m", "1000000"],
  ])(
    "launches a native 1M model with a selected or previously saved %s working window",
    async (contextSize, tokens) => {
      const fake = createClaudeTestQuery();
      sdk.query.mockReturnValue(fake.runtime);
      const selected = { ...config, contextSize };
      const session = await createSession(selected);
      await session.openThread(selected);
      expect(sdk.query.mock.calls[0]?.[0].options).toMatchObject({
        model: contextSize === "200k" ? config.model : `${config.model}[1m]`,
        env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: tokens },
        extraArgs: { "replay-user-messages": null },
      });
      await session.dispose();
    },
  );

  it("changes the window before the first prompt without resuming nonexistent history", async () => {
    const original = createClaudeTestQuery();
    const replacement = createClaudeTestQuery();
    const close = vi.spyOn(original.runtime, "close");
    sdk.query.mockReturnValueOnce(original.runtime).mockReturnValueOnce(replacement.runtime);
    const session = await createSession();
    const sessionId = await session.openThread(config);
    await session.startTurn("First message", { ...config, contextSize: "400k" });
    expect(close).toHaveBeenCalledOnce();
    expect(sdk.query.mock.calls[1]?.[0].options).toMatchObject({
      sessionId,
      env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "400000" },
    });
    expect(sdk.query.mock.calls[1]?.[0].options).not.toHaveProperty("resume");
    const prompt = sdk.query.mock.calls[1]?.[0].prompt;
    expect(typeof prompt).not.toBe("string");
    if (!prompt || typeof prompt === "string") throw new Error("Expected the SDK prompt queue");
    expect((await prompt[Symbol.asyncIterator]().next()).value.message.content).toBe(
      "First message",
    );
    await session.dispose();
  });

  it("reloads the same conversation through 1M, 400k and 1M between turns", async () => {
    const queries = Array.from({ length: 3 }, () => createClaudeTestQuery());
    for (const fake of queries) sdk.query.mockReturnValueOnce(fake.runtime);
    const session = await createSession();
    const sessionId = await session.openThread(config);
    const events: RuntimeEvent[] = [];
    const errors: string[] = [];
    session.setListener({
      onRuntimeEvent: (event) => events.push(event),
      onUpdate: () => {},
      onClose: () => {},
      onError: (error) => errors.push(error),
    });
    for (const [index, contextSize] of ["1m", "400k", "1m"].entries()) {
      await session.startTurn(`Message ${index}`, { ...config, contextSize });
      queries[index]!.output.write(assistantMessage(sessionId, `assistant-${index}`));
      queries[index]!.output.write(resultMessage(sessionId));
      await flushSdkMessages();
      expect(sdk.query).toHaveBeenCalledTimes(index + 1);
      const options = sdk.query.mock.calls[index]?.[0].options;
      expect(options?.env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe(
        contextSize === "1m" ? "1000000" : "400000",
      );
      expect(options?.resume).toBe(index === 0 ? undefined : sessionId);
      expect(options?.sessionId).toBe(index === 0 ? sessionId : undefined);
      expect(options).not.toHaveProperty("resumeSessionAt");
    }
    expect(events.filter((event) => event.type === "turn.started")).toHaveLength(3);
    expect(errors).toEqual([]);
    await session.dispose();
  });

  it("retains the selected window without reloading for an unrelated model/effort edit", async () => {
    const fake = createClaudeTestQuery();
    sdk.query.mockReturnValue(fake.runtime);
    const selected = { ...config, contextSize: "400k" };
    const session = await createSession(selected);
    await session.openThread(selected);
    await session.startTurn("Continue", { ...selected, model: "claude-opus-4-6", effort: "high" });
    expect(sdk.query).toHaveBeenCalledOnce();
    expect(fake.setModel).toHaveBeenCalledWith("claude-opus-4-6[1m]");
    await session.dispose();
  });

  it("keeps a rollback anchor when resizing before the next message", async () => {
    const queries = Array.from({ length: 3 }, () => createClaudeTestQuery());
    for (const fake of queries) sdk.query.mockReturnValueOnce(fake.runtime);
    const session = await createSession();
    const sessionId = await session.openThread(config);
    for (const index of [0, 1]) {
      await session.startTurn(`Message ${index}`, config);
      queries[0]!.output.write(assistantMessage(sessionId, `assistant-${index}`));
      queries[0]!.output.write(resultMessage(sessionId));
      await flushSdkMessages();
    }
    await session.rollbackThread(1);
    await session.startTurn("Revised message", { ...config, contextSize: "400k" });
    expect(sdk.query.mock.calls[2]?.[0].options).toMatchObject({
      resume: sessionId,
      resumeSessionAt: "assistant-0",
      env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "400000" },
    });
    await session.dispose();
  });

  it("discards a late context snapshot from the replaced query", async () => {
    const original = createClaudeTestQuery();
    const replacement = createClaudeTestQuery();
    let resolveOldUsage!: (usage: SDKControlGetContextUsageResponse) => void;
    original.runtime.getContextUsage = () =>
      new Promise((resolve) => {
        resolveOldUsage = resolve;
      });
    replacement.runtime.getContextUsage = async () => contextResponse(400_000);
    sdk.query.mockReturnValueOnce(original.runtime).mockReturnValueOnce(replacement.runtime);
    const session = await createSession();
    const sessionId = await session.openThread(config);
    const events: RuntimeEvent[] = [];
    session.setListener({
      onRuntimeEvent: (event) => events.push(event),
      onUpdate: () => {},
      onClose: () => {},
      onError: () => {},
    });
    await session.startTurn("Original", config);
    original.output.write(assistantMessage(sessionId, "assistant-old"));
    original.output.write(resultMessage(sessionId));
    await flushSdkMessages();
    await session.startTurn("Resize", { ...config, contextSize: "400k" });
    await flushSdkMessages();
    resolveOldUsage(contextResponse(1_000_000));
    await flushSdkMessages();
    expect(
      events
        .filter((event) => event.type === "context.updated")
        .map((event) => event.usage.maxTokens),
    ).toEqual([400_000]);
    await session.dispose();
  });
});
