import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  AgentCapability,
  AgentStatus,
  ProjectLocation,
  SessionRef,
  TerminalPrompt,
  ThreadAttention,
  ThreadConfig,
  ThreadServerRequestId,
  ThreadStatus,
} from "../../shared/contracts";
import { toWslUncPath } from "../../shared/wsl";
import {
  batchWslCommandsAsync,
  buildWindowsCmdCommand,
  createKnownSessionRef,
  detectAuthFile,
  readCommandOutputAsync,
  readWslCommandOutputAsync,
  resolveExecutablePathAsync,
  resolveWslExecutablePath,
  wrapWslCommand,
  type AgentAdapter,
  type AgentEnvContext,
  type AgentLaunchOptions,
  type CommandSpec,
  type CreateStructuredSessionInput,
  type StructuredSessionHandle,
  type StructuredSessionListener,
} from "./base";
import { detectRateLimitPrompt } from "./codex/rateLimitPrompt";
import { codexAuthPath } from "./codex/sessionFiles";

const capabilities: AgentCapability = {
  models: [
    { id: "gpt-5.4", label: "5.4" },
    { id: "gpt-5.4-mini", label: "5.4 Mini" },
    { id: "gpt-5.3-codex", label: "5.3 Codex" },
    { id: "gpt-5.2-codex", label: "5.2 Codex" },
    { id: "gpt-5.2", label: "5.2" },
    { id: "gpt-5.1-codex-max", label: "5.1 Codex Max" },
    { id: "gpt-5.1-codex-mini", label: "5.1 Codex Mini" },
  ],
  efforts: ["low", "medium", "high", "xhigh"],
  defaultEffort: "high",
  modelEfforts: {
    "gpt-5.1-codex-mini": ["medium", "high"],
  },
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "on-request", label: "On Request" },
    { id: "never", label: "Full Access" },
    { id: "untrusted", label: "Untrusted" },
  ],
  sandboxModes: [
    { id: "workspace-write", label: "Workspace Write" },
    { id: "read-only", label: "Read Only" },
    { id: "danger-full-access", label: "Full Access" },
  ],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "terminal",
};

export const CODEX_REMOTE_TUI_FEATURE = "tui_app_server";

type CodexThreadStatus =
  | { type: "active"; activeFlags?: string[] }
  | { type: "idle" }
  | { type: "notLoaded" }
  | { type: "systemError" };

type CodexSocketMessage =
  | {
      kind: "response";
      id: string;
      result?: unknown;
      error?: unknown;
    }
  | {
      kind: "request";
      id: ThreadServerRequestId;
      method: string;
      params?: Record<string, unknown>;
    }
  | {
      kind: "notification";
      method: string;
      params?: Record<string, unknown>;
    }
  | {
      kind: "unknown";
    };

function buildCodexArgs(
  config: ThreadConfig,
  prompt: string,
  launchOptions?: AgentLaunchOptions,
): string[] {
  const args: string[] = [];

  for (const feature of launchOptions?.enabledFeatures ?? []) {
    args.push("--enable", feature);
  }

  if (launchOptions?.remoteUrl) {
    args.push("--remote", launchOptions.remoteUrl);
  }

  args.push("--no-alt-screen");

  if (!launchOptions?.suppressResumeConfigOverrides) {
    if (config.model) {
      args.push("-m", config.model);
    }
    if (config.effort) {
      args.push("-c", `model_reasoning_effort="${config.effort}"`);
    }
    if (config.approvalPolicy) {
      args.push("-a", config.approvalPolicy);
    }
    if (config.sandboxMode) {
      args.push("-s", config.sandboxMode);
    }
    if (config.mode === "plan") {
      args.push("--plan");
    }
  }

  if (prompt.trim().length > 0) {
    args.push(prompt);
  }
  return args;
}

function buildCommand(
  location: ProjectLocation,
  config: ThreadConfig,
  prompt: string,
  sessionRef?: SessionRef,
  launchOptions?: AgentLaunchOptions,
  wslExecPath?: string,
): CommandSpec {
  // When the structured session owns thread lifecycle, the TUI resumes the
  // server-created thread. Config is controlled by the server, not the CLI.
  if (launchOptions?.suppressResumeConfigOverrides) {
    const baseArgs = buildCodexArgs(config, "", launchOptions);
    const args = launchOptions.resumeThreadId
      ? [
          "resume",
          ...baseArgs,
          launchOptions.resumeThreadId,
          ...(prompt.trim().length > 0 ? [prompt] : []),
        ]
      : baseArgs;
    if (location.kind === "windows") {
      return buildWindowsCmdCommand(location.path, "codex", args);
    }
    return wrapWslCommand(location, "codex", args, wslExecPath);
  }

  const codexArgs = buildCodexArgs(config, prompt, launchOptions);
  const args = sessionRef
    ? [
        "resume",
        ...buildCodexArgs(config, "", launchOptions),
        sessionRef.providerSessionId,
        ...(prompt.trim().length > 0 ? [prompt] : []),
      ]
    : codexArgs;

  if (location.kind === "windows") {
    return buildWindowsCmdCommand(location.path, "codex", args);
  }
  return wrapWslCommand(location, "codex", args, wslExecPath);
}

export function buildCodexAppServerCommand(
  location: ProjectLocation,
  remoteUrl: string,
  wslExecPath?: string,
): CommandSpec {
  const args = ["app-server", "--listen", remoteUrl, "--enable", CODEX_REMOTE_TUI_FEATURE];

  if (location.kind === "windows") {
    return buildWindowsCmdCommand(location.path, "codex", args);
  }
  return wrapWslCommand(location, "codex", args, wslExecPath);
}

function requireWebSocket(): typeof WebSocket {
  if (typeof WebSocket === "undefined") {
    throw new Error("WebSocket is unavailable in this runtime.");
  }
  return WebSocket;
}

async function allocateLoopbackPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a loopback port.")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function spawnAppServer(command: CommandSpec): ChildProcess {
  return spawn(command.command, command.args, {
    cwd: command.cwd ?? process.cwd(),
    env: {
      ...process.env,
      TERM: "xterm-256color",
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });
}

function toSessionRef(threadId: string): SessionRef {
  return createKnownSessionRef(threadId);
}

function extractThreadField(result: unknown, field: string): string | undefined {
  if (!result || typeof result !== "object" || !("thread" in result)) {
    return undefined;
  }
  const thread = (result as Record<string, unknown>).thread;
  if (!thread || typeof thread !== "object" || !(field in thread)) {
    return undefined;
  }
  const value = (thread as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

export function deriveCodexStructuredState(status: CodexThreadStatus): {
  status: ThreadStatus;
  attention: ThreadAttention;
} {
  if (status.type === "systemError") {
    return {
      status: "error",
      attention: "error",
    };
  }

  if (status.type === "idle") {
    return {
      status: "idle",
      attention: "none",
    };
  }

  if (status.type === "notLoaded") {
    return {
      status: "inactive",
      attention: "none",
    };
  }

  const activeFlags = new Set(status.activeFlags ?? []);
  if (activeFlags.has("waitingOnApproval")) {
    return {
      status: "needs_approval",
      attention: "needs_approval",
    };
  }

  if (activeFlags.has("waitingOnUserInput")) {
    return {
      status: "needs_reply",
      attention: "needs_reply",
    };
  }

  return {
    status: "idle",
    attention: "none",
  };
}

export function parseCodexSocketMessage(payload: unknown): CodexSocketMessage {
  if (!payload || typeof payload !== "object") {
    return { kind: "unknown" };
  }

  const message = payload as Record<string, unknown>;
  const method = typeof message.method === "string" ? message.method : undefined;
  const params =
    typeof message.params === "object" && message.params !== null
      ? (message.params as Record<string, unknown>)
      : undefined;

  if (method) {
    if ("id" in message) {
      return {
        kind: "request",
        id: message.id as ThreadServerRequestId,
        method,
        ...(params ? { params } : {}),
      };
    }

    return {
      kind: "notification",
      method,
      ...(params ? { params } : {}),
    };
  }

  if ("id" in message) {
    return {
      kind: "response",
      id: String(message.id),
      ...("result" in message ? { result: message.result } : {}),
      ...("error" in message ? { error: message.error } : {}),
    };
  }

  return { kind: "unknown" };
}

// ── Structured Session ──────────────────────────────────────────
//
// Lifecycle for a new thread:
//   1. create()       → spawn app-server, connect WebSocket
//   2. activate()     → initialize handshake with the server
//   3. openThread()   → thread/start on the server, get Codex thread ID
//   4. startTurn()    → fire initial turn (creates rollout file)
//   5. (caller waits for rollout file, then spawns TUI with resume)
//
// Lifecycle for resuming a saved thread:
//   1. create()       → spawn app-server, connect WebSocket
//   2. activate()     → initialize handshake
//   3. openThread()   → thread/resume with saved session ID
//   4. (caller spawns TUI with resume)

class CodexStructuredSession implements StructuredSessionHandle {
  launchOptions: AgentLaunchOptions;

  private readonly remoteUrl: string;
  private readonly appServer: ChildProcess;
  private readonly appServerOutput: string[] = [];
  private readonly socket: WebSocket;
  private listener: StructuredSessionListener | undefined;
  private isDisposed = false;
  private activated = false;
  private requestSequence = 0;
  private remoteThreadId: string | undefined;
  private rolloutPath: string | undefined;
  private rolloutCreatedAt: string | undefined;
  private rolloutCwd: string | undefined;
  private rolloutCliVersion: string | undefined;
  private rolloutSource: Record<string, unknown> | undefined;
  private rolloutModelProvider: string | undefined;
  private wslDistro: string | undefined;
  private currentThreadStatus: CodexThreadStatus = { type: "idle" };
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  private constructor(
    remoteUrl: string,
    appServer: ChildProcess,
    socket: WebSocket,
    wslDistro?: string,
  ) {
    this.remoteUrl = remoteUrl;
    this.appServer = appServer;
    this.socket = socket;
    this.wslDistro = wslDistro;
    this.launchOptions = {
      enabledFeatures: [CODEX_REMOTE_TUI_FEATURE],
      remoteUrl,
      suppressResumeConfigOverrides: true,
    };
  }

  static async create(
    input: CreateStructuredSessionInput,
    wslExecPath?: string,
  ): Promise<CodexStructuredSession> {
    const port = await allocateLoopbackPort();
    const remoteUrl = `ws://127.0.0.1:${port}`;
    const appServer = spawnAppServer(
      buildCodexAppServerCommand(input.projectLocation, remoteUrl, wslExecPath),
    );
    const WebSocketCtor = requireWebSocket();

    const appServerOutput: string[] = [];
    appServer.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      console.log("[codex app-server stdout]", text);
      appServerOutput.push(text);
      if (appServerOutput.length > 12) {
        appServerOutput.shift();
      }
    });
    appServer.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      console.log("[codex app-server stderr]", text);
      appServerOutput.push(text);
      if (appServerOutput.length > 12) {
        appServerOutput.shift();
      }
    });

    console.log("[codex app-server] connecting WebSocket to", remoteUrl);
    const socket = await connectCodexAppServer(
      remoteUrl,
      appServer,
      appServerOutput,
      WebSocketCtor,
    );
    console.log("[codex app-server] WebSocket connected");
    const wslDistro =
      input.projectLocation.kind === "wsl" ? input.projectLocation.distro : undefined;
    const session = new CodexStructuredSession(remoteUrl, appServer, socket, wslDistro);
    session.appServerOutput.push(...appServerOutput);
    session.attachSocketHandlers();

    return session;
  }

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;

    // Re-emit current state so the listener doesn't miss updates that
    // fired before the listener was attached.
    if (this.activated && this.remoteThreadId) {
      const sessionRef = toSessionRef(this.remoteThreadId);
      listener.onUpdate({
        ...deriveCodexStructuredState(this.currentThreadStatus),
        sessionRef,
      });
    }
  }

  async activate(): Promise<void> {
    if (this.activated) {
      throw new Error("CodexStructuredSession already activated.");
    }
    if (this.isDisposed) {
      throw new Error("CodexStructuredSession was disposed before activation.");
    }
    this.activated = true;

    console.log("[codex app-server] sending initialize...");
    await this.initialize();
    console.log("[codex app-server] initialize complete");
  }

  async openThread(config: ThreadConfig, sessionRef?: SessionRef): Promise<string> {
    const threadOverrides = {
      model: config.model,
      ...(config.approvalPolicy ? { approvalPolicy: config.approvalPolicy } : {}),
      ...(config.sandboxMode ? { sandbox: config.sandboxMode } : {}),
      ...(config.effort ? { config: { model_reasoning_effort: config.effort } } : {}),
      ...(config.mode === "plan" ? { mode: "plan" } : {}),
    };

    let threadId: string;
    if (sessionRef) {
      console.log("[codex app-server] thread/resume", sessionRef.providerSessionId);
      await this.request("thread/resume", {
        ...threadOverrides,
        threadId: sessionRef.providerSessionId,
        persistExtendedHistory: true,
      });
      threadId = sessionRef.providerSessionId;
    } else {
      console.log("[codex app-server] thread/start");
      const result = await this.request("thread/start", {
        ...threadOverrides,
        experimentalRawEvents: false,
        persistExtendedHistory: true,
      });
      threadId = extractThreadField(result, "id") ?? "";
      if (!threadId) {
        throw new Error("thread/start response did not contain a thread id.");
      }
      const thread =
        result && typeof result === "object" && "thread" in result
          ? ((result as Record<string, unknown>).thread as Record<string, unknown> | undefined)
          : undefined;
      const rawPath = extractThreadField(result, "path") ?? undefined;
      this.rolloutPath =
        rawPath && this.wslDistro ? toWslUncPath(this.wslDistro, rawPath) : rawPath;
      this.rolloutCreatedAt =
        thread && typeof thread.createdAt === "number"
          ? new Date(thread.createdAt * 1000).toISOString()
          : new Date().toISOString();
      this.rolloutCwd = typeof thread?.cwd === "string" ? thread.cwd : undefined;
      this.rolloutCliVersion =
        typeof thread?.cliVersion === "string" ? thread.cliVersion : undefined;
      this.rolloutSource =
        thread && typeof thread.source === "object" && thread.source !== null
          ? (thread.source as Record<string, unknown>)
          : undefined;
      this.rolloutModelProvider =
        typeof thread?.modelProvider === "string" ? thread.modelProvider : undefined;
    }

    this.remoteThreadId = threadId;
    this.launchOptions = { ...this.launchOptions, resumeThreadId: threadId };
    console.log("[codex app-server] active thread:", threadId, this.rolloutPath ?? "");
    return threadId;
  }

  async waitForRolloutFile(timeoutMs = 10_000): Promise<void> {
    if (!this.rolloutPath) {
      return;
    }
    const { existsSync } = await import("node:fs");
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (existsSync(this.rolloutPath)) {
        console.log("[codex app-server] rollout file ready:", this.rolloutPath);
        return;
      }
      await sleep(200);
    }
    console.log("[codex app-server] rollout file not found after timeout, proceeding anyway");
  }

  async ensureResumeArtifacts(): Promise<void> {
    if (!this.rolloutPath || !this.remoteThreadId) {
      return;
    }

    const { existsSync } = await import("node:fs");
    if (existsSync(this.rolloutPath)) {
      return;
    }

    await mkdir(dirname(this.rolloutPath), { recursive: true });

    const sessionMeta = JSON.stringify({
      timestamp: new Date().toISOString(),
      type: "session_meta",
      payload: {
        id: this.remoteThreadId,
        ...(this.rolloutCreatedAt ? { timestamp: this.rolloutCreatedAt } : {}),
        ...(this.rolloutCwd ? { cwd: this.rolloutCwd } : {}),
        originator: "lightcode",
        ...(this.rolloutCliVersion ? { cli_version: this.rolloutCliVersion } : {}),
        ...(this.rolloutSource ? { source: this.rolloutSource } : {}),
        ...(this.rolloutModelProvider ? { model_provider: this.rolloutModelProvider } : {}),
      },
    });

    try {
      await writeFile(this.rolloutPath, `${sessionMeta}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      console.log("[codex app-server] seeded rollout file:", this.rolloutPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  async startTurn(prompt: string, config: ThreadConfig): Promise<void> {
    const threadId = await this.waitForRemoteThreadId();

    await this.request("turn/start", {
      threadId,
      input: [
        {
          type: "text",
          text: prompt,
          text_elements: [],
        },
      ],
      model: config.model,
      ...(config.effort ? { effort: config.effort } : {}),
      ...(config.approvalPolicy ? { approvalPolicy: config.approvalPolicy } : {}),
    });
  }

  async resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): Promise<void> {
    this.socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        result: response,
      }),
    );
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;

    try {
      this.socket.close();
    } catch {
      // Ignore close races during teardown.
    }

    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Codex app-server session disposed."));
    }
    this.pendingRequests.clear();

    if (!this.appServer.killed) {
      this.appServer.kill();
    }
  }

  private attachSocketHandlers(): void {
    this.socket.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : "";
      if (!raw) {
        return;
      }

      console.log("[codex app-server ws]", raw);

      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }

      const message = parseCodexSocketMessage(payload);

      if (message.kind === "response") {
        const pending = this.pendingRequests.get(message.id);
        if (!pending) {
          return;
        }

        this.pendingRequests.delete(message.id);
        clearTimeout(pending.timeout);

        if (message.error !== undefined) {
          const err = message.error;
          const errMsg =
            typeof err === "object" && err !== null && "message" in err
              ? String((err as Record<string, unknown>).message)
              : String(err);
          pending.reject(new Error(errMsg));
        } else {
          pending.resolve(message.result);
        }
        return;
      }

      if (message.kind === "request") {
        this.listener?.onServerRequest({
          requestId: message.id,
          method: message.method,
          params: message.params,
        });
        return;
      }

      if (message.kind !== "notification") {
        return;
      }

      const { method, params } = message;

      if (method === "thread/started" && params && "thread" in params) {
        const thread = params.thread;
        if (!thread || typeof thread !== "object" || !("id" in thread)) {
          return;
        }

        const threadId = String(thread.id);

        // Ignore thread/started for threads we didn't create (e.g. the TUI's own thread).
        if (this.remoteThreadId !== undefined && this.remoteThreadId !== threadId) {
          return;
        }

        this.remoteThreadId = threadId;
        const nextSessionRef = toSessionRef(threadId);
        this.currentThreadStatus =
          "status" in thread && thread.status && typeof thread.status === "object"
            ? (thread.status as CodexThreadStatus)
            : { type: "idle" };
        this.emitDerivedUpdate(nextSessionRef);
        void this.syncRemoteThreadState(threadId, nextSessionRef);
        return;
      }

      if (
        method === "thread/status/changed" &&
        params &&
        "threadId" in params &&
        "status" in params
      ) {
        if (!this.isCurrentThreadNotification(String(params.threadId))) {
          return;
        }
        this.currentThreadStatus = params.status as CodexThreadStatus;
        this.emitDerivedUpdate();
        return;
      }

      if (method === "turn/started" && params && "threadId" in params) {
        if (!this.isCurrentThreadNotification(String(params.threadId))) {
          return;
        }

        this.listener?.onUpdate({
          status: "working",
          attention: "working",
        });
        return;
      }

      if (method === "turn/completed" && params && "threadId" in params) {
        if (!this.isCurrentThreadNotification(String(params.threadId))) {
          return;
        }

        void this.syncRemoteThreadState(String(params.threadId));
        return;
      }

      if (method === "account/rateLimits/updated" && params && "rateLimits" in params) {
        console.log("[codex app-server] rate limits updated:", JSON.stringify(params.rateLimits));
        return;
      }

      if (method === "thread/closed") {
        this.listener?.onClose();
      }
    });

    this.socket.addEventListener("close", () => {
      if (!this.isDisposed) {
        this.listener?.onClose();
      }
    });

    this.socket.addEventListener("error", () => {
      if (!this.isDisposed) {
        this.listener?.onError("Codex app-server connection failed.");
      }
    });

    this.appServer.once("exit", () => {
      if (!this.isDisposed) {
        this.listener?.onClose();
      }
    });
  }

  private async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: {
        name: "lightcode",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });

    const initializedNotification = JSON.stringify({
      jsonrpc: "2.0",
      method: "initialized",
    });
    console.log("[codex app-server ws >>]", initializedNotification);
    this.socket.send(initializedNotification);
  }

  private isCurrentThreadNotification(threadId: string): boolean {
    return this.remoteThreadId === undefined || this.remoteThreadId === threadId;
  }

  private async waitForRemoteThreadId(): Promise<string> {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      if (this.remoteThreadId) {
        return this.remoteThreadId;
      }
      await sleep(50);
    }

    throw new Error("Codex remote thread is not ready yet.");
  }

  private emitDerivedUpdate(sessionRef?: SessionRef): void {
    const next = deriveCodexStructuredState(this.currentThreadStatus);
    this.listener?.onUpdate({
      status: next.status,
      attention: next.attention,
      ...(sessionRef ? { sessionRef } : {}),
    });
  }

  private async syncRemoteThreadState(threadId: string, sessionRef?: SessionRef): Promise<void> {
    try {
      const result = await this.request("thread/read", {
        threadId,
        includeTurns: false,
      });

      if (!result || typeof result !== "object" || !("thread" in result)) {
        return;
      }

      const thread = result.thread;
      if (!thread || typeof thread !== "object") {
        return;
      }

      if ("status" in thread && thread.status && typeof thread.status === "object") {
        this.currentThreadStatus = thread.status as CodexThreadStatus;
      }
      this.emitDerivedUpdate(sessionRef);
    } catch {
      // Ignore best-effort sync failures and continue using notifications.
    }
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = `lightcode-${this.requestSequence++}`;

    const pending = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timed out waiting for Codex app-server response to ${method}.`));
      }, 5_000);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout,
      });
    });

    const outgoing = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });
    console.log("[codex app-server ws >>]", outgoing);
    this.socket.send(outgoing);

    return pending;
  }
}

async function connectCodexAppServer(
  remoteUrl: string,
  appServer: ChildProcess,
  appServerOutput: string[],
  WebSocketCtor: typeof WebSocket,
): Promise<WebSocket> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (appServer.exitCode !== null) {
      throw new Error(`Codex app-server exited early.${formatAppServerOutput(appServerOutput)}`);
    }

    try {
      const socket = await new Promise<WebSocket>((resolve, reject) => {
        const candidate = new WebSocketCtor(remoteUrl);
        const handleOpen = () => {
          cleanup();
          resolve(candidate);
        };
        const handleError = (event: Event) => {
          cleanup();
          reject(event);
        };
        const cleanup = () => {
          candidate.removeEventListener("open", handleOpen);
          candidate.removeEventListener("error", handleError);
        };
        candidate.addEventListener("open", handleOpen);
        candidate.addEventListener("error", handleError);
      });

      return socket;
    } catch (error) {
      lastError = error;
      await sleep(200);
    }
  }

  throw new Error(
    `Unable to connect to Codex app-server.${formatAppServerOutput(appServerOutput)}${
      lastError ? ` Last error: ${String(lastError)}` : ""
    }`,
  );
}

const CODEX_UPDATE_RE = /Update available!/;
const CODEX_READY_RE = /OpenAI Codex/;
const CODEX_DIRECTORY_RE = /directory:/;
const CODEX_MODEL_RE = /\/model to change/;

/**
 * Detect a Codex TUI "Update available!" interactive prompt from
 * ANSI-stripped PTY output.
 */
export function detectCodexUpdatePrompt(text: string): boolean {
  return CODEX_UPDATE_RE.test(text);
}

export function detectCodexStartupPrompt(text: string): TerminalPrompt | null {
  if (!detectCodexUpdatePrompt(text)) {
    return null;
  }

  const versionMatch = /Update available!\s*([0-9.]+)\s*->\s*([0-9.]+)/.exec(text);
  const title = versionMatch
    ? `Update available! ${versionMatch[1]} -> ${versionMatch[2]}`
    : "Update available!";

  return {
    title,
    options: [
      {
        key: "1",
        label: "Update now",
        description: "Runs npm install -g @openai/codex",
        submitInput: "1",
      },
      {
        key: "2",
        label: "Skip",
        submitInput: "2",
        continueQueuedPrompt: true,
      },
      {
        key: "3",
        label: "Skip until next version",
        submitInput: "3",
        continueQueuedPrompt: true,
      },
    ],
  };
}

export function detectCodexReadyForInitialPrompt(text: string): boolean {
  if (detectCodexUpdatePrompt(text)) {
    return false;
  }

  return CODEX_READY_RE.test(text) && CODEX_DIRECTORY_RE.test(text) && CODEX_MODEL_RE.test(text);
}

function formatAppServerOutput(chunks: string[]): string {
  const text = chunks.join("").trim();
  return text ? ` Output: ${text}` : "";
}

export function createCodexAdapter(): AgentAdapter {
  const detectedWslExecPaths = new Map<string, string | undefined>();

  function resolveWslExecPath(location: ProjectLocation): string | undefined {
    if (location.kind !== "wsl") {
      return undefined;
    }

    const cached = detectedWslExecPaths.get(location.distro);
    if (cached) {
      return cached;
    }

    const resolved = resolveWslExecutablePath(location.distro, "codex");
    detectedWslExecPaths.set(location.distro, resolved);
    return resolved;
  }

  return {
    kind: "codex",
    label: "Codex",
    capabilities,
    async detectInstall(ctx?: AgentEnvContext): Promise<AgentStatus> {
      const isWsl = ctx?.envKind === "wsl" && ctx.wslDistro;

      if (isWsl) {
        const [whichResult] = await batchWslCommandsAsync(ctx.wslDistro!, ["command -v codex"]);
        const executablePath = whichResult?.ok ? whichResult.stdout : undefined;
        detectedWslExecPaths.set(ctx.wslDistro!, executablePath);
        const versionResult = executablePath
          ? await readWslCommandOutputAsync(ctx.wslDistro!, executablePath, ["--version"])
          : undefined;
        return {
          kind: "codex",
          label: "Codex",
          installed: executablePath !== undefined,
          ...(executablePath ? { executablePath } : {}),
          ...(versionResult?.ok ? { version: versionResult.stdout } : {}),
          authState: "unknown",
          capabilities,
        };
      }

      const executablePath = await resolveExecutablePathAsync("codex");
      const versionResult = executablePath
        ? await readCommandOutputAsync("codex", ["--version"])
        : undefined;

      return {
        kind: "codex",
        label: "Codex",
        installed: executablePath !== undefined,
        ...(executablePath ? { executablePath } : {}),
        ...(versionResult?.ok ? { version: versionResult.stdout } : {}),
        authState: detectAuthFile(codexAuthPath()),
        capabilities,
      };
    },
    buildLaunchCommand(location, config, prompt, sessionRef, launchOptions) {
      return buildCommand(
        location,
        config,
        prompt,
        sessionRef,
        launchOptions,
        resolveWslExecPath(location),
      );
    },
    buildResumeCommand(location, config, prompt, sessionRef, launchOptions) {
      return buildCommand(
        location,
        config,
        prompt,
        sessionRef,
        launchOptions,
        resolveWslExecPath(location),
      );
    },
    createInitialSessionRef() {
      return undefined;
    },
    async createStructuredSession(input) {
      return CodexStructuredSession.create(
        input,
        input.projectLocation.kind === "wsl"
          ? detectedWslExecPaths.get(input.projectLocation.distro)
          : undefined,
      );
    },
    buildDirectInput(prompt) {
      return [...prompt, "\r"];
    },
    detectStartupPrompt(text) {
      return detectCodexStartupPrompt(text);
    },
    isReadyForInitialPrompt(text) {
      return detectCodexReadyForInitialPrompt(text);
    },
    detectAutoResponse(text) {
      if (detectRateLimitPrompt(text)) return "2";
      return null;
    },
    defaultOneShotModel: "gpt-5.4-mini",
    buildOneShotCommand(model, effort) {
      const args = ["exec", "-m", model];
      if (effort) {
        args.push("-c", `model_reasoning_effort="${effort}"`);
      }
      args.push("-");
      return { command: "codex", args };
    },
  };
}
