import {
  MessageChannelMain,
  utilityProcess,
  type ForkOptions,
  type MessagePortMain,
} from "electron";
import {
  REMOTE_HTTP_BRIDGE_PORT_CHANNEL,
  REMOTE_HTTP_BRIDGE_VERSION,
  REMOTE_HTTP_MAX_ACTIVE_REQUESTS,
  REMOTE_HTTP_MAX_ACTIVE_REQUESTS_PER_WINDOW,
  REMOTE_HTTP_REQUEST_TIMEOUT_MS,
  isRemoteHttpBridgeWorkerMessage,
  type RemoteHttpBridgeOpenDescriptor,
  type RemoteHttpBridgeOpenRequest,
  type RemoteHttpBridgeOpenResult,
  type RemoteHttpBridgePortEnvelope,
  type RemoteHttpBridgeStats,
} from "@/shared/remote/httpBridgeProtocol";
import { IPC_WINDOW_CHANNELS } from "@/shared/ipc/channels";
import {
  EMPTY_STATS,
  SPAWN_TIMEOUT_MS,
  STATS_QUERY_TIMEOUT_MS,
  clearTimer,
  readInspectExecArgv,
  unrefTimer,
  type ActiveRecord,
  type RemoteHttpBridgeRendererTarget,
  type RemoteHttpBridgeSupervisorOptions,
  type RemoteHttpBridgeUtilityProcessLike,
  type UtilityAttempt,
} from "./RemoteHttpBridgeSupervisorSupport";

export type {
  RemoteHttpBridgeRendererTarget,
  RemoteHttpBridgeSupervisorOptions,
  RemoteHttpBridgeUtilityProcessLike,
} from "./RemoteHttpBridgeSupervisorSupport";

export class RemoteHttpBridgeSupervisor {
  private readonly options: RemoteHttpBridgeSupervisorOptions;
  private readonly spawnTimeoutMs: number;
  private readonly createChannel: () => { port1: MessagePortMain; port2: MessagePortMain };
  private readonly forkUtility: (
    modulePath: string,
    options: ForkOptions,
  ) => RemoteHttpBridgeUtilityProcessLike;

  private child: RemoteHttpBridgeUtilityProcessLike | null = null;
  private attempt: UtilityAttempt | null = null;
  private currentGeneration = 0;
  private lastIssuedGeneration = 0;
  /** Bumped by shutdown; fences a start attempt that is still in flight. */
  private shutdownEpoch = 0;
  private startPromise: Promise<number> | null = null;
  private statsQueryId = 0;
  private readonly statsQueries = new Map<number, (stats: RemoteHttpBridgeStats | null) => void>();

  private readonly records = new Map<string, ActiveRecord>();
  private readonly senderCounts = new Map<number, number>();

  private openedRequests = 0;
  private rejectedRequests = 0;
  private utilityStarts = 0;

  constructor(options: RemoteHttpBridgeSupervisorOptions) {
    this.options = options;
    this.spawnTimeoutMs = options.spawnTimeoutMs ?? SPAWN_TIMEOUT_MS;
    this.createChannel = options.createChannel ?? (() => new MessageChannelMain());
    this.forkUtility =
      options.forkUtility ??
      ((modulePath, forkOptions) => utilityProcess.fork(modulePath, [], forkOptions));
  }

  get generation(): number {
    return this.currentGeneration;
  }

  /**
   * Admit one bridge request for the authenticated target.
   *
   * Admission reserves the record synchronously *before* awaiting the shared
   * start: the global/per-window caps therefore include pending starts, a
   * duplicate id cannot overwrite a pending record, and the record is visible
   * to `cancel`/`abortWindow` while the utility is still spawning. The
   * post-await revalidation is the fence that keeps a retired reservation (or a
   * document that navigated/died while starting) from ever dispatching.
   */
  async open(
    target: RemoteHttpBridgeRendererTarget,
    request: RemoteHttpBridgeOpenRequest,
  ): Promise<RemoteHttpBridgeOpenResult> {
    if (target.isDestroyed()) {
      this.rejectedRequests += 1;
      throw new Error("The requesting window is gone.");
    }
    if (this.records.has(request.requestId)) {
      this.rejectedRequests += 1;
      throw new Error("A remote request with this id is already active.");
    }
    if (this.records.size >= REMOTE_HTTP_MAX_ACTIVE_REQUESTS) {
      this.rejectedRequests += 1;
      throw new Error("Too many active remote requests.");
    }
    if ((this.senderCounts.get(target.id) ?? 0) >= REMOTE_HTTP_MAX_ACTIVE_REQUESTS_PER_WINDOW) {
      this.rejectedRequests += 1;
      throw new Error("Too many active remote requests for this window.");
    }

    const record: ActiveRecord = {
      requestId: request.requestId,
      senderId: target.id,
      generation: 0,
      state: "starting",
      cancelled: false,
      safetyTimer: null,
    };
    this.records.set(record.requestId, record);
    this.senderCounts.set(record.senderId, (this.senderCounts.get(record.senderId) ?? 0) + 1);

    const shutdownEpoch = this.shutdownEpoch;
    let generation: number;
    try {
      generation = await this.ensureStarted();
    } catch (error) {
      this.releaseRecord(record);
      throw error;
    }

    // Re-validate the authoritative lifecycle state after the await. The shared
    // start can outlive this caller's right to dispatch: a pre-port cancel or
    // window abort retires the reservation, another caller can only be here
    // with a different record, and shutdown/utility exit fences the generation.
    const child = this.child;
    if (record.cancelled || this.records.get(record.requestId) !== record) {
      this.releaseRecord(record);
      throw new Error("The remote request was retired before it could start.");
    }
    if (
      !child ||
      this.currentGeneration !== generation ||
      this.shutdownEpoch !== shutdownEpoch ||
      target.isDestroyed()
    ) {
      this.releaseRecord(record);
      throw new Error("The requesting window is gone.");
    }

    let rendererPort: MessagePortMain | null = null;
    try {
      const { port1, port2 } = this.createChannel();
      rendererPort = port2;
      record.generation = generation;
      record.state = "active";
      // Last-resort admission release: the utility's own 60 s deadline settles
      // every admitted request, so this only bounds a record whose settle
      // notification was lost (e.g. a malformed open never reaching the engine).
      // The timer is fenced by record identity: a reused id must never let this
      // stale timer cancel or release a newer record.
      const safetyTimer = setTimeout(() => {
        if (this.records.get(record.requestId) !== record) return;
        this.postToUtility({
          v: REMOTE_HTTP_BRIDGE_VERSION,
          kind: "cancel",
          generation: record.generation,
          requestId: record.requestId,
        });
        this.releaseRecord(record);
      }, REMOTE_HTTP_REQUEST_TIMEOUT_MS + 30_000);
      unrefTimer(safetyTimer);
      record.safetyTimer = safetyTimer;

      const descriptor: RemoteHttpBridgeOpenDescriptor = {
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "open",
        generation,
        senderId: target.id,
        requestId: request.requestId,
        url: request.url,
        method: request.method,
        headers: request.headers,
        hasBody: request.hasBody,
        bodyBytes: request.bodyBytes,
        ...(request.certFingerprint !== undefined
          ? { certFingerprint: request.certFingerprint }
          : {}),
      };
      const envelope: RemoteHttpBridgePortEnvelope = {
        channel: REMOTE_HTTP_BRIDGE_PORT_CHANNEL,
        v: REMOTE_HTTP_BRIDGE_VERSION,
        requestId: request.requestId,
        generation,
      };
      child.postMessage(descriptor, [port1]);
      target.postMessage(IPC_WINDOW_CHANNELS.remoteHttpBridgePort, envelope, [port2]);
    } catch (error) {
      this.releaseRecord(record);
      try {
        rendererPort?.close();
      } catch {
        // Already transferred or closed.
      }
      // The utility may already hold its port half; cancel by id so it never
      // keeps fetching for a request the renderer never received.
      this.postToUtility({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "cancel",
        generation,
        requestId: request.requestId,
      });
      throw error;
    }
    this.openedRequests += 1;
    return { generation };
  }

  /** Renderer-side cancel fallback for a request whose port has not attached. */
  cancel(senderId: number, requestId: string): void {
    const record = this.records.get(requestId);
    if (!record || record.senderId !== senderId) return;
    if (record.state === "starting") {
      // Nothing was dispatched for this reservation yet: retire it so the
      // pending open cannot dispatch or hand a port to the window afterwards.
      record.cancelled = true;
      this.releaseRecord(record);
      return;
    }
    if (record.generation !== this.currentGeneration) return;
    this.postToUtility({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "cancel",
      generation: record.generation,
      requestId,
    });
  }

  /** Abort every request owned by one renderer window (navigation/close/crash). */
  abortWindow(senderId: number, reason = "window-closed"): number {
    const owned = [...this.records.values()].filter((record) => record.senderId === senderId);
    if (owned.length === 0) return 0;
    const dispatched = owned.some((record) => record.state === "active");
    for (const record of owned) {
      record.cancelled = true;
      this.releaseRecord(record);
    }
    if (dispatched) {
      this.postToUtility({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "abort-window",
        generation: this.currentGeneration,
        senderId,
      });
    }
    this.options.log?.(
      `[poracode] remote-http-bridge aborted ${owned.length} request(s) reason=${reason}`,
    );
    return owned.length;
  }

  /**
   * Attach lifecycle fencing to one window: destruction, renderer crash, and
   * main-frame navigation all retire that window's active requests so a stale
   * document can never consume a response.
   */
  watchWebContents(contents: {
    readonly id: number;
    on(event: "destroyed", listener: () => void): unknown;
    on(event: "render-process-gone", listener: () => void): unknown;
    on(
      event: "did-start-navigation",
      listener: (details: {
        readonly isMainFrame: boolean;
        readonly isSameDocument: boolean;
      }) => void,
    ): unknown;
  }): void {
    contents.on("destroyed", () => {
      this.abortWindow(contents.id, "window-destroyed");
    });
    contents.on("render-process-gone", () => {
      this.abortWindow(contents.id, "render-process-gone");
    });
    contents.on("did-start-navigation", (details) => {
      if (details.isMainFrame && !details.isSameDocument) {
        this.abortWindow(contents.id, "main-frame-navigation");
      }
    });
  }

  /** Query the utility's payload-free counters; null when no utility is alive. */
  queryStats(): Promise<RemoteHttpBridgeStats | null> {
    if (!this.child) return Promise.resolve(null);
    const queryId = ++this.statsQueryId;
    return new Promise<RemoteHttpBridgeStats | null>((resolve) => {
      const timer = setTimeout(() => {
        this.statsQueries.delete(queryId);
        resolve(null);
      }, STATS_QUERY_TIMEOUT_MS);
      unrefTimer(timer);
      this.statsQueries.set(queryId, (stats) => {
        clearTimeout(timer);
        resolve(stats);
      });
      this.postToUtility({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "stats-query",
        generation: this.currentGeneration,
        queryId,
      });
    });
  }

  /** Main-side, payload-free lifecycle counters. */
  localStats(): {
    readonly activeRequests: number;
    readonly openedRequests: number;
    readonly rejectedRequests: number;
    readonly utilityStarts: number;
    readonly generation: number;
  } {
    return {
      activeRequests: this.records.size,
      openedRequests: this.openedRequests,
      rejectedRequests: this.rejectedRequests,
      utilityStarts: this.utilityStarts,
      generation: this.currentGeneration,
    };
  }

  /** Abort all in-flight work and stop the utility (app quit). */
  shutdown(): void {
    // Fence any in-flight start: a child that spawns after this point is
    // retired, never published, and never receives a request.
    this.shutdownEpoch += 1;
    const attempt = this.attempt;
    if (attempt && !attempt.retired) {
      if (this.child === attempt.child) {
        // Published child: tell it to abort, then cut it down.
        this.postToUtility({
          v: REMOTE_HTTP_BRIDGE_VERSION,
          kind: "abort-all",
          generation: this.currentGeneration,
        });
      }
      if (attempt.child === this.child) {
        this.retireAttempt(attempt);
      } else {
        // Starting child: kill it now; its pending start settles through the
        // exit event or the bounded spawn deadline, and start() refuses to
        // publish a retired child.
        attempt.retired = true;
        this.killChild(attempt.child);
      }
    }
    this.attempt = null;
    this.child = null;
    this.currentGeneration = 0;
    this.clearRecords();
    for (const resolve of this.statsQueries.values()) resolve(null);
    this.statsQueries.clear();
  }

  private async ensureStarted(): Promise<number> {
    if (this.child) return this.currentGeneration;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.start();
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async start(): Promise<number> {
    // Consume the generation *before* forking: every attempted fork owns a
    // monotonically increasing generation, so a retry after any start failure
    // can never reuse a generation a stale frame might still carry.
    const generation = this.lastIssuedGeneration + 1;
    this.lastIssuedGeneration = generation;
    const shutdownEpoch = this.shutdownEpoch;
    const env = this.options.env ?? process.env;
    const execArgv = readInspectExecArgv(env, this.options.isPackaged ?? false);
    const forkOptions: ForkOptions = {
      env,
      stdio: ["ignore", "inherit", "inherit"],
      serviceName: "Poracode Remote HTTP Bridge",
      ...(execArgv ? { execArgv } : {}),
    };
    const child = this.forkUtility(this.options.utilityPath, forkOptions);
    const attempt: UtilityAttempt = {
      child,
      generation,
      retired: false,
      spawnTimer: null,
      detach: null,
    };
    this.attempt = attempt;
    try {
      await this.waitForSpawn(attempt);
    } catch (error) {
      if (this.attempt === attempt) this.attempt = null;
      if (shutdownEpoch !== this.shutdownEpoch) {
        throw new Error("The remote HTTP bridge was shut down while starting.", { cause: error });
      }
      throw error;
    }
    if (attempt.retired || shutdownEpoch !== this.shutdownEpoch) {
      // Shut down (or timed out) while this child was starting: never publish
      // a late child.
      this.retireAttempt(attempt);
      if (this.attempt === attempt) this.attempt = null;
      throw new Error("The remote HTTP bridge was shut down while starting.");
    }
    const onExit = (code: number | null) => this.handleExit(attempt, code);
    const onMessage = (message: unknown) => this.handleWorkerMessage(generation, message);
    child.on("exit", onExit);
    child.on("message", onMessage);
    attempt.detach = () => {
      child.off?.("exit", onExit);
      child.off?.("message", onMessage);
    };
    this.child = child;
    this.currentGeneration = generation;
    this.utilityStarts += 1;
    this.options.log?.(
      `[poracode] remote-http-bridge utility started generation=${generation} pid=${child.pid ?? "unknown"}`,
    );
    return generation;
  }

  /**
   * Wait for one attempt's spawn with a bounded deadline. Both listeners and
   * the timer are detached on either outcome, and a failure retires and kills
   * the owned child so no orphan outlives a start that never published.
   */
  private waitForSpawn(attempt: UtilityAttempt): Promise<void> {
    const { child } = attempt;
    if (child.pid !== undefined) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        child.off?.("spawn", onSpawn);
        child.off?.("exit", onExit);
        clearTimer(attempt.spawnTimer);
        attempt.spawnTimer = null;
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        attempt.retired = true;
        this.killChild(child);
        reject(error);
      };
      const onSpawn = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onExit = (code: number | null) => {
        fail(
          new Error(`The remote HTTP bridge utility exited before start (code ${String(code)}).`),
        );
      };
      attempt.spawnTimer = setTimeout(() => {
        fail(new Error("The remote HTTP bridge utility did not start."));
      }, this.spawnTimeoutMs);
      unrefTimer(attempt.spawnTimer);
      child.once("spawn", onSpawn);
      child.on("exit", onExit);
    });
  }

  /** Retire one attempt: detach listeners/timer without killing its child. */
  private releaseAttempt(attempt: UtilityAttempt): void {
    attempt.retired = true;
    clearTimer(attempt.spawnTimer);
    attempt.spawnTimer = null;
    attempt.detach?.();
    attempt.detach = null;
    if (this.child === attempt.child) {
      this.child = null;
      this.currentGeneration = 0;
    }
  }

  /** Retire and kill one owned attempt (start failure, shutdown, restart). */
  private retireAttempt(attempt: UtilityAttempt): void {
    const alreadyRetired = attempt.retired;
    this.releaseAttempt(attempt);
    if (!alreadyRetired) this.killChild(attempt.child);
  }

  private killChild(child: RemoteHttpBridgeUtilityProcessLike): void {
    try {
      child.kill();
    } catch (error) {
      this.options.log?.(
        `[poracode] remote-http-bridge kill failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private handleExit(attempt: UtilityAttempt, code: number | null): void {
    if (this.child !== attempt.child && this.attempt !== attempt) return;
    // The child exited on its own; do not send it a redundant kill.
    this.releaseAttempt(attempt);
    if (this.attempt === attempt) this.attempt = null;
    const active = this.records.size;
    this.clearRecords();
    for (const resolve of this.statsQueries.values()) resolve(null);
    this.statsQueries.clear();
    this.options.log?.(
      `[poracode] remote-http-bridge utility exited generation=${attempt.generation} code=${String(code)} activeRejected=${active}`,
    );
  }

  private handleWorkerMessage(generation: number, message: unknown): void {
    if (generation !== this.currentGeneration) return;
    if (!isRemoteHttpBridgeWorkerMessage(message)) return;
    // The frame must carry the generation of the child that produced it: a
    // delayed settle for a retired generation must never release a record
    // whose id was reused after a restart.
    if (message.generation !== generation) return;
    if (message.kind === "stats-reply") {
      const resolve = this.statsQueries.get(message.queryId);
      if (resolve) {
        this.statsQueries.delete(message.queryId);
        resolve(message.stats);
      }
      return;
    }
    const record = this.records.get(message.requestId);
    // Starting reservations carry generation 0 and were never dispatched, so a
    // settle (including a utility-side rejection notice) can only release the
    // exact active dispatch of that generation.
    if (!record || record.generation !== generation) return;
    this.releaseRecord(record);
    this.options.onSettled?.(message);
  }

  /**
   * Release one reservation exactly once. Fenced by expected-record identity:
   * a stale continuation, safety timer, or settlement path can never delete a
   * newer record that reused the same request id.
   */
  private releaseRecord(record: ActiveRecord): void {
    if (this.records.get(record.requestId) !== record) return;
    this.records.delete(record.requestId);
    if (record.safetyTimer !== null) {
      clearTimeout(record.safetyTimer);
      record.safetyTimer = null;
    }
    const count = (this.senderCounts.get(record.senderId) ?? 1) - 1;
    if (count <= 0) this.senderCounts.delete(record.senderId);
    else this.senderCounts.set(record.senderId, count);
  }

  /** Drop every reservation, clearing its safety timer (exit/shutdown paths). */
  private clearRecords(): void {
    for (const record of this.records.values()) {
      if (record.safetyTimer !== null) {
        clearTimeout(record.safetyTimer);
        record.safetyTimer = null;
      }
    }
    this.records.clear();
    this.senderCounts.clear();
  }

  private postToUtility(message: unknown): void {
    try {
      this.child?.postMessage(message);
    } catch (error) {
      this.options.log?.(
        `[poracode] remote-http-bridge post failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Stats for a supervisor with no live utility (diagnostics/test fallback). */
  static emptyStats(): RemoteHttpBridgeStats {
    return { ...EMPTY_STATS };
  }
}
