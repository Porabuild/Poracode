import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { constants as osConstants, setPriority } from "node:os";
import type { Readable } from "node:stream";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  BACKEND_RENDERER_STREAM_VERSION,
  createBackendDatabaseRequest,
  createBackendServiceRequest,
  createBackendSupervisorRequest,
  isBackendHostOutboundMessage,
  type BackendEventInterests,
  type BackendBrowserEvent,
  type BackendHostInitializePayload,
  type BackendHostRequest,
  type BackendDatabaseProcedureName,
  type BackendNativeEvent,
  type BackendNativeRequest,
  type BackendServicePayload,
  type BackendServiceProcedureName,
  type BackendServiceResult,
  type BackendRendererStreamInfo,
} from "@/shared/backendHostProtocol";
import type { PoracodeDiagnosticTags } from "@/shared/diagnostics/sentryPrivacy";
import type {
  IpcProcedurePayload,
  IpcProcedureResult,
  SupervisorEvent,
  SupervisorProcedureName,
} from "@/shared/ipc";
import { terminateChildProcessTree } from "@/shared/processTree";
import { SupervisorIpcSender } from "@/supervisor/supervisorIpcSender";

const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const RESTART_DELAY_MS = 1_000;
const DISPOSE_TIMEOUT_MS = 1_000;
export const BACKEND_HOST_INIT_WAIT_TIMEOUT_MS = 15_000;

interface PendingRequest {
  resolve(value: unknown): void;
  reject(reason?: unknown): void;
}

export interface BackendHostClientOptions {
  backendHostPath: string;
  initialize: BackendHostInitializePayload;
  resolveExtraEnv(): Record<string, string>;
  assignPid?(pid: number): Promise<void>;
  reportError?(error: unknown, tags?: PoracodeDiagnosticTags): void;
  /** Override for tests so recovery timeouts do not need fake 15s timers. */
  initWaitTimeoutMs?: number;
  onEvent(
    event: SupervisorEvent,
    rendererDeliveredDirect: boolean,
    rendererSequence?: number,
  ): void;
  onReset(): void;
  handleNativeRequest?(request: BackendNativeRequest): Promise<unknown> | unknown;
  onNativeEvent?(event: BackendNativeEvent): void;
  onRendererStreamInfo?(info: BackendRendererStreamInfo): void;
}

function pipeChildStreamsToParent(child: ChildProcess): void {
  const pipeTo = (stream: Readable | null | undefined, output: NodeJS.WriteStream): void => {
    stream?.on("data", (chunk: string | Buffer) => output.write(chunk));
  };
  pipeTo(child.stdout, process.stdout);
  pipeTo(child.stderr, process.stderr);
}

/**
 * Versioned, bounded desktop transport for the out-of-process backend host.
 * The renderer-facing Electron main process owns only this proxy; SQLite event
 * durability and the supervisor/agent tree run in the backend child.
 */
export class BackendHostClient {
  private child: ChildProcess | null = null;
  private sender: SupervisorIpcSender<BackendHostRequest> | null = null;
  private initializePromise: Promise<unknown> = Promise.reject(
    new Error("Backend host has not started."),
  );
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly startedGate: Promise<void>;
  private resolveStartedGate!: () => void;
  private currentExtraEnv: Record<string, string> = {};
  private supervisorStarted = false;
  private eventInterests: BackendEventInterests = {
    terminalThreadIds: [],
    runtimeThreadIds: [],
    allRuntimeEvents: false,
  };
  private syncedEventInterestsKey: string | null = null;
  private disposed = false;
  private rendererStreamInfo: BackendRendererStreamInfo | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryGate: Promise<void> | null = null;
  private resolveRecoveryGate: (() => void) | null = null;
  private rejectRecoveryGate: ((error: Error) => void) | null = null;

  constructor(private readonly options: BackendHostClientOptions) {
    this.initializePromise.catch(() => undefined);
    this.startedGate = new Promise<void>((resolve) => {
      this.resolveStartedGate = resolve;
    });
    this.spawn();
  }

  private spawn(): void {
    if (this.disposed) return;
    let child: ChildProcess | null;
    try {
      child = fork(this.options.backendHostPath, [], {
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: process.env,
      });
    } catch (error) {
      this.handleSpawnFailure(
        error instanceof Error ? error : new Error("Failed to spawn backend host."),
      );
      return;
    }
    if (!child) {
      this.handleSpawnFailure(new Error("Failed to spawn backend host."));
      return;
    }
    this.child = child;
    this.syncedEventInterestsKey = null;
    pipeChildStreamsToParent(child);

    let assignmentPromise = Promise.resolve();
    if (typeof child.pid === "number") {
      if (this.options.initialize.supervisor.preferUiResponsiveness) {
        try {
          setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL);
        } catch (error) {
          this.reportProcessError(error);
        }
      }
      assignmentPromise =
        this.options.assignPid?.(child.pid).catch((error) => this.reportProcessError(error)) ??
        Promise.resolve();
    }

    const sender = new SupervisorIpcSender<BackendHostRequest>({
      send: (message, callback) => {
        if (this.child !== child || !child.connected) {
          callback(new Error("Backend-host IPC channel is disconnected."));
          return true;
        }
        return child.send(message, callback);
      },
      onError: (error) => this.reportProcessError(error),
      onFatalError: (error) => {
        this.rejectPendingRequests(error);
        if (this.child === child) terminateChildProcessTree(child);
      },
    });
    this.sender = sender;

    child.on("message", (message: unknown) => this.handleMessage(message));
    child.on("error", (error) => this.reportProcessError(error));
    child.on("exit", (code) => this.handleExit(child, code));

    this.initializePromise = Promise.all([
      this.request({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        id: randomUUID(),
        operation: "initialize",
        payload: this.options.initialize,
      }),
      assignmentPromise,
    ]).then(async ([result]) => {
      this.rendererStreamInfo = parseRendererStreamInfo(result);
      if (this.rendererStreamInfo) this.options.onRendererStreamInfo?.(this.rendererStreamInfo);
      await this.syncEventInterests(true);
      return result;
    });
    this.initializePromise.catch(() => undefined);
    if (this.recoveryGate) {
      void this.initializePromise.then(
        () => {
          this.resolveRecoveryGate?.();
          this.clearRecoveryGate();
        },
        (error: unknown) => {
          const initializationError =
            error instanceof Error ? error : new Error("Backend host initialization failed.");
          this.rejectRecoveryGate?.(initializationError);
          this.clearRecoveryGate();
          if (this.child === child) terminateChildProcessTree(child);
        },
      );
    }
    if (this.supervisorStarted) {
      void this.initializePromise
        .then(() => this.sendSupervisorLifecycleRequest("start-supervisor"))
        .catch((error) => this.reportProcessError(error));
    }
  }

  private handleMessage(message: unknown): void {
    if (!isBackendHostOutboundMessage(message)) {
      this.reportProcessError(new Error("Received an invalid backend-host IPC message."));
      return;
    }
    switch (message.kind) {
      case "reply": {
        const pending = this.pendingRequests.get(message.replyTo);
        if (!pending) return;
        this.pendingRequests.delete(message.replyTo);
        if (message.ok) pending.resolve(message.data);
        else pending.reject(new Error(message.error));
        return;
      }
      case "supervisor-event":
        if (message.rendererSequence === undefined) {
          this.options.onEvent(message.event, message.rendererDeliveredDirect === true);
        } else {
          this.options.onEvent(
            message.event,
            message.rendererDeliveredDirect === true,
            message.rendererSequence,
          );
        }
        return;
      case "supervisor-reset":
        this.options.onReset();
        return;
      case "native-request":
        void Promise.resolve(this.options.handleNativeRequest?.(message.request)).then(
          (data) => this.resolveNativeRequest(message.id, true, data),
          (error: unknown) =>
            this.resolveNativeRequest(
              message.id,
              false,
              error instanceof Error ? error.message : String(error),
            ),
        );
        return;
      case "native-event":
        this.options.onNativeEvent?.(message.event);
        return;
      case "error":
        this.options.reportError?.(new Error(message.message), message.tags);
    }
  }

  private handleExit(child: ChildProcess, code: number | null): void {
    if (this.child !== child) return;
    this.child = null;
    this.sender = null;
    const error = new Error(`Backend host exited with code ${code ?? "unknown"}.`);
    this.rejectPendingRequests(error);
    this.options.onReset();
    if (this.disposed) return;
    this.beginRecovery();
    this.reportProcessError(error);
    this.scheduleSpawnRetry();
  }

  private handleSpawnFailure(error: Error): void {
    this.child = null;
    this.sender = null;
    this.initializePromise = Promise.reject(error);
    this.initializePromise.catch(() => undefined);
    this.reportProcessError(error);
    this.rejectRecoveryGate?.(error);
    this.clearRecoveryGate();
    if (this.disposed) return;
    this.beginRecovery();
    this.scheduleSpawnRetry();
  }

  private scheduleSpawnRetry(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.disposed) return;
      this.spawn();
    }, RESTART_DELAY_MS);
    this.restartTimer.unref?.();
  }

  private reportProcessError(error: unknown): void {
    this.options.reportError?.(error, { "poracode.feature_area": "backend-host" });
  }

  private beginRecovery(): void {
    if (this.recoveryGate) return;
    this.recoveryGate = new Promise<void>((resolve, reject) => {
      this.resolveRecoveryGate = resolve;
      this.rejectRecoveryGate = reject;
    });
    this.recoveryGate.catch(() => undefined);
  }

  private clearRecoveryGate(): void {
    this.recoveryGate = null;
    this.resolveRecoveryGate = null;
    this.rejectRecoveryGate = null;
  }

  private async waitUntilInitialized(): Promise<void> {
    const recovery = this.recoveryGate;
    const ready = (recovery ?? Promise.resolve()).then(() => this.initializePromise);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Backend host initialization timed out."));
        }, this.options.initWaitTimeoutMs ?? BACKEND_HOST_INIT_WAIT_TIMEOUT_MS);
        timeoutId.unref?.();
        void ready.then(() => resolve(), reject);
      });
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      void ready.catch(() => undefined);
    }
  }

  private rejectPendingRequests(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      this.pendingRequests.delete(id);
      pending.reject(error);
    }
  }

  private request(request: BackendHostRequest): Promise<unknown> {
    const sender = this.sender;
    if (!sender) return Promise.reject(new Error("Backend host is not running."));

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.delete(request.id)) {
          reject(new Error(`Backend-host request "${request.operation}" timed out.`));
        }
      }, REQUEST_TIMEOUT_MS);
      timeout.unref?.();
      const settle = (callback: (value: unknown) => void, value: unknown): void => {
        clearTimeout(timeout);
        callback(value);
      };
      this.pendingRequests.set(request.id, {
        resolve: (value) => settle(resolve, value),
        reject: (reason) => settle(reject, reason),
      });
      sender.sendMessage(request);
    });
  }

  private sendSupervisorLifecycleRequest(
    operation: "start-supervisor" | "restart-supervisor",
  ): Promise<unknown> {
    return this.request({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: randomUUID(),
      operation,
      payload: { extraEnv: this.currentExtraEnv },
    });
  }

  private resolveNativeRequest(requestId: string, ok: boolean, value: unknown): void {
    if (this.disposed || !this.sender) return;
    void this.request({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: randomUUID(),
      operation: "resolve-native-request",
      payload: ok
        ? { requestId, ok: true, data: value }
        : { requestId, ok: false, error: String(value) },
    }).catch((error) => this.reportProcessError(error));
  }

  private syncEventInterests(skipEmpty = false): Promise<unknown> {
    const interests: BackendEventInterests = {
      terminalThreadIds: [...this.eventInterests.terminalThreadIds],
      runtimeThreadIds: [...this.eventInterests.runtimeThreadIds],
      allRuntimeEvents: this.eventInterests.allRuntimeEvents,
    };
    if (
      skipEmpty &&
      interests.terminalThreadIds.length === 0 &&
      interests.runtimeThreadIds.length === 0 &&
      !interests.allRuntimeEvents
    ) {
      return Promise.resolve(null);
    }
    const key = JSON.stringify(interests);
    if (this.syncedEventInterestsKey === key) return Promise.resolve(null);
    this.syncedEventInterestsKey = key;
    return this.request({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: randomUUID(),
      operation: "set-event-interests",
      payload: interests,
    }).catch((error: unknown) => {
      if (this.syncedEventInterestsKey === key) this.syncedEventInterestsKey = null;
      throw error;
    });
  }

  async setEventInterests(interests: BackendEventInterests): Promise<void> {
    this.eventInterests = {
      terminalThreadIds: [...new Set(interests.terminalThreadIds)].sort(),
      runtimeThreadIds: [...new Set(interests.runtimeThreadIds)].sort(),
      allRuntimeEvents: interests.allRuntimeEvents,
    };
    await this.waitUntilInitialized();
    await this.syncEventInterests();
  }

  async startSupervisor(): Promise<void> {
    this.supervisorStarted = true;
    this.currentExtraEnv = this.options.resolveExtraEnv();
    this.resolveStartedGate();
    await this.waitUntilInitialized();
    await this.sendSupervisorLifecycleRequest("start-supervisor");
  }

  async restartSupervisor(): Promise<void> {
    this.supervisorStarted = true;
    this.currentExtraEnv = this.options.resolveExtraEnv();
    this.resolveStartedGate();
    await this.waitUntilInitialized();
    await this.sendSupervisorLifecycleRequest("restart-supervisor");
  }

  async call<Name extends SupervisorProcedureName>(
    name: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>> {
    await this.startedGate;
    await this.waitUntilInitialized();
    const id = randomUUID();
    return this.request(createBackendSupervisorRequest(id, name, payload)) as Promise<
      IpcProcedureResult<Name>
    >;
  }

  async callDatabase<Name extends BackendDatabaseProcedureName>(
    name: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>> {
    await this.waitUntilInitialized();
    const id = randomUUID();
    return this.request(createBackendDatabaseRequest(id, name, payload)) as Promise<
      IpcProcedureResult<Name>
    >;
  }

  async callService<Name extends BackendServiceProcedureName>(
    name: Name,
    payload: BackendServicePayload<Name>,
  ): Promise<BackendServiceResult<Name>> {
    await this.waitUntilInitialized();
    return this.request(createBackendServiceRequest(randomUUID(), name, payload)) as Promise<
      BackendServiceResult<Name>
    >;
  }

  async getRendererStreamInfo(): Promise<BackendRendererStreamInfo> {
    await this.waitUntilInitialized();
    if (!this.rendererStreamInfo) throw new Error("Backend renderer stream is unavailable.");
    return this.rendererStreamInfo;
  }

  publishBrowserEvent(event: BackendBrowserEvent): void {
    this.sender?.sendMessage({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: randomUUID(),
      operation: "browser-event",
      payload: event,
    });
  }

  dispose(): void {
    void this.disposeAsync();
  }

  async disposeAsync(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.resolveStartedGate();
    this.rejectRecoveryGate?.(new Error("Backend host disposed."));
    this.clearRecoveryGate();
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const child = this.child;
    if (!child) return;

    try {
      await Promise.race([
        this.initializePromise.then(() =>
          this.request({
            version: BACKEND_HOST_PROTOCOL_VERSION,
            id: randomUUID(),
            operation: "dispose",
            payload: {},
          }),
        ),
        new Promise<void>((resolve) => setTimeout(resolve, DISPOSE_TIMEOUT_MS)),
      ]);
    } finally {
      if (this.child === child) {
        this.child = null;
        this.sender = null;
        this.rejectPendingRequests(new Error("Backend host disposed."));
        terminateChildProcessTree(child);
      }
    }
  }
}

function parseRendererStreamInfo(value: unknown): BackendRendererStreamInfo | null {
  if (typeof value !== "object" || value === null) return null;
  const stream = (value as { rendererStream?: unknown }).rendererStream;
  if (typeof stream !== "object" || stream === null) return null;
  const info = stream as Record<string, unknown>;
  return info.version === BACKEND_RENDERER_STREAM_VERSION &&
    typeof info.url === "string" &&
    typeof info.token === "string"
    ? { version: BACKEND_RENDERER_STREAM_VERSION, url: info.url, token: info.token }
    : null;
}
