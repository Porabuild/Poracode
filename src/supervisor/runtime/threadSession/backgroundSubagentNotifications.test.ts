import { describe, expect, it, vi } from "vitest";
import type { StructuredSessionHandle } from "@/supervisor/agents/base";
import type { BackgroundSubagentCompletion } from "@/supervisor/crossagentMcp/types";
import type { SessionRuntime } from "../sessionTypes";
import {
  BackgroundSubagentNotifications,
  formatBackgroundSubagentNotification,
} from "./backgroundSubagentNotifications";

const THREAD_ID = "parent";
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function completion(
  overrides: Partial<BackgroundSubagentCompletion> = {},
): BackgroundSubagentCompletion {
  return {
    runId: "run-1",
    name: "research",
    status: "completed",
    output: "result",
    ...overrides,
  };
}

function session(
  status: SessionRuntime["status"],
  structuredSession?: StructuredSessionHandle,
): SessionRuntime {
  return {
    instanceId: "instance",
    threadId: THREAD_ID,
    agentKind: "codex",
    adapter: {
      capabilities: { presentationMode: "gui" },
    },
    projectLocation: { kind: "posix", path: "/tmp/project" },
    config: { model: "parent-model" },
    mcpLaunchSnapshot: { mcpServers: [], disabledBuiltInMcpServerIds: [] },
    terminalSize: { cols: 80, rows: 24 },
    launchPrompt: "",
    status,
    attention: status === "working" ? "working" : "none",
    canResumeWithConfig: true,
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ...(structuredSession ? { structuredSession } : {}),
  } as unknown as SessionRuntime;
}

function notifier(parent: SessionRuntime) {
  const sessions = new Map([[THREAD_ID, parent]]);
  const onDeliveryError = vi.fn<(threadId: string, error: unknown) => void>();
  return {
    notifications: new BackgroundSubagentNotifications({
      sessions,
      isCurrentSession: (candidate) =>
        sessions.get(candidate.threadId)?.instanceId === candidate.instanceId,
      onDeliveryError,
    }),
    onDeliveryError,
  };
}

describe("BackgroundSubagentNotifications", () => {
  it("coalesces completions and steers a working parent without interrupting it", async () => {
    const steerTurn = vi.fn<NonNullable<StructuredSessionHandle["steerTurn"]>>(
      async () => undefined,
    );
    const startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async () => undefined,
    );
    const parent = session("working", {
      launchOptions: {},
      startTurn,
      steerTurn,
      setListener: vi.fn<StructuredSessionHandle["setListener"]>(),
      dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => undefined),
    });
    const { notifications } = notifier(parent);

    notifications.enqueue(THREAD_ID, completion());
    notifications.enqueue(
      THREAD_ID,
      completion({ runId: "run-2", name: "review", output: "second" }),
    );
    await flush();

    expect(steerTurn).toHaveBeenCalledTimes(1);
    expect(startTurn).not.toHaveBeenCalled();
    const prompt = steerTurn.mock.calls[0]![0];
    expect(prompt).toContain('"run_id":"run-1"');
    expect(prompt).toContain('"run_id":"run-2"');
    expect(prompt).toContain("do not call wait_for_agent");
  });

  it("queues for a non-steerable working parent and starts a turn after it becomes idle", async () => {
    const startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async () => undefined,
    );
    const parent = session("working", {
      launchOptions: {},
      startTurn,
      setListener: vi.fn<StructuredSessionHandle["setListener"]>(),
      dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => undefined),
    });
    const { notifications } = notifier(parent);

    notifications.enqueue(THREAD_ID, completion());
    await flush();
    expect(startTurn).not.toHaveBeenCalled();

    parent.status = "idle";
    parent.attention = "none";
    notifications.onSessionStateChanged(parent);
    await flush();

    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(startTurn.mock.calls[0]![0]).toContain('"output":"result"');
  });

  it("types the completion into an idle terminal parent", async () => {
    const write = vi.fn<(data: string) => void>();
    const parent = session("idle");
    parent.adapter = {
      ...parent.adapter,
      capabilities: { presentationMode: "terminal" },
      buildDirectInput: (prompt: string) => [prompt],
    } as never;
    parent.pty = { write } as never;
    const { notifications } = notifier(parent);

    notifications.enqueue(THREAD_ID, completion());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toContain("<crossagent_background_results>");
  });

  it("marks oversized output as truncated and directs the parent to get_status", () => {
    const prompt = formatBackgroundSubagentNotification([
      completion({ output: "x".repeat(30_000) }),
    ]);
    expect(prompt).toContain('"output_truncated":true');
    expect(prompt).toContain("call get_status");
    expect(prompt.length).toBeLessThan(25_000);
  });
});
