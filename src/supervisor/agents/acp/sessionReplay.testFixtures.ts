import type { AnyMessage, ClientSideConnection, SessionUpdate } from "@agentclientprotocol/sdk";
import { vi } from "vitest";
import type { RuntimeEvent, ThreadConfig } from "@/shared/contracts";
import type { StructuredSessionUpdate } from "../base";
import { AcpStructuredSession, rewriteLoadSessionError } from "./session";

export const REPLAY_SESSION_ID = "restored-session";
export const REPLAY_CONFIG: ThreadConfig = { model: "model-a", effort: "low" };

export function replayActivityUpdates(
  marker: string,
  assistantText = `${marker} reply`,
): SessionUpdate[] {
  return [
    {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: assistantText },
    },
    {
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: `${marker} thought` },
    },
    {
      sessionUpdate: "tool_call",
      toolCallId: `${marker}-tool`,
      title: `${marker} tool`,
      kind: "other",
      status: "in_progress",
      rawInput: { query: marker },
    },
    {
      sessionUpdate: "tool_call_update",
      toolCallId: `${marker}-tool`,
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: `${marker} result` } }],
    },
  ];
}

/** Exercise the real session lifecycle without spawning a transport or provider. */
export function createReplaySession(method: "load" | "resume") {
  const promptReply = vi
    .fn<ClientSideConnection["prompt"]>()
    .mockResolvedValue({ stopReason: "end_turn" });
  const connection = {
    loadSession: vi.fn<ClientSideConnection["loadSession"]>().mockResolvedValue({}),
    resumeSession: vi.fn<ClientSideConnection["resumeSession"]>().mockResolvedValue({}),
    setSessionMode: vi.fn<ClientSideConnection["setSessionMode"]>().mockResolvedValue({}),
    setSessionConfigOption: vi
      .fn<ClientSideConnection["setSessionConfigOption"]>()
      .mockResolvedValue({ configOptions: [] }),
    request: vi.fn<(method: string, params: unknown) => Promise<unknown>>().mockResolvedValue({}),
    prompt: vi.fn<ClientSideConnection["prompt"]>().mockImplementation((params) => {
      // Model the stream's actual synchronous dispatch callback, then the peer reply.
      (session as unknown as { endHistoryReplay(message: AnyMessage): void }).endHistoryReplay({
        jsonrpc: "2.0",
        id: 0,
        method: "session/prompt",
        params,
      });
      return promptReply(params);
    }),
    cancel: vi.fn<ClientSideConnection["cancel"]>().mockResolvedValue(undefined),
  };
  const listener = {
    onClose: vi.fn<() => void>(),
    onError: vi.fn<(message: string) => void>(),
    onUpdate: vi.fn<(update: StructuredSessionUpdate) => void>(),
    onRuntimeEvent: vi.fn<(event: RuntimeEvent) => void>(),
  };
  // Match the existing session tests' constructor-free harness. In particular,
  // leave sessionId unset: only openThread's actual load/resume may adopt it.
  const session = Object.assign(Object.create(AcpStructuredSession.prototype), {
    connection,
    listener,
    threadId: "replay-thread",
    projectLocation: { kind: "windows", path: "C:\\repo" },
    cwd: "C:\\repo",
    mcpServers: [],
    launchOptions: {},
    loadSessionErrorRewriter: rewriteLoadSessionError,
    agentSessionCapabilities: method === "resume" ? { resume: {} } : {},
    behavior: {},
    stderrChunks: [],
    bufferedRuntimeEvents: [],
    acpToolCallIdToItemId: new Map(),
    detachedTurnParentToolCallIds: new Set(),
    reportedBackgroundTasks: [],
    currentStatus: "idle",
    currentAttention: "none",
    isDisposed: false,
    isReplayingHistory: false,
    replayHistoryUntil: 0,
    promptInFlight: false,
    foregroundTurnOpen: false,
    foregroundTurnAwaitingSubagents: false,
    pendingPromptInterrupt: false,
    currentTurnInterruptRequested: false,
    suppressAgentOutputUntilNextTurn: false,
    promptHeldForBackgroundWork: false,
    recentInterruptAckTextTail: "",
    currentTurnHadAgentActivity: false,
    startTurnChain: Promise.resolve(),
    usageEpoch: 0,
    usageScopeFresh: false,
  }) as AcpStructuredSession;
  const update = (value: SessionUpdate) => {
    session.ingestExternalSessionUpdate({ sessionId: REPLAY_SESSION_ID, update: value });
  };
  const activity = (marker: string) => {
    for (const value of replayActivityUpdates(marker)) update(value);
  };
  return {
    session,
    connection,
    promptReply,
    listener,
    update,
    activity,
    openRpc: method === "load" ? connection.loadSession : connection.resumeSession,
    open: () =>
      session.openThread(REPLAY_CONFIG, {
        providerSessionId: REPLAY_SESSION_ID,
        discoveredAt: "2026-10-09T12:00:00.000Z",
      }),
  };
}
