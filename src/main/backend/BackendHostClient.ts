import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { constants as osConstants, setPriority } from "node:os";
import type { Readable } from "node:stream";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  createBackendDatabaseRequest,
  createBackendRevertCheckpointRequest,
  createBackendServiceRequest,
  createBackendSupervisorRequest,
  type RevertCheckpointHostCall,
  isBackendHostOutboundMessage,
  type BackendBrowserEvent,
  type BackendHostInitializePayload,
  type BackendHostRequest,
  type BackendDatabaseProcedureName,
  type BackendNativeEvent,
  type BackendNativeRequest,
  type BackendServicePayload,
  type BackendServiceProcedureName,
  type BackendServiceResult,
  type NativeThreadActivityChange,
} from "@/shared/backendHostProtocol";
import type { CheckpointRevertResult } from "@/shared/contracts";
import type { PoracodeDiagnosticTags } from "@/shared/diagnostics/sentryPrivacy";
import type { IpcQueueCapture, IpcQueueSample } from "@/shared/diagnostics/ipcQueueSample";
import type {
  IpcProcedurePayload,
  IpcProcedureResult,
  SupervisorProcedureName,
} from "@/shared/ipc";
import { awaitProcessTermination } from "@/shared/awaitProcessTermination";
import { SupervisorIpcSender } from "@/supervisor/supervisorIpcSender";

const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
/** Bound the main-process fallback queue shared by all renderer callers. */
export const BACKEND_HOST_MAX_PENDING_REQUESTS = 128;
// Bound initialization separately from long-running runtime requests.
export const BACKEND_HOST_INITIALIZATION_DEADLINE_MS = 60_000;
const RESTART_DELAY_MS = 1_000;
const RESTART_MAX_DELAY_MS = 8_000;
// Five failed attempts allow 15s of backoff; five hung attempts take at most 315s.
const MAX_INITIALIZATION_FAILURES = 5;
const DISPOSE_TIMEOUT_MS = 1_000;
/**
 * Bound between SIGTERM and SIGKILL for a backend child that cannot run its
 * own SIGTERM handler (a synchronously blocked event loop). It also gives a
 * healthy child room to finish its own bounded shutdown (including its 1s IPC
 * flush) before the forced kill. `disposeAsync` reserves twice this value
 * inside an explicit caller budget — the grace plus the bounded join after the
 * forced kill — so a blocked child cannot outlive the caller's shutdown
 * deadline still holding the profile lease.
 */
const DISPOSE_FORCE_KILL_GRACE_MS = 3_000;
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
  /** Opt-in local evidence; no payloads or delivery acknowledgments are collected. */
  queueDiagnostics?: IpcQueueCapture;
  /**
   * Bounded, coalesced native thread-activity deltas (A2). This is the ONLY
   * supervisor-derived state crossing backend→main; live renderer content
   * rides the loopback WS. Main applies the deltas to its sleep-blocker
   * working set. A supervisor restart follows with `onReset`.
   */
  onThreadActivity?(changes: readonly NativeThreadActivityChange[]): void;
  onReset(): void;
  handleNativeRequest?(request: BackendNativeRequest): Promise<unknown> | unknown;
  onNativeEvent?(event: BackendNativeEvent): void;
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
 *
 * A failed or fatally stuck generation is retired with the same bounded
 * SIGTERM → SIGKILL → actual-exit join that disposal uses, and its handle stays
 * reachable until that exit is confirmed: no successor is admitted while a
 * predecessor may still hold the data fence or its port, and a failed join
 * keeps the handle for a later disposal retry.
 */
export class BackendHostClient {
  private child: ChildProcess | null = null;
  private sender: SupervisorIpcSender<BackendHostRequest> | null = null;
  private initializePromise: Promise<unknown> = Promise.reject(
    new Error("Backend host has not started."),
  );
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private normalRequestAdmissions = 0;
  private readonly startedGate: Promise<void>;
  private resolveStartedGate!: () => void;
  private readonly initializationWaiters = new Set<InitializationWaiter>();
  /** True while the current child completed initialization; reset on exit or spawn failure. */
  private initializationSucceeded = false;
  private initializationFailures = 0;
  private fatalInitializationError: Error | null = null;
  /** Child terminated because its initialization failed; its exit is expected, not a crash. */
  private dismissedChild: ChildProcess | null = null;
  /**
   * A generation whose termination was requested but whose exit is not yet
   * confirmed. `this.child` may still point at it, or disposal may have
   * detached the routing reference. While set, no successor may be spawned:
   * the survivor can still own the data fence and its port. A failed bounded
   * join keeps this handle, so a later `disposeAsync` retries the escalation
   * instead of dropping the last reference to a live process.
   */
  private retiringChild: ChildProcess | null = null;
  /** In-flight bounded retirement for {@link retiringChild}, shared by overlapping callers. */
  private retirementPromise: Promise<void> | null = null;
  /** Shared join for overlapping `disposeAsync` callers; retryable after a retained join. */
  private disposalPromise: Promise<void> | null = null;
  private currentExtraEnv: Record<string, string> = {};
  private supervisorStarted = false;
  /** Settled or in-flight start-supervisor for {@link supervisorStartFlightChild}. */
  private supervisorStartFlight: Promise<unknown> | null = null;
  private supervisorStartFlightChild: ChildProcess | null = null;
  private disposed = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: BackendHostClientOptions) {
    this.initializePromise.catch(() => undefined);
    this.startedGate = new Promise<void>((resolve) => {
      this.resolveStartedGate = resolve;
    });
    this.spawn();
  }

  getQueueDiagnostics(): IpcQueueSample | undefined {
    return this.sender?.getQueueDiagnostics();
  }

  private spawn(): void {
    // A successor may never replace a generation that has not confirmed its
    // exit: a live predecessor still holds its custody (data fence/port).
    if (this.disposed || this.child || this.retiringChild) return;
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
      ...(this.options.queueDiagnostics ? { queueDiagnostics: this.options.queueDiagnostics } : {}),
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
        // The channel is permanently gone, so the child is retired with the
        // bounded escalation instead of SIGTERM only: a blocked or
        // SIGTERM-ignoring child must not outlive its replacement.
        if (this.child === child) void this.retireChild(child).catch(() => undefined);
      },
    });
    this.sender = sender;

    child.on("message", (message: unknown) => {
      // A replaced child can still emit in-flight messages; they must never
      // mutate the state of the current child.
      if (this.child !== child) return;
      this.handleMessage(message, child);
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
    // Cover PID assignment as well as the initial reply. Late settlements must
    // not revive an expired attempt or count its failure twice.
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
      // Retire with the bounded SIGTERM -> SIGKILL -> actual-exit join. The
      // parked respawn below is released only when this exit is confirmed
      // (scheduleSpawnRetry admits nothing while a handle is retained), so a
      // blocked or SIGTERM-ignoring child can never be left behind holding the
      // data fence or a port under a successor.
      void this.retireChild(child).catch(() => undefined);
    }
    this.countInitializationFailureAndRecover(error);
  }

  /**
   * Bounded retirement for one backend generation: SIGTERM, a bounded SIGKILL,
   * and the join on its actual exit. Single-flight per retained generation so
   * an initialization failure, an IPC-fatal callback, and a disposal that
   * overlap share one escalation instead of racing duplicates. A confirmed
   * exit clears the retained handle; a failed join keeps it, and no successor
   * may be admitted while it remains (see {@link spawn}).
   */
  private retireChild(child: ChildProcess): Promise<void> {
    if (this.retiringChild === child && this.retirementPromise) return this.retirementPromise;
    this.retiringChild = child;
    const retirement = awaitProcessTermination(child, { graceMs: DISPOSE_FORCE_KILL_GRACE_MS });
    this.retirementPromise = retirement;
    void retirement.then(
      () => {
        if (this.retiringChild === child) this.retiringChild = null;
        if (this.retirementPromise === retirement) this.retirementPromise = null;
      },
      (error: unknown) => {
        if (this.retirementPromise === retirement) this.retirementPromise = null;
        this.reportProcessError(error);
      },
    );
    return retirement;
  }

  /** Retry the bounded join for a generation retained by a failed escalation. */
  private async retireRetainedChild(): Promise<void> {
    const child = this.retiringChild;
    if (!child) return;
    await this.retireChild(child).catch(() => undefined);
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

  private handleMessage(message: unknown, child: ChildProcess): void {
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
      case "native-thread-activity":
        this.options.onThreadActivity?.(message.changes);
        return;
      case "supervisor-reset":
        this.options.onReset();
        return;
      case "native-request":
        void Promise.resolve()
          .then(() => {
            if (this.child !== child) return;
            return this.options.handleNativeRequest?.(message.request);
          })
          .then(
            (data) => this.resolveNativeRequest(child, message.id, true, data),
            (error: unknown) =>
              this.resolveNativeRequest(
                child,
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
    // An exit is the only evidence that retires a retained generation:
    // whatever requested its termination, the handle leaves the retry slot.
    if (this.retiringChild === child) this.retiringChild = null;
    const dismissed = this.dismissedChild === child;
    if (dismissed) this.dismissedChild = null;
    if (this.child !== child) return;
    this.child = null;
    this.sender = null;
    this.initializationSucceeded = false;
    const error = new Error(`Backend host exited with code ${code ?? "unknown"}.`);
    this.rejectPendingRequests(error);
    this.options.onReset();
    if (this.disposed) return;
    if (dismissed) {
      // Deliberately terminated after a failed initialization. The failure was
      // already counted; this confirmed exit is what releases the parked
      // respawn (a no-op once recovery gave up or disposal began).
      this.scheduleSpawnRetry();
      return;
    }
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
    // Respawn eligibility requires a confirmed predecessor retirement: a
    // retained or current generation may still hold the data fence/port.
    if (this.disposed || this.fatalInitializationError || this.child || this.retiringChild) {
      return;
    }
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

  private acquireNormalRequest(): () => void {
    if (this.normalRequestAdmissions >= BACKEND_HOST_MAX_PENDING_REQUESTS) {
      throw new Error("Backend-host request concurrency limit reached.");
    }
    this.normalRequestAdmissions += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.normalRequestAdmissions -= 1;
    };
  }

  private async withNormalRequest<Result>(operation: () => Promise<Result>): Promise<Result> {
    const release = this.acquireNormalRequest();
    try {
      return await operation();
    } finally {
      release();
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

  private resolveNativeRequest(
    child: ChildProcess,
    requestId: string,
    ok: boolean,
    value: unknown,
  ): void {
    // Disposal closes normal admission, but the retiring backend may need this
    // reply to finish its drain. A completion never transfers to a replacement.
    if (this.child !== child || !this.sender) return;
    void this.request({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: randomUUID(),
      operation: "resolve-native-request",
      payload: ok
        ? { requestId, ok: true, data: value }
        : { requestId, ok: false, error: String(value) },
    }).catch((error) => this.reportProcessError(error));
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
    return this.withNormalRequest(async () => {
      await this.startedGate;
      await this.waitUntilInitialized();
      return this.request(createBackendSupervisorRequest(randomUUID(), name, payload)) as Promise<
        IpcProcedureResult<Name>
      >;
    });
  }

  async callDatabase<Name extends BackendDatabaseProcedureName>(
    name: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>> {
    return this.withNormalRequest(async () => {
      await this.waitUntilInitialized();
      const id = randomUUID();
      return this.request(createBackendDatabaseRequest(id, name, payload)) as Promise<
        IpcProcedureResult<Name>
      >;
    });
  }

  async callService<Name extends BackendServiceProcedureName>(
    name: Name,
    payload: BackendServicePayload<Name>,
  ): Promise<BackendServiceResult<Name>> {
    return this.withNormalRequest(async () => {
      await this.waitUntilInitialized();
      return this.request(createBackendServiceRequest(randomUUID(), name, payload)) as Promise<
        BackendServiceResult<Name>
      >;
    });
  }

  /** WS2 stage 4: the backend-owned compound checkpoint revert. */
  async revertCheckpoint(payload: RevertCheckpointHostCall): Promise<CheckpointRevertResult> {
    return this.withNormalRequest(async () => {
      await this.waitUntilInitialized();
      return this.request(
        createBackendRevertCheckpointRequest(randomUUID(), payload),
      ) as Promise<CheckpointRevertResult>;
    });
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

  /**
   * Idempotent for overlapping callers: they share one disposal join. The
   * shared promise is dropped when a generation stays retained after a failed
   * bounded join, so a later call retries the escalation on that handle.
   */
  disposeAsync(options: { timeoutMs?: number } = {}): Promise<void> {
    if (this.disposalPromise) return this.disposalPromise;
    const disposal = this.performDisposal(options).then(
      () => this.settleDisposal(),
      (error: unknown) => {
        this.settleDisposal();
        throw error;
      },
    );
    this.disposalPromise = disposal;
    return disposal;
  }

  private settleDisposal(): void {
    if (this.retiringChild) this.disposalPromise = null;
  }

  private async performDisposal(options: { timeoutMs?: number }): Promise<void> {
    const child = this.child;
    if (this.disposed) {
      // Disposal already ran. A retained generation means its bounded join
      // could not confirm the exit, so this call retries that join on the
      // handle the earlier attempt kept reachable.
      await this.retireRetainedChild();
      return;
    }
    this.disposed = true;
    this.resolveStartedGate();
    this.settleInitializationWaiters((waiter) =>
      waiter.reject(new Error("Backend host disposed.")),
    );
    this.clearRestartTimer();
    if (!child) {
      await this.retireRetainedChild();
      return;
    }

    // The caller's budget also has to cover the forced-kill escalation below;
    // otherwise a blocked child survives the caller's own shutdown deadline.
    // The default window stays the full graceful window because its callers
    // (non-quit disposal) have no outer deadline to fit inside.
    const explicitBudgetMs = options.timeoutMs;
    const drainMs =
      explicitBudgetMs === undefined
        ? DISPOSE_TIMEOUT_MS
        : Math.max(0, explicitBudgetMs - DISPOSE_FORCE_KILL_GRACE_MS * 2);
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
        new Promise<void>((resolve) => setTimeout(resolve, drainMs)),
      ]);
    } finally {
      if (this.child === child) {
        this.child = null;
        this.sender = null;
        this.rejectPendingRequests(new Error("Backend host disposed."));
      }
      // SIGTERM first, then a bounded SIGKILL: the backend host installs a
      // SIGTERM handler, so a synchronously blocked loop can neither run the
      // handler nor exit, and SIGTERM alone would leave the child — and the
      // profile lease it owns — alive after the app is gone. Joining the
      // actual exit is the evidence that the owned resources were released.
      // The handle stays retained until that exit is confirmed, so a failed
      // join is retried by a later disposal instead of being dropped.
      await this.retireChild(child).catch(() => undefined);
    }
  }
}
