import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { watch } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  AgentCapability,
  AgentStatus,
  ProjectLocation,
  PromptSegment,
  SessionRef,
  ThreadAttention,
  ThreadConfig,
  ThreadServerRequestId,
  ThreadStatus,
} from "../../shared/contracts";
import { toWslUncPath } from "../../shared/wsl";
import {
  batchWslCommandsAsync,
  buildAgentCommand,
  createKnownSessionRef,
  detectAuthFile,
  readCommandOutputAsync,
  resolveWslHomeDirectory,
  readWslCommandOutput,
  readWslCommandOutputAsync,
  resolveExecutablePathAsync,
  resolveWslExecutablePath,
  type AgentAdapter,
  type AgentEnvContext,
  type AgentLaunchOptions,
  type CommandSpec,
  type CreateStructuredSessionInput,
  type StructuredSessionHandle,
  type StructuredSessionListener,
  type TerminalStatusHint,
} from "./base";
import { detectRateLimitPrompt } from "./codex/rateLimitPrompt";
import { probeCodexCapabilities, type CodexProbeResult } from "./codex/probe";
import {
  type CodexRolloutMeta,
  codexAuthPath,
  parseCodexRolloutIdFromPath,
  parseCodexRolloutMeta,
  parseCodexSessionIndex,
  readCodexSessionIndex,
} from "./codex/sessionFiles";

const defaultCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  bypassApprovalPolicy: "full-auto",
  settingDefs: [],
};

function applyProbeResult(probe: CodexProbeResult): AgentCapability {
  return {
    ...defaultCapabilities,
    ...(probe.models?.length ? { models: probe.models } : {}),
    ...(probe.efforts?.length ? { efforts: probe.efforts } : {}),
    ...(probe.defaultEffort ? { defaultEffort: probe.defaultEffort } : {}),
    ...(probe.modelEfforts ? { modelEfforts: probe.modelEfforts } : {}),
    ...(probe.approvalPolicies?.length ? { approvalPolicies: probe.approvalPolicies } : {}),
    ...(probe.sandboxModes?.length ? { sandboxModes: probe.sandboxModes } : {}),
  };
}

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
    return buildAgentCommand(location, "codex", args, wslExecPath);
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

  return buildAgentCommand(location, "codex", args, wslExecPath);
}

export function buildCodexAppServerCommand(
  location: ProjectLocation,
  remoteUrl: string,
  wslExecPath?: string,
): CommandSpec {
  const args = ["app-server", "--listen", remoteUrl, "--enable", CODEX_REMOTE_TUI_FEATURE];
  return buildAgentCommand(location, "codex", args, wslExecPath);
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

// eslint-disable-next-line no-unused-vars -- planned: structured SDK session support
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

      appServerOutput.push(text);
      if (appServerOutput.length > 12) {
        appServerOutput.shift();
      }
    });
    appServer.stderr?.on("data", (chunk) => {
      const text = String(chunk);

      appServerOutput.push(text);
      if (appServerOutput.length > 12) {
        appServerOutput.shift();
      }
    });


    const socket = await connectCodexAppServer(
      remoteUrl,
      appServer,
      appServerOutput,
      WebSocketCtor,
    );

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

    await this.initialize();
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

      await this.request("thread/resume", {
        ...threadOverrides,
        threadId: sessionRef.providerSessionId,
        persistExtendedHistory: true,
      });
      threadId = sessionRef.providerSessionId;
    } else {

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

        return;
      }
      await sleep(200);
    }

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

    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  async startTurn(prompt: string, config: ThreadConfig, segments?: PromptSegment[]): Promise<void> {
    const threadId = await this.waitForRemoteThreadId();

    // Build structured input using native Codex protocol types:
    //   - "localImage" for image attachments (path-based)
    //   - "mention"    for file reference segments (@-mentions)
    //   - "text"       for the prompt text
    const input: Record<string, unknown>[] = [];

    for (const seg of segments ?? []) {
      if (seg.kind === "attachment") {
        const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(seg.path);
        if (isImage) {
          input.push({ type: "localImage", path: seg.path });
        } else {
          input.push({
            type: "mention",
            path: seg.path,
            name: seg.path.split(/[\\/]/).pop() ?? seg.path,
          });
        }
      } else if (seg.kind === "file") {
        input.push({
          type: "mention",
          path: seg.path,
          name: seg.path.split(/[\\/]/).pop() ?? seg.path,
        });
      }
    }

    input.push({ type: "text", text: prompt, text_elements: [] });

    await this.request("turn/start", {
      threadId,
      input,
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

// Bulletproof Codex detection patterns
// - Case-insensitive matching
// - Handles emoji prefixes (✨, etc.)
// - Handles various whitespace and formatting
// - Works across chunk boundaries

const CODEX_UPDATE_RE = /(?:[✨⚡]\s*)?update\s+available/i;
const CODEX_READY_RE = /openai\s+codex/i;
const CODEX_DIRECTORY_RE = /directory\s*:/i;
const CODEX_MODEL_RE = new RegExp("\\/model\\s+to\\s+change", "i");
const CODEX_PROMPT_RE = /(?:^|\n)›(?:\s|\u00a0).*/m;
const CODEX_TITLE_RE = /0;([^\r\n]+)/g;

type CodexHintEntry = {
  re: RegExp;
  status: TerminalStatusHint["status"];
  attention: TerminalStatusHint["attention"];
};

const CODEX_STRONG_HINTS: CodexHintEntry[] = [
  { re: /enter\s+to\s+select/i, status: "needs_reply", attention: "needs_reply" },
  { re: /press enter to continue/i, status: "needs_reply", attention: "needs_reply" },
  { re: /\[y\/n\]|\(y\/N\)|allow\s+.*\?/i, status: "needs_approval", attention: "needs_approval" },
  { re: /•\s*working(?:\s*\(|…)?|esc\s+to\s+interrupt/i, status: "working", attention: "working" },
];

const CODEX_IDLE_HINTS: CodexHintEntry[] = [
  { re: CODEX_PROMPT_RE, status: "idle", attention: "none" },
];

/**
 * Detect a Codex TUI "Update available!" interactive prompt from
 * ANSI-stripped PTY output.
 *
 * Bulletproof against:
 * - Emoji prefixes (✨, ⚡, etc.)
 * - Case variations
 * - Extra whitespace
 * - Partial matches across chunks
 */
export function detectCodexUpdatePrompt(text: string): boolean {
  // Normalize: remove emoji, normalize whitespace, make case-insensitive
  const normalized = text
    .replace(/[✨⚡💡]\s*/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return CODEX_UPDATE_RE.test(normalized);
}

export function detectCodexReadyForInitialPrompt(text: string): boolean {
  // Early exit if update prompt is detected (takes precedence)
  if (detectCodexUpdatePrompt(text)) {
    return false;
  }

  // Normalize for case-insensitive matching
  const normalized = text.toLowerCase().replace(/\s+/g, " ");

  // All three patterns must be present, but order doesn't matter
  const hasReady = CODEX_READY_RE.test(normalized);
  const hasDirectory = CODEX_DIRECTORY_RE.test(normalized);
  const hasModel = CODEX_MODEL_RE.test(normalized);

  return hasReady && hasDirectory && hasModel;
}

function findBestCodexHint(text: string, entries: readonly CodexHintEntry[]): CodexHintEntry | null {
  let best: { index: number; entry: CodexHintEntry } | null = null;

  for (const entry of entries) {
    const globalRe = new RegExp(
      entry.re.source,
      entry.re.flags.includes("g") ? entry.re.flags : entry.re.flags + "g",
    );
    let last: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;
    while ((match = globalRe.exec(text)) !== null) {
      last = match;
    }
    if (last && (best === null || last.index > best.index)) {
      best = { index: last.index, entry };
    }
  }

  return best?.entry ?? null;
}

function findLastMatchIndex(text: string, re: RegExp): number {
  const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let lastIndex = -1;
  let match: RegExpExecArray | null;
  while ((match = globalRe.exec(text)) !== null) {
    lastIndex = match.index;
  }
  return lastIndex;
}

function findLastTitleIndex(text: string): number {
  return findLastMatchIndex(text, CODEX_TITLE_RE);
}

export function detectCodexTerminalStatus(text: string): TerminalStatusHint | null {
  const recent = text.slice(-1200);

  if (detectCodexUpdatePrompt(recent) || detectRateLimitPrompt(recent)) {
    return { status: "needs_reply", attention: "needs_reply", corroborated: true };
  }

  if (detectCodexReadyForInitialPrompt(recent) || detectCodexReadyForInitialPrompt(text)) {
    // Ready-for-initial-prompt requires three independent signals (ready + directory + model).
    return { status: "idle", attention: "none", corroborated: true };
  }

  const strongHint = findBestCodexHint(recent, CODEX_STRONG_HINTS);
  if (strongHint) {
    const lastWorkingIndex = findLastMatchIndex(recent, /•\s*working(?:\s*\(|…)?|esc\s+to\s+interrupt/i);
    const lastTitleIndex = findLastTitleIndex(recent);
    const lastPromptIndex = findLastMatchIndex(recent, CODEX_PROMPT_RE);
    const hasIdleRedraw =
      strongHint.status === "working" &&
      lastTitleIndex > lastWorkingIndex &&
      lastPromptIndex > lastTitleIndex;

    if (!hasIdleRedraw) {
      return { status: strongHint.status, attention: strongHint.attention, corroborated: true };
    }
  }

  const idleHint = findBestCodexHint(recent, CODEX_IDLE_HINTS);
  if (idleHint) {
    // Prompt cursor alone is a weak idle signal — not corroborated.
    return { status: idleHint.status, attention: idleHint.attention, corroborated: false };
  }

  return null;
}

function formatAppServerOutput(chunks: string[]): string {
  const text = chunks.join("").trim();
  return text ? ` Output: ${text}` : "";
}

export function createCodexAdapter(): AgentAdapter {
  let capabilities: AgentCapability = defaultCapabilities;
  const detectedWslExecPaths = new Map<string, string | undefined>();
  let preSpawnRolloutIds = new Set<string>();

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

  function readCodexSessionIndexForLocation(location: ProjectLocation) {
    if (location.kind === "wsl") {
      const result = readWslCommandOutput(location.distro, "sh", [
        "-lc",
        "cat ~/.codex/session_index.jsonl 2>/dev/null || true",
      ]);
      if (!result.ok || result.stdout.length === 0) {
        return [];
      }
      return parseCodexSessionIndex(result.stdout);
    }

    return readCodexSessionIndex();
  }

  function isInteractiveRollout(
    rollout: CodexRolloutMeta,
    location: ProjectLocation,
  ): boolean {
    if (rollout.originator !== "codex-tui" || rollout.source !== "cli") {
      return false;
    }

    if (!rollout.cwd) {
      return true;
    }

    switch (location.kind) {
      case "windows":
        return rollout.cwd === location.path;
      case "posix":
        return rollout.cwd === location.path;
      case "wsl":
        return rollout.cwd === location.linuxPath || rollout.cwd === location.uncPath;
    }
  }

  function readCodexRolloutsForLocation(location: ProjectLocation): CodexRolloutMeta[] {
    if (location.kind === "wsl") {
      const result = readWslCommandOutput(location.distro, "bash", [
        "-lc",
        "find ~/.codex/sessions -type f -name 'rollout-*.jsonl' -printf '%T@\\t%p\\n' 2>/dev/null",
      ]);
      if (!result.ok || result.stdout.length === 0) {
        console.log(
          "[codex] WSL rollout scan returned no output for %s: %s",
          describeLocation(location),
          result.stderr || "(no stderr)",
        );
        return [];
      }
      return result.stdout
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
          const [mtimeRaw, path] = line.split("\t");
          if (!path) return [];
          const updatedAt = Number.isFinite(Number(mtimeRaw))
            ? Math.round(Number(mtimeRaw) * 1000)
            : undefined;
          const id = parseCodexRolloutIdFromPath(path);
          if (!id) return [];
          const parsed: CodexRolloutMeta = { id, path, ...(updatedAt !== undefined ? { updatedAt } : {}) };
          return parsed ? [parsed] : [];
        });
    }

    const { readdirSync, readFileSync, statSync } = require("node:fs") as typeof import("node:fs");
    const root = join(require("node:os").homedir(), ".codex", "sessions");
    const rollouts: CodexRolloutMeta[] = [];
    const walk = (dir: string) => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        let stat: import("node:fs").Stats;
        try {
          stat = statSync(fullPath);
        } catch {
          continue;
        }
        const id = parseCodexRolloutIdFromPath(fullPath);
        if (!id) {
          continue;
        }
        let firstLine = "";
        try {
          firstLine = readFileSync(fullPath, "utf8").split(/\r?\n/g)[0] ?? "";
        } catch {
          // Ignore unreadable rollout files.
        }
        const parsed = parseCodexRolloutMeta(fullPath, firstLine, stat.mtimeMs);
        if (parsed && isInteractiveRollout(parsed, location)) {
          rollouts.push(parsed);
        }
      }
    };
    walk(root);
    return rollouts;
  }

  function readCodexRolloutMetaForLocation(
    location: ProjectLocation,
    rollout: CodexRolloutMeta,
  ): CodexRolloutMeta | undefined {
    if (location.kind === "wsl") {
      const result = readWslCommandOutput(location.distro, "head", [
        "-n",
        "1",
        "--",
        rollout.path,
      ]);
      if (!result.ok || result.stdout.length === 0) {
        console.log(
          "[codex] WSL rollout meta read failed for %s: path=%s stderr=%s",
          describeLocation(location),
          rollout.path,
          result.stderr || "(no stderr)",
        );
        return rollout;
      }
      return parseCodexRolloutMeta(rollout.path, result.stdout, rollout.updatedAt) ?? rollout;
    }

    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    try {
      const firstLine = readFileSync(rollout.path, "utf8").split(/\r?\n/g)[0] ?? "";
      return parseCodexRolloutMeta(rollout.path, firstLine, rollout.updatedAt) ?? rollout;
    } catch {
      return rollout;
    }
  }

  function describeLocation(location: ProjectLocation): string {
    switch (location.kind) {
      case "windows":
        return `windows:${location.path}`;
      case "wsl":
        return `wsl:${location.distro}:${location.linuxPath}`;
      case "posix":
        return `posix:${location.path}`;
    }
  }

  function resolveCodexSessionsWatchPath(location: ProjectLocation): string | undefined {
    switch (location.kind) {
      case "windows": {
        const { homedir } = require("node:os") as typeof import("node:os");
        return join(homedir(), ".codex", "sessions");
      }
      case "posix": {
        const { homedir } = require("node:os") as typeof import("node:os");
        return join(homedir(), ".codex", "sessions");
      }
      case "wsl": {
        const homeDir = resolveWslHomeDirectory(location.distro);
        return homeDir ? toWslUncPath(location.distro, `${homeDir}/.codex/sessions`) : undefined;
      }
    }
  }

  return {
    kind: "codex",
    label: "Codex",
    get capabilities() {
      return capabilities;
    },
    async detectInstall(ctx?: AgentEnvContext): Promise<AgentStatus> {
      const isWsl = ctx?.envKind === "wsl" && ctx.wslDistro;

      if (isWsl) {
        const [whichResult] = await batchWslCommandsAsync(ctx.wslDistro!, ["command -v codex"]);
        const executablePath = whichResult?.ok ? whichResult.stdout : undefined;
        detectedWslExecPaths.set(ctx.wslDistro!, executablePath);
        const versionResult = executablePath
          ? await readWslCommandOutputAsync(ctx.wslDistro!, executablePath, ["--version"])
          : undefined;

        if (executablePath) {
          const location: ProjectLocation = {
            kind: "wsl",
            distro: ctx.wslDistro!,
            linuxPath: "/tmp",
            uncPath: "\\\\wsl$",
          };
          const probeResult = await probeCodexCapabilities(location, {
            wslExecPath: executablePath,
            timeoutMs: 12_000,
            label: `codex:wsl:${ctx.wslDistro}`,
          });
          if (probeResult) {
            capabilities = applyProbeResult(probeResult);
          }
        }

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

      if (executablePath) {
        const { homedir } = await import("node:os");
        const probeResult = await probeCodexCapabilities(
          { kind: "windows", path: homedir() },
          { timeoutMs: 12_000, label: "codex:windows" },
        );
        if (probeResult) {
          capabilities = applyProbeResult(probeResult);
        }
      }

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
      const sessions = readCodexSessionIndexForLocation(location);
      const rollouts = readCodexRolloutsForLocation(location);
      preSpawnRolloutIds = new Set(rollouts.map((rollout) => rollout.id));
      console.log(
        "[codex] pre-spawn session snapshot (%s): sessionIndex=%d latestIndex=%s interactiveRollouts=%d",
        describeLocation(location),
        sessions.length,
        sessions.at(-1)?.id ?? "(none)",
        rollouts.length,
      );
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
    shouldDeferPromptToTerminal(config) {
      return config.mode === "plan";
    },
    buildTerminalPreInputs(config) {
      if (config.mode === "plan") {
        return [["/plan", "@wait:80", "\r"]];
      }
      return undefined;
    },
    buildDirectInput(prompt) {
      return [prompt, "@wait:80", "\r"];
    },
    isReadyForInitialPrompt(text) {
      return detectCodexReadyForInitialPrompt(text);
    },
    detectTerminalStatus(text) {
      return detectCodexTerminalStatus(text);
    },
    detectAutoResponse(text) {
      if (detectRateLimitPrompt(text)) return "2";
      return null;
    },
    initialSessionRefDiscoveryDelayMs: 1000,
    watchSessionRef(location, onChanged) {
      const watchPath = resolveCodexSessionsWatchPath(location);
      if (!watchPath) {
        return undefined;
      }

      try {
        const watcher = watch(watchPath, { recursive: true }, () => onChanged());
        watcher.on("error", () => {
          try {
            watcher.close();
          } catch {
            // Ignore watcher teardown races.
          }
        });
        console.log("[codex] session watcher active for %s at %s", describeLocation(location), watchPath);
        return () => {
          try {
            watcher.close();
          } catch {
            // Ignore watcher teardown races.
          }
        };
      } catch (error) {
        console.log(
          "[codex] session watcher unavailable for %s at %s: %s",
          describeLocation(location),
          watchPath,
          error instanceof Error ? error.message : String(error),
        );
        return undefined;
      }
    },
    async discoverSessionRef(location) {
      try {
        const sessions = readCodexSessionIndexForLocation(location);
        const rollouts = readCodexRolloutsForLocation(location);
        const newRollouts = rollouts
          .filter((rollout) => !preSpawnRolloutIds.has(rollout.id))
          .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
        let next: CodexRolloutMeta | undefined;
        for (const candidate of newRollouts) {
          const meta = readCodexRolloutMetaForLocation(location, candidate);
          if (meta && isInteractiveRollout(meta, location)) {
            next = meta;
            break;
          }
        }
        console.log(
          "[codex] discoverSessionRef (%s): sessionIndex=%d interactiveRollouts=%d preSpawnRollouts=%d newRollouts=%d latestIndex=%s candidate=%s originator=%s source=%s",
          describeLocation(location),
          sessions.length,
          rollouts.length,
          preSpawnRolloutIds.size,
          newRollouts.length,
          sessions.at(-1)?.id ?? "(none)",
          next?.id ?? "(none)",
          next?.originator ?? "(none)",
          next?.source ?? "(none)",
        );
        if (!next) {
          return undefined;
        }
        console.log("[codex] discovered interactive session id from rollout file: %s", next.id);
        return createKnownSessionRef(next.id);
      } catch (error) {
        console.log(
          "[codex] discoverSessionRef failed (%s): %s",
          describeLocation(location),
          error instanceof Error ? error.message : String(error),
        );
        return undefined;
      }
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
