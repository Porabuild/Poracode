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
  type SupervisorEventGap,
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
// Bound initialization separately from long-running runtime requests.
export const BACKEND_HOST_INITIALIZATION_DEADLINE_MS = 60_000;
const RESTART_DELAY_MS = 1_000;
const RESTART_MAX_DELAY_MS = 8_000;
// Five failed attempts allow 15s of backoff; five hung attempts take at most 315s.
const MAX_INITIALIZATION_FAILURES = 5;
const DISPOSE_TIMEOUT_MS = 1_000;
// Covers one 60s hung attempt, its 1s backoff, and 29s of replacement startup.
export const BACKEND_HOST_INIT_WAIT_TIMEOUT_MS = 90_000;

interface PendingRequest {
  resolve(value: unknown): void;
  reject(reason?: unknown): void;
}

interface InitializationWaiter {
  resolve(): void;
  reject(error: Error): void;
}

export interface BackendHostClientOptions {
  backendHostPath: string;
  initialize: BackendHostInitializePayload;
  resolveExtraEnv(): Record<string, string>;
  assignPid?(pid: number): Promise<void>;
  reportError?(error: unknown, tags?: PoracodeDiagnosticTags): void;
  /** Override for tests so recovery timeouts do not need fake waiter timers. */
  initWaitTimeoutMs?: number;
  onEvent(
    event: SupervisorEvent,
    rendererDeliveredDirect: boolean,
    rendererSequence?: number,
  ): void;
  /** Renderer-stream sequences the desktop-IPC fallback lost to host shedding; windows must rebuild. */
  onSupervisorEventGap?(gap: SupervisorEventGap): void;
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
 *
 * Initialization recovery is bounded: every failed initialization (a rejected
 * or hung initialize, a hung pid assignment, a crashed child, or a failed
 * fork) is retried with exponential backoff for at most
 * {@link MAX_INITIALIZATION_FAILURES} consecutive attempts before recovery
 * stops with a fatal error. Callers parked in `waitUntilInitialized` survive
 * transient failures — including spawn failures — within their own wait
 * budget instead of failing on the first bad attempt. Each child generation
 * issues at most one `start-supervisor`: a lifecycle caller parked across a
 * recovery shares the respawn's automatic restart instead of double-starting
 * the supervisor.
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
  private readonly initializationWaiters = new Set<InitializationWaiter>();
  /** True while the current child completed initialization; reset on exit or spawn failure. */
  private initializationSucceeded = false;
  private initializationFailures = 0;
  private fatalInitializationError: Error | null = null;
  /** Child terminated because its initialization failed; its exit is expected, not a crash. */
  private dismissedChild: ChildProcess | null = null;
  private currentExtraEnv: Record<string, string> = {};
  private supervisorStarted = false;
  /** Settled or in-flight start-supervisor for {@link supervisorStartFlightChild}. */
  private supervisorStartFlight: Promise<unknown> | null = null;
  private supervisorStartFlightChild: ChildProcess | null = null;
  private eventInterests: BackendEventInterests = {
    terminalThreadIds: [],
    runtimeThreadIds: [],
    allRuntimeEvents: false,
  };
  private syncedEventInterestsKey: string | null = null;
  private disposed = false;
  private rendererStreamInfo: BackendRendererStreamInfo | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

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

    child.on("message", (message: unknown) => {
      // A replaced child can still emit in-flight messages; they must never
      // mutate the state of the current child.
      if (this.child !== child) return;
      this.handleMessage(message);
    });
    child.on("error", (error) => this.reportProcessError(error));
    child.on("exit", (code) => this.handleExit(child, code));

    this.initializePromise = this.runInitialization(child, assignmentPromise);
    this.initializePromise.catch(() => undefined);
    if (this.supervisorStarted) {
      void this.initializePromise
        .then(() => {
          if (this.disposed || this.child !== child) return;
          return this.ensureSupervisorStartForChild();
        })
        .catch((error) => this.reportProcessError(error));
    }
  }

  private async runInitialization(
    child: ChildProcess,
    assignmentPromise: Promise<void>,
  ): Promise<unknown> {
    // Cover PID assignment and interest synchronization as well as the initial reply.
    // Late settlements must not revive an expired attempt or count its failure twice.
    let failureHandled = false;
    const deadline = Promise.withResolvers<never>();
    const deadlineError = new Error(
      `Backend host initialization did not complete within ${BACKEND_HOST_INITIALIZATION_DEADLINE_MS}ms.`,
    );
    const deadlineTimer = setTimeout(() => {
      if (failureHandled || this.disposed || this.child !== child) return;
      failureHandled = true;
      deadline.reject(deadlineError);
      this.handleInitializationFailure(child, deadlineError);
    }, BACKEND_HOST_INITIALIZATION_DEADLINE_MS);
    deadlineTimer.unref?.();
    try {
      const [result] = await Promise.race([
        Promise.all([
          this.request({
            version: BACKEND_HOST_PROTOCOL_VERSION,
            id: randomUUID(),
            operation: "initialize",
            payload: this.options.initialize,
          }),
          assignmentPromise,
        ]),
        deadline.promise,
      ]);
      // An expired attempt is dead even while this.child still points at the
      // terminated child during the respawn backoff.
      if (this.disposed || failureHandled || this.child !== child) return result;
      this.rendererStreamInfo = parseRendererStreamInfo(result);
      if (this.rendererStreamInfo) this.options.onRendererStreamInfo?.(this.rendererStreamInfo);
      await this.syncEventInterests(true);
      // The deadline can fire while the interests sync is in flight; a reply
      // that races the kill must not mark the failed attempt ready.
      if (this.disposed || failureHandled || this.child !== child) return result;
      this.initializationSucceeded = true;
      this.initializationFailures = 0;
      this.settleInitializationWaiters((waiter) => waiter.resolve());
      return result;
    } catch (error) {
      if (!failureHandled) {
        failureHandled = true;
        this.handleInitializationFailure(
          child,
          error instanceof Error ? error : new Error("Backend host initialization failed."),
        );
      }
      throw error;
    } finally {
      clearTimeout(deadlineTimer);
    }
  }

  private handleInitializationFailure(child: ChildProcess, error: Error): void {
    if (this.disposed) return;
    if (this.child === child) {
      // The child is still alive, so the failure is a reply (or a request
      // timeout) carrying the actual reason — report it and stop the child.
      this.reportProcessError(error);
      this.dismissedChild = child;
      // Settle this attempt's in-flight requests now: the respawn can win the
      // race against the terminated child's exit, whose handler would
      // otherwise never see them.
      this.rejectPendingRequests(error);
      terminateChildProcessTree(child);
    }
    this.countInitializationFailureAndRecover(error);
  }

  private countInitializationFailureAndRecover(lastError: Error): void {
    this.initializationFailures += 1;
    if (this.initializationFailures >= MAX_INITIALIZATION_FAILURES) {
      this.giveUpInitialization(lastError);
      return;
    }
    this.scheduleSpawnRetry();
  }

  private giveUpInitialization(lastError: Error): void {
    const fatal = new Error(
      `Backend host failed to initialize after ${MAX_INITIALIZATION_FAILURES} consecutive attempts: ${lastError.message}`,
    );
    this.fatalInitializationError = fatal;
    this.clearRestartTimer();
    this.reportProcessError(fatal);
    this.settleInitializationWaiters((waiter) => waiter.reject(fatal));
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
      case "supervisor-event-gap":
        this.options.onSupervisorEventGap?.(message);
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
    this.initializationSucceeded = false;
    const error = new Error(`Backend host exited with code ${code ?? "unknown"}.`);
    this.rejectPendingRequests(error);
    this.options.onReset();
    if (this.dismissedChild === child) {
      // Deliberately terminated after a failed initialization — recovery is
      // already owned (and bounded) by the initialization failure path.
      this.dismissedChild = null;
      return;
    }
    if (this.disposed) return;
    this.reportProcessError(error);
    this.scheduleSpawnRetry();
  }

  private handleSpawnFailure(error: Error): void {
    this.child = null;
    this.sender = null;
    this.initializePromise = Promise.reject(error);
    this.initializePromise.catch(() => undefined);
    this.reportProcessError(error);
    if (this.disposed) return;
    // Same survival contract as every other initialization failure: parked
    // waiters stay parked across the backoff and are settled by the retry,
    // the bounded give-up, or their own wait budget.
    this.countInitializationFailureAndRecover(error);
  }

  private scheduleSpawnRetry(): void {
    if (this.disposed || this.fatalInitializationError) return;
    this.clearRestartTimer();
    const backoffExponent = Math.max(this.initializationFailures - 1, 0);
    const delay = Math.min(RESTART_DELAY_MS * 2 ** backoffExponent, RESTART_MAX_DELAY_MS);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.disposed) return;
      this.spawn();
    }, delay);
    this.restartTimer.unref?.();
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private reportProcessError(error: unknown): void {
    this.options.reportError?.(error, { "poracode.feature_area": "backend-host" });
  }

  private settleInitializationWaiters(settle: (waiter: InitializationWaiter) => void): void {
    const waiters = [...this.initializationWaiters];
    this.initializationWaiters.clear();
    for (const waiter of waiters) settle(waiter);
  }

  private waitUntilInitialized(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("Backend host disposed."));
    if (this.fatalInitializationError) return Promise.reject(this.fatalInitializationError);
    if (this.initializationSucceeded) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const waiter: InitializationWaiter = {
        resolve: () => {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          resolve();
        },
        reject: (error: Error) => {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          reject(error);
        },
      };
      timeoutId = setTimeout(() => {
        timeoutId = undefined;
        this.initializationWaiters.delete(waiter);
        reject(new Error("Backend host initialization timed out."));
      }, this.options.initWaitTimeoutMs ?? BACKEND_HOST_INIT_WAIT_TIMEOUT_MS);
      timeoutId.unref?.();
      this.initializationWaiters.add(waiter);
    });
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

  /**
   * Sends `start-supervisor` at most once per child generation and shares the
   * flight with every requester for that child: the respawn hook and a
   * lifecycle caller parked across the recovery must not double-start the
   * supervisor, which the backend restarts unconditionally. A failed flight is
   * released so a later explicit caller can retry; a settled one stays cached
   * so repeated starts on a healthy child are idempotent.
   */
  private ensureSupervisorStartForChild(): Promise<unknown> {
    if (this.supervisorStartFlight && this.supervisorStartFlightChild === this.child) {
      return this.supervisorStartFlight;
    }
    const child = this.child;
    const flight = this.sendSupervisorLifecycleRequest("start-supervisor");
    this.supervisorStartFlight = flight;
    this.supervisorStartFlightChild = child;
    void flight.catch(() => {
      if (this.supervisorStartFlightChild === child) {
        this.supervisorStartFlight = null;
        this.supervisorStartFlightChild = null;
      }
    });
    return flight;
  }

  async startSupervisor(): Promise<void> {
    this.supervisorStarted = true;
    this.currentExtraEnv = this.options.resolveExtraEnv();
    this.resolveStartedGate();
    await this.waitUntilInitialized();
    await this.ensureSupervisorStartForChild();
  }

  async restartSupervisor(): Promise<void> {
    this.supervisorStarted = true;
    this.currentExtraEnv = this.options.resolveExtraEnv();
    this.resolveStartedGate();
    await this.waitUntilInitialized();
    // Explicit restart keeps force semantics: it never reuses the cached
    // start flight and always re-issues the request.
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
    this.settleInitializationWaiters((waiter) =>
      waiter.reject(new Error("Backend host disposed.")),
    );
    this.clearRestartTimer();
    const child = this.child;
    if (!child) return;

    try {
      await Promise.race([
        this.initializePromise
          .then(() =>
            this.request({
              version: BACKEND_HOST_PROTOCOL_VERSION,
              id: randomUUID(),
              operation: "dispose",
              payload: {},
            }),
          )
          .catch(() => undefined),
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
