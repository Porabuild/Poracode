import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import type {
  AgentCapability,
  AgentStatus,
  ThreadServerRequestId,
  ProjectLocation,
  SessionRef,
  ThreadAttention,
  ThreadConfig,
  ThreadStatus,
} from "../../shared/contracts";
import {
  buildWindowsCmdCommand,
  codexAuthPath,
  createKnownSessionRef,
  detectAuthFile,
  readCommandOutput,
  resolveExecutablePath,
  wrapWslCommand,
  type AgentAdapter,
  type AgentLaunchOptions,
  type CommandSpec,
  type CreateStructuredSessionInput,
  type StructuredSessionHandle,
  type StructuredSessionListener,
} from "./base";

const capabilities: AgentCapability = {
  models: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"],
  efforts: ["low", "medium", "high", "xhigh"],
  modes: ["agent"],
  approvalPolicies: ["on-request", "never", "untrusted"],
  sandboxModes: ["read-only", "workspace-write", "danger-full-access"],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server",
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
): CommandSpec {
  // When the structured session owns thread lifecycle, the TUI just connects.
  if (launchOptions?.suppressResumeConfigOverrides) {
    const args = buildCodexArgs(config, "", launchOptions);
    if (location.kind === "windows") {
      return buildWindowsCmdCommand(location.path, "codex", args);
    }
    return wrapWslCommand(location, "codex", args);
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
  return wrapWslCommand(location, "codex", args);
}

function buildCodexAppServerCommand(
  location: ProjectLocation,
  remoteUrl: string,
): CommandSpec {
  const args = [
    "app-server",
    "--listen",
    remoteUrl,
    "--session-source",
    "lightcode",
    "--enable",
    CODEX_REMOTE_TUI_FEATURE,
  ];

  if (location.kind === "windows") {
    return buildWindowsCmdCommand(location.path, "codex", args);
  }
  return wrapWslCommand(location, "codex", args);
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

class CodexStructuredSession implements StructuredSessionHandle {
  readonly launchOptions: AgentLaunchOptions;

  private readonly remoteUrl: string;
  private readonly appServer: ChildProcess;
  private readonly appServerOutput: string[] = [];
  private readonly socket: WebSocket;
  private listener: StructuredSessionListener | undefined;
  private isDisposed = false;
  private requestSequence = 0;
  private remoteThreadId: string | undefined;
  private currentThreadStatus: CodexThreadStatus = { type: "idle" };
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  private constructor(remoteUrl: string, appServer: ChildProcess, socket: WebSocket) {
    this.remoteUrl = remoteUrl;
    this.appServer = appServer;
    this.socket = socket;
    this.launchOptions = {
      enabledFeatures: [CODEX_REMOTE_TUI_FEATURE],
      remoteUrl,
      suppressResumeConfigOverrides: true,
    };
  }

  static async create(input: CreateStructuredSessionInput): Promise<CodexStructuredSession> {
    const port = await allocateLoopbackPort();
    const remoteUrl = `ws://127.0.0.1:${port}`;
    const appServer = spawnAppServer(
      buildCodexAppServerCommand(input.projectLocation, remoteUrl),
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
    const session = new CodexStructuredSession(remoteUrl, appServer, socket);
    session.appServerOutput.push(...appServerOutput);
    session.attachSocketHandlers();
    console.log("[codex app-server] sending initialize...");
    await session.initialize();
    console.log("[codex app-server] initialize complete");

    await session.openThread(input.config, input.sessionRef);

    return session;
  }

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;
  }

  async openThread(config: ThreadConfig, sessionRef?: SessionRef): Promise<void> {
    const threadOverrides = {
      model: config.model,
      ...(config.approvalPolicy ? { approvalPolicy: config.approvalPolicy } : {}),
      ...(config.sandboxMode ? { sandbox: config.sandboxMode } : {}),
    };

    if (sessionRef) {
      console.log("[codex app-server] thread/resume", sessionRef.providerSessionId);
      try {
        await this.request("thread/resume", {
          ...threadOverrides,
          threadId: sessionRef.providerSessionId,
        });
        return;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.log("[codex app-server] thread/resume failed, falling back to thread/start:", reason);
      }
    }

    console.log("[codex app-server] thread/start");
    await this.request("thread/start", threadOverrides);
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
        console.log(
          "[codex app-server] rate limits updated:",
          JSON.stringify(params.rateLimits),
        );
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

function formatAppServerOutput(chunks: string[]): string {
  const text = chunks.join("").trim();
  return text ? ` Output: ${text}` : "";
}

export function createCodexAdapter(): AgentAdapter {
  return {
    kind: "codex",
    label: "Codex CLI",
    capabilities,
    async detectInstall(): Promise<AgentStatus> {
      const executablePath = resolveExecutablePath("codex");
      const versionResult =
        executablePath === undefined ? undefined : readCommandOutput("codex", ["--version"]);

      return {
        kind: "codex",
        label: "Codex CLI",
        installed: executablePath !== undefined,
        ...(executablePath ? { executablePath } : {}),
        ...(versionResult?.ok ? { version: versionResult.stdout } : {}),
        authState: detectAuthFile(codexAuthPath()),
        capabilities,
      };
    },
    buildLaunchCommand(location, config, prompt, sessionRef, launchOptions) {
      return buildCommand(location, config, prompt, sessionRef, launchOptions);
    },
    buildResumeCommand(location, config, prompt, sessionRef, launchOptions) {
      return buildCommand(location, config, prompt, sessionRef, launchOptions);
    },
    createInitialSessionRef() {
      return undefined;
    },
    async createStructuredSession(input) {
      return CodexStructuredSession.create(input);
    },
    buildDirectInput(prompt) {
      return [...prompt, "\r"];
    },
  };
}
