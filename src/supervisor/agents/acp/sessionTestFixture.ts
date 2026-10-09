import { vi } from "vitest";
import type {
  CreateElicitationRequest,
  PromptCapabilities,
  RequestPermissionRequest,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { AcpStructuredSession, rewriteLoadSessionError, type AcpSessionBehavior } from "./session";
import type { AcpTextStreamExtension } from "./canonicalMapping/textStreamExtension";
import { createAcpLocalImageResolver } from "./sessionLocalImages";

export type TestableAcpSession = {
  openThread(
    config: ThreadConfig,
    sessionRef?: import("@/shared/contracts").SessionRef,
  ): Promise<string>;
  startTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: import("@/shared/contracts").PromptSegment[],
    options?: { userMessageItemId?: string },
  ): Promise<void>;
  interruptTurn(): Promise<void>;
  forceCompleteTurn(): void;
  dispose(): Promise<void>;
  resolveServerRequest(requestId: string, response: unknown): Promise<void>;
  handlePermissionRequest(params: RequestPermissionRequest): Promise<unknown>;
  handleSessionUpdate(params: { update: unknown }): void;
  getBackgroundTasks(): readonly import("@/shared/contracts").BackgroundTask[];
  handleStderrTurnSignalLine(line: string): void;
  ingestExternalSessionUpdate(notification: SessionNotification): void;
  attachExternalSessionUpdateSource(source: {
    onSessionUpdate(notification: SessionNotification): boolean | void;
    dispose(): void;
  }): void;
  setListener(listener: unknown): void;
};

export function makeConfigSyncSession(
  overrides: {
    currentConfig?: ThreadConfig;
    agentMcpCapabilities?: { http?: boolean; sse?: boolean } | undefined;
    assumedMcpCapabilities?: { http?: boolean; sse?: boolean };
    optimisticMcpTransports?: readonly ("stdio" | "http" | "sse")[];
    mcpServers?: Array<{
      id: string;
      name: string;
      timeoutMs: number;
      transport:
        | { type: "http"; url: string; headers: Record<string, string> }
        | { type: "sse"; url: string; headers: Record<string, string> }
        | { type: "stdio"; command: string; args: string[]; env: Record<string, string> };
    }>;
    fsTextCapability?: boolean;
    terminalCapability?: boolean;
    /** Default true. `false` leaves agent-origin host image reads unresolved. */
    localResourceResolution?: boolean;
    projectElicitationPresentation?: (
      request: CreateElicitationRequest,
    ) => CreateElicitationRequest;
    initializeMeta?: Record<string, unknown>;
    clientCapabilitiesMeta?: Record<string, unknown>;
    agentPromptCapabilities?: PromptCapabilities;
    behavior?: AcpSessionBehavior;
    textStreamExtension?: AcpTextStreamExtension;
    stderrTurnSignalParser?: (line: string) => "background-wait" | undefined;
  } = {},
) {
  const connection = {
    initialize: vi
      .fn<(args: { clientCapabilities: unknown }) => Promise<{ protocolVersion: number }>>()
      .mockResolvedValue({ protocolVersion: 1 }),
    setSessionMode: vi
      .fn<(args: { sessionId: string; modeId: string }) => Promise<void>>()
      .mockResolvedValue(undefined),
    // Raw request escape hatch used by the unstable `session/set_model`
    // compat shim (see unstableModelCompat.ts).
    request: vi
      .fn<(method: string, params: { sessionId: string; modelId: string }) => Promise<unknown>>()
      .mockResolvedValue(undefined),
    setSessionConfigOption: vi
      .fn<
        (args: {
          sessionId: string;
          configId: string;
          value: string;
        }) => Promise<{ configOptions: unknown[] } | void>
      >()
      .mockResolvedValue(undefined),
    prompt: vi
      .fn<(args: { sessionId: string; prompt: unknown[] }) => Promise<{ stopReason: string }>>()
      .mockResolvedValue({ stopReason: "end_turn" }),
    cancel: vi.fn<(args: { sessionId: string }) => Promise<void>>().mockResolvedValue(undefined),
    extMethod: vi
      .fn<(method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>>()
      .mockResolvedValue({}),
    closeSession: vi
      .fn<(args: { sessionId: string }) => Promise<void>>()
      .mockResolvedValue(undefined),
    loadSession: vi
      .fn<
        (args: { sessionId: string; cwd: string; mcpServers: unknown[] }) => Promise<{
          modes?: { availableModes: Array<{ id: string }> };
          configOptions?: unknown[];
        }>
      >()
      .mockResolvedValue({ modes: { availableModes: [] }, configOptions: [] }),
    resumeSession: vi
      .fn<
        (args: { sessionId: string; cwd: string; mcpServers: unknown[] }) => Promise<{
          modes?: { currentModeId?: string; availableModes: Array<{ id: string }> };
          configOptions?: unknown[];
        }>
      >()
      .mockResolvedValue({ modes: { availableModes: [] }, configOptions: [] }),
    newSession: vi
      .fn<
        (args: { cwd: string; mcpServers: unknown[] }) => Promise<{
          sessionId: string;
          modes?: { availableModes: Array<{ id: string }> };
          configOptions?: unknown[];
        }>
      >()
      .mockResolvedValue({
        sessionId: "session-1",
        modes: { availableModes: [] },
        configOptions: [],
      }),
  };
  const listener = {
    onClose: vi.fn<() => void>(),
    onError: vi.fn<(message: string) => void>(),
    onUpdate: vi.fn<(update: unknown) => void>(),
    onRuntimeEvent: vi.fn<(event: unknown) => void>(),
  };
  const session = Object.create(AcpStructuredSession.prototype) as Record<string, unknown>;
  session["child"] = { killed: true, exitCode: 0 };
  session["connection"] = connection;
  session["acpToolCallIdToItemId"] = new Map();
  session["detachedTurnParentToolCallIds"] = new Set();
  session["sessionId"] = "session-1";
  session["threadId"] = "thread-1";
  const projectLocation: ProjectLocation = { kind: "windows", path: "C:\\repo" };
  session["projectLocation"] = projectLocation;
  session["listener"] = listener;
  // Default HTTP support keeps these pass-through fixtures independent from
  // transport-negotiation tests, which override this capability explicitly.
  session["agentMcpCapabilities"] =
    "agentMcpCapabilities" in overrides ? overrides.agentMcpCapabilities : { http: true };
  session["assumedMcpCapabilities"] = overrides.assumedMcpCapabilities;
  session["optimisticMcpTransports"] = overrides.optimisticMcpTransports;
  session["currentConfig"] = overrides.currentConfig ?? {
    model: "model-a",
    effort: "low",
    mode: "agent",
    approvalPolicy: "default",
  };
  session["currentSlashCommands"] = undefined;
  session["currentStatus"] = "idle";
  session["currentAttention"] = "none";
  session["bufferedRuntimeEvents"] = [];
  session["isReplayingHistory"] = false;
  session["isDisposed"] = false;
  session["promptInFlight"] = false;
  session["pendingPromptInterrupt"] = false;
  session["currentTurnInterruptRequested"] = false;
  session["suppressAgentOutputUntilNextTurn"] = false;
  session["recentInterruptAckTextTail"] = "";
  session["currentTurnHadAgentActivity"] = false;
  session["stderrChunks"] = [];
  session["emptyResponseErrorResolver"] = undefined;
  session["mapperState"] = undefined;
  session["reportedBackgroundTasks"] = [];
  session["acpTerminals"] = new Map();
  session["acpTerminalSeq"] = 0;
  session["releasedAcpTerminalOutput"] = new Map();
  session["acpTerminalCommandById"] = new Map();
  session["agentPromptCapabilities"] = overrides.agentPromptCapabilities;
  session["agentSessionCapabilities"] = undefined;
  session["initializeMeta"] = overrides.initializeMeta;
  session["clientCapabilitiesMeta"] = overrides.clientCapabilitiesMeta;
  session["behavior"] = overrides.behavior ?? {};
  session["textStreamExtension"] = overrides.textStreamExtension;
  session["stderrTurnSignalParser"] = overrides.stderrTurnSignalParser;
  session["promptHeldForBackgroundWork"] = false;
  session["startTurnChain"] = Promise.resolve();
  session["cwd"] = "C:\\repo";
  session["stableSessionRef"] = undefined;
  session["usageScopeId"] = undefined;
  session["usageEpoch"] = 0;
  session["usageScopeFresh"] = false;
  session["launchOptions"] = {};
  session["mcpServers"] = overrides.mcpServers ?? [];
  session["loadSessionErrorRewriter"] = rewriteLoadSessionError;
  // Mirrors the constructor's `options?.fsTextCapability !== false` default.
  session["fsTextCapability"] = overrides.fsTextCapability !== false;
  session["terminalCapability"] = overrides.terminalCapability !== false;
  // The resolver closes over the location above. Absolute host paths still
  // resolve when a test later replaces projectLocation; WSL mapping does not.
  session["resolveLocalImage"] =
    overrides.localResourceResolution !== false
      ? createAcpLocalImageResolver(projectLocation)
      : undefined;
  session["projectElicitationPresentation"] = overrides.projectElicitationPresentation;
  session["fsAgentHomeDirs"] = [];
  session["spawnReady"] = Promise.resolve();
  return { connection, listener, session: session as unknown as TestableAcpSession };
}
