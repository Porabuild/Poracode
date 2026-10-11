import {
  CLIENT_ENGINE_AUX_IN_FLIGHT,
  CLIENT_ENGINE_AUX_MAX_BYTES,
  CLIENT_ENGINE_AUX_MAX_PENDING,
  CLIENT_ENGINE_AUX_STRINGIFY_MAX_BYTES,
  CLIENT_ENGINE_INLINE_FALLBACK_MAX_CHARS,
  CLIENT_ENGINE_LANE_IN_FLIGHT,
  CLIENT_ENGINE_LANE_MAX_AGE_MS,
  CLIENT_ENGINE_LANE_MAX_BYTES,
  CLIENT_ENGINE_LANE_MAX_PENDING,
  CLIENT_ENGINE_MAX_BYTES,
  CLIENT_ENGINE_MAX_IN_FLIGHT,
  CLIENT_ENGINE_MAX_PENDING,
  CLIENT_ENGINE_PROTOCOL_VERSION,
  CLIENT_ENGINE_TIMEOUT_MS,
  CLIENT_ENGINE_TRANSPORT_WATCHDOG_MS,
  type ClientEngineRequest,
  type ClientEngineResponse,
  type ClientEngineWorkRequest,
} from "./protocol";
import { ClientEngineTransportLedger } from "./clientEngineTransportLedger";
import { projectJsonBytes } from "./jsonProjection";
import {
  decodeDesktopFrame,
  decodeRemoteSocketFrame,
  measuredRawBytes,
  parseJsonValue,
  stringifyJsonValue,
  type DecodeFrameResult,
  type DesktopFrameDecodeResult,
  type JsonParseResult,
  type JsonStringifyResult,
} from "./decode";
import {
  ClientEngineAuxInputTooLargeError,
  ClientEngineLaneDisposedError,
  ClientEngineLaneOverflowError,
  ClientEngineLaneSupersededError,
  ClientEngineProtocolMismatchError,
  ClientEngineTimeoutError,
  ClientEngineWorkerUnavailableError,
  type ClientEngineWorkerMode,
} from "./clientEngineErrors";
import {
  ClientEngineLane,
  type ClientEngineLaneHost,
  type ClientEngineLaneOptions,
  type ClientEngineLaneState,
  type ClientEngineLaneWork,
} from "./clientEngineLane";
import { ClientEngineWorkerLink } from "./clientEngineWorkerLink";

type QueuedWork = ClientEngineLaneWork;

type AuxWork =
  | { readonly type: "parse-json"; readonly raw: string }
  | {
      readonly type: "stringify-json";
      readonly value: unknown;
      /** Bounded producer-side projection, charged instead of a fixed floor so
       * an unbounded graph cannot ride the aux lane. */
      readonly projectedBytes: number;
    };

type EngineWork = QueuedWork | AuxWork;

interface LaneEntry {
  readonly id: number;
  readonly lane: LaneState;
  readonly laneGeneration: number;
  readonly work: EngineWork;
  readonly bytes: number;
  readonly enqueuedAt: number;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly fallback: (() => unknown) | null;
  timeout: ReturnType<typeof setTimeout> | null;
  posted: boolean;
}

interface LaneState extends ClientEngineLaneState {
  readonly maxPending: number;
  readonly maxBytes: number;
  readonly maxAgeMs: number;
  readonly inFlightLimit: number;
  generation: number;
  queue: LaneEntry[];
  /** Payload bytes retained by queued entries (not yet posted). */
  queuedBytes: number;
  /** Payload bytes retained by posted entries until their response or an
   * authoritative discard releases them. Counted against the same byte budget
   * as `queuedBytes`; the old accounting released the charge at post time and
   * let a lane retain an in-flight window of full-size frames for free. */
  inFlightBytes: number;
  inFlight: number;
  ageTimer: ReturnType<typeof setTimeout> | null;
  /** Latched after a lane-level failure (overflow/timeout/age): no later frame
   * may be admitted until `renew()` (new connection) or worker recovery. */
  failed: boolean;
  /** The latch was caused by the worker dying; cleared when a new worker
   * actually serves work again. Lane-level failures are only cleared by renew. */
  workerFailed: boolean;
  readonly overflowListeners: Set<() => void>;
}

let remoteSocketEngine: ClientEngineHost | null = null;
let persistJsonEngine: ClientEngineHost | null = null;
let managedLoopbackEngine: ClientEngineHost | null = null;

/** Engine for paired remote event-socket frame decoding (`eventSocketSession`).
 * One lane per paired host connection keeps host A's flood out of host B. */
export function getRemoteSocketEngine(): ClientEngineHost {
  remoteSocketEngine ??= new ClientEngineHost();
  return remoteSocketEngine;
}

/** Engine for large Zustand persist JSON work (`dbStorage`). */
export function getPersistJsonEngine(): ClientEngineHost {
  persistJsonEngine ??= new ClientEngineHost();
  return persistJsonEngine;
}

/**
 * Engine for the managed desktop loopback leg (A3). Deliberately separate from
 * the paired-session engine: the product's own primary leg must not queue
 * behind a paired host's flood. This is a small pool (managed / paired /
 * persist), never one worker per thread.
 */
export function getManagedLoopbackEngine(): ClientEngineHost {
  managedLoopbackEngine ??= new ClientEngineHost();
  return managedLoopbackEngine;
}

export function resetClientEngineHostForTests(): void {
  remoteSocketEngine?.dispose();
  remoteSocketEngine = null;
  persistJsonEngine?.dispose();
  persistJsonEngine = null;
  managedLoopbackEngine?.dispose();
  managedLoopbackEngine = null;
}

const AUX_LANE_KEY = "\u0000aux";

/** Engine-wide budgets; defaults are the protocol constants and the overrides
 * exist so tests can exercise the bounds without allocating full-size frames. */
export interface ClientEngineHostOptions {
  readonly maxPending?: number;
  readonly maxBytes?: number;
  readonly maxInFlight?: number;
}

export class ClientEngineHost implements ClientEngineLaneHost {
  private nextId = 1;
  private readonly lanes = new Map<string, LaneState>();
  private readonly laneOrder: LaneState[] = [];
  private readonly pendingById = new Map<number, LaneEntry>();
  private auxLane: LaneState | null = null;
  private totalQueued = 0;
  private totalInFlight = 0;
  /** Sum of `bytes` over every entry in `pendingById` (queued + posted). The
   * engine-level retained-payload charge; decremented exactly where an entry
   * leaves `pendingById`, never at post time. */
  private retainedPayloadBytes = 0;
  private readonly maxPending: number;
  private readonly maxBytes: number;
  private readonly maxInFlight: number;
  /** Outstanding memory credits for posted messages whose consumer callback
   * already settled. They are counted against `maxPending`/`maxBytes` and
   * released only by a worker response for the id or actual termination. */
  private readonly transport = new ClientEngineTransportLedger({
    watchdogMs: CLIENT_ENGINE_TRANSPORT_WATCHDOG_MS,
    onWatchdog: () => this.retireHungWorker(),
  });
  private roundRobinIndex = 0;
  private disposed = false;
  private readonly workerLink = new ClientEngineWorkerLink({
    onResponse: (response) => this.onWorkerMessage(response),
    onStaleResponse: (response) => this.onStaleWorkerMessage(response),
    onProtocolMismatch: () => this.handleProtocolMismatch(),
    onUnavailable: () => this.failWorker(),
    onRecovered: () => this.clearWorkerFailedLanes(),
  });

  constructor(options: ClientEngineHostOptions = {}) {
    this.maxPending = options.maxPending ?? CLIENT_ENGINE_MAX_PENDING;
    this.maxBytes = options.maxBytes ?? CLIENT_ENGINE_MAX_BYTES;
    this.maxInFlight = options.maxInFlight ?? CLIENT_ENGINE_MAX_IN_FLIGHT;
  }

  /** True when the platform provides a Worker constructor at all. Consumers
   * that must preserve pre-A3 synchronous receive ordering on worker-less
   * platforms check this before routing frames through a lane. */
  isWorkerSupported(): boolean {
    return this.workerLink.isSupported();
  }

  /** Worker state right now: "unsupported" (no Worker global), "active", or
   * "unavailable" after a crash/version mismatch. */
  workerMode(): ClientEngineWorkerMode {
    return this.workerLink.mode;
  }

  /** Materializes the worker when possible; false means off-thread work is not
   * currently available (platform lacks Worker, or it failed and is within a
   * bounded re-probe backoff). */
  isWorkerActive(): boolean {
    return this.workerLink.ensure() !== null;
  }

  createLane(options: ClientEngineLaneOptions): ClientEngineLane {
    const existing = this.lanes.get(options.key);
    if (existing) this.disposeLane(existing);
    const state: LaneState = {
      key: options.key,
      maxPending: options.maxPending ?? CLIENT_ENGINE_LANE_MAX_PENDING,
      maxBytes: options.maxBytes ?? CLIENT_ENGINE_LANE_MAX_BYTES,
      maxAgeMs: options.maxAgeMs ?? CLIENT_ENGINE_LANE_MAX_AGE_MS,
      inFlightLimit: options.inFlight ?? CLIENT_ENGINE_LANE_IN_FLIGHT,
      generation: 0,
      queue: [],
      queuedBytes: 0,
      inFlightBytes: 0,
      inFlight: 0,
      ageTimer: null,
      failed: false,
      workerFailed: false,
      overflowListeners: new Set(),
    };
    this.lanes.set(state.key, state);
    this.laneOrder.push(state);
    return new ClientEngineLane(this, state);
  }

  /** Global worker reset (tests and explicit consumer resets). Pending bulk
   * work rejects typed; pending aux JSON work also rejects because a reset is
   * an explicit engine command, not a transient failure. The generation bump
   * fences results but does NOT free posted clones: their transport
   * reservations persist until the worker answers (stale responses count) or
   * the watchdog retires the instance. */
  reset(error: Error = new Error("Client engine reset")): void {
    const generation = this.workerLink.bumpGeneration();
    this.rejectAllPending(error);
    this.postControl({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation,
      type: "reset",
    });
  }

  decodeRemote(raw: string): Promise<DecodeFrameResult> {
    return this.enqueueInternal(null, {
      type: "decode-remote",
      raw,
    }) as Promise<DecodeFrameResult>;
  }

  async parseJson(raw: string): Promise<unknown> {
    const result = (await this.enqueueInternal(null, {
      type: "parse-json",
      raw,
    })) as JsonParseResult;
    if (!result.ok) throw new SyntaxError("Invalid JSON");
    return result.value;
  }

  async stringifyJson(value: unknown): Promise<string> {
    if (this.disposed) throw new ClientEngineLaneDisposedError();
    // Producer-side admission: project the graph with a hard cap before it can
    // be cloned into the worker queue. Refusal is typed and settles this call
    // only; nothing is posted and nothing is stringified on the UI thread.
    const projection = projectJsonBytes(
      value,
      Math.min(this.maxBytes, CLIENT_ENGINE_AUX_STRINGIFY_MAX_BYTES),
    );
    if (!projection.ok) throw new ClientEngineAuxInputTooLargeError(projection.reason);
    const result = (await this.enqueueInternal(null, {
      type: "stringify-json",
      value,
      projectedBytes: projection.bytes,
    })) as JsonStringifyResult;
    if (!result.ok) throw new TypeError("Cannot stringify value");
    return result.json;
  }

  dispose(): void {
    this.disposed = true;
    this.rejectAllPending(new ClientEngineLaneDisposedError());
    this.workerLink.dispose();
    this.transport.dispose();
    for (const state of [...this.lanes.values()]) {
      this.clearAgeTimer(state);
      state.overflowListeners.clear();
    }
    this.lanes.clear();
    this.laneOrder.length = 0;
    this.auxLane = null;
  }

  // ── Lane plumbing (ClientEngineLaneHost) ────────────────────────────

  enqueueLaneWork(state: ClientEngineLaneState, work: ClientEngineLaneWork): Promise<unknown> {
    return this.enqueueInternal(state as LaneState, work);
  }

  renewLane(state: ClientEngineLaneState): void {
    const lane = state as LaneState;
    if (this.lanes.get(lane.key) !== lane) return;
    lane.generation += 1;
    this.failLane(lane, new ClientEngineLaneSupersededError());
    lane.failed = false;
    lane.workerFailed = false;
  }

  disposeLane(state: ClientEngineLaneState): void {
    const lane = state as LaneState;
    if (this.lanes.get(lane.key) !== lane) return;
    this.failLane(lane, new ClientEngineLaneDisposedError());
    this.lanes.delete(lane.key);
    const index = this.laneOrder.indexOf(lane);
    if (index >= 0) this.laneOrder.splice(index, 1);
    lane.overflowListeners.clear();
    if (this.auxLane === lane) this.auxLane = null;
  }

  laneWorkerMode(): ClientEngineWorkerMode {
    return this.workerMode();
  }

  lanePendingCount(state: ClientEngineLaneState): number {
    const lane = state as LaneState;
    return lane.queue.length + lane.inFlight;
  }

  laneRetainedBytes(state: ClientEngineLaneState): number {
    const lane = state as LaneState;
    return lane.queuedBytes + lane.inFlightBytes;
  }

  /** Every byte the engine currently accounts against the advertised global
   * bound: live queued/posted work plus transport reservations for posted
   * messages the worker has not consumed yet. */
  retainedBytes(): number {
    return this.retainedPayloadBytes + this.transport.bytes;
  }

  /** Canceled/timed-out posted payload bytes still reserved until the worker
   * consumes the message or is terminated, for diagnostics and tests. */
  outstandingTransportBytes(): number {
    return this.transport.bytes;
  }

  /** Number of outstanding transport reservations (tombstones). Counted
   * against the global pending backstop, so the ledger itself is bounded. */
  outstandingTransportCount(): number {
    return this.transport.count;
  }

  // ── Admission ───────────────────────────────────────────────────────

  private enqueueInternal(lane: LaneState | null, work: EngineWork): Promise<unknown> {
    if (this.disposed) return Promise.reject(new ClientEngineLaneDisposedError());
    const state = lane ?? this.ensureAuxLane();
    if (this.lanes.get(state.key) !== state) {
      return Promise.reject(new ClientEngineLaneDisposedError());
    }
    const fallback = this.inlineFallbackFor(work);
    if (state.failed && !fallback) {
      // A previous frame on this lane was lost (overflow/timeout/age/worker
      // death). Later frames are typed-rejected until the consumer renews the
      // lane for a new connection, so no frame is ever applied past the loss.
      return Promise.reject(new ClientEngineWorkerUnavailableError("lane failed; resync required"));
    }
    const worker = this.workerLink.ensure();
    if (!worker) {
      if (this.workerLink.mode === "unsupported") {
        // Platform capability, not a failure: there is no Worker global at
        // all (some embeds and the jsdom test environment). Work executes at
        // receive time exactly as the pre-A3 client did. A worker that existed
        // and failed never takes this branch.
        return Promise.resolve(this.inlineWork(work));
      }
      if (fallback) return Promise.resolve(fallback());
      return Promise.reject(new ClientEngineWorkerUnavailableError());
    }

    const now = Date.now();
    const bytes = this.workBytes(work);
    this.enforceAge(state, now);
    if (state.failed && !fallback) {
      return Promise.reject(new ClientEngineWorkerUnavailableError("lane failed; resync required"));
    }
    if (state.queue.length + state.inFlight >= state.maxPending) {
      this.laneOverflow(state);
      return Promise.reject(new ClientEngineLaneOverflowError());
    }
    if (state.queuedBytes + state.inFlightBytes + bytes > state.maxBytes) {
      this.laneOverflow(state);
      return Promise.reject(new ClientEngineLaneOverflowError());
    }
    const liveCount = this.totalQueued + this.totalInFlight;
    const transportCount = this.transport.count;
    if (liveCount + transportCount >= this.maxPending) {
      // Global count backstop. When the live lanes alone fill it, only the
      // refusing lane fails. When canceled-but-unconsumed work is the blocker,
      // the worker is not draining: retire it instead of punishing a healthy
      // lane for a worker problem.
      if (transportCount > 0 && liveCount < this.maxPending) {
        return this.refuseForHungWorker("engine retained-work count");
      }
      this.laneOverflow(state, new ClientEngineLaneOverflowError("engine backlog"));
      return Promise.reject(new ClientEngineLaneOverflowError("engine backlog"));
    }
    const transportBytes = this.transport.bytes;
    if (this.retainedPayloadBytes + transportBytes + bytes > this.maxBytes) {
      // Global byte backstop over live payloads AND transport reservations.
      // Same split: live-only pressure fails the admitting lane; a worker
      // backlog that would exceed the advertised bound retires the worker.
      if (transportBytes > 0 && this.retainedPayloadBytes + bytes <= this.maxBytes) {
        return this.refuseForHungWorker("engine retained-work bytes");
      }
      this.laneOverflow(state, new ClientEngineLaneOverflowError("engine bytes"));
      return Promise.reject(new ClientEngineLaneOverflowError("engine bytes"));
    }

    const id = this.nextId++;
    let resolveEntry!: (value: unknown) => void;
    let rejectEntry!: (error: Error) => void;
    const promise = new Promise<unknown>((resolve, reject) => {
      resolveEntry = resolve;
      rejectEntry = reject;
    });
    const entry: LaneEntry = {
      id,
      lane: state,
      laneGeneration: state.generation,
      work,
      bytes,
      enqueuedAt: now,
      resolve: resolveEntry,
      reject: rejectEntry,
      fallback,
      timeout: null,
      posted: false,
    };
    entry.timeout = setTimeout(() => this.expireEntry(entry), CLIENT_ENGINE_TIMEOUT_MS);
    this.pendingById.set(id, entry);
    state.queue.push(entry);
    state.queuedBytes += bytes;
    this.totalQueued += 1;
    this.retainedPayloadBytes += bytes;
    this.armAgeTimer(state);
    this.pump();
    return promise;
  }

  /**
   * The only allowed UI-thread fallback: a measured-small `parse-json`.
   * `stringify-json` inputs are projected before admission, but the projection
   * is an upper bound, not a serialized value: running the actual
   * `JSON.stringify` of a near-cap graph synchronously on the UI thread after
   * a worker failure is exactly the burst this engine exists to prevent. Those
   * calls reject typed and the caller keeps its existing degraded cache path.
   */
  private inlineFallbackFor(work: EngineWork): (() => unknown) | null {
    if (work.type !== "parse-json") return null;
    if (work.raw.length > CLIENT_ENGINE_INLINE_FALLBACK_MAX_CHARS) return null;
    return () => this.inlineWork(work);
  }

  /** Retained-payload charge for one admission: the measured UTF-16 upper
   * bound of a raw string, or the bounded producer-side projection of a
   * `stringify-json` input graph. */
  private workBytes(work: EngineWork): number {
    if (work.type === "stringify-json") return work.projectedBytes;
    return measuredRawBytes(work.raw.length);
  }

  private ensureAuxLane(): LaneState {
    if (this.auxLane) return this.auxLane;
    const state: LaneState = {
      key: AUX_LANE_KEY,
      maxPending: CLIENT_ENGINE_AUX_MAX_PENDING,
      maxBytes: CLIENT_ENGINE_AUX_MAX_BYTES,
      // Persist hydration is not a live stream: it has no age budget.
      maxAgeMs: Number.POSITIVE_INFINITY,
      inFlightLimit: CLIENT_ENGINE_AUX_IN_FLIGHT,
      generation: 0,
      queue: [],
      queuedBytes: 0,
      inFlightBytes: 0,
      inFlight: 0,
      ageTimer: null,
      failed: false,
      workerFailed: false,
      overflowListeners: new Set(),
    };
    this.auxLane = state;
    this.lanes.set(state.key, state);
    this.laneOrder.push(state);
    return state;
  }

  private inlineWork(work: EngineWork): unknown {
    if (work.type === "decode-remote") return decodeRemoteSocketFrame(work.raw);
    if (work.type === "decode-desktop-frame") return decodeDesktopFrame(work.raw);
    if (work.type === "parse-json") return parseJsonValue(work.raw);
    return stringifyJsonValue(work.value);
  }

  // ── Fair scheduling ─────────────────────────────────────────────────

  private pump(): void {
    if (this.workerLink.mode !== "active" || this.disposed) return;
    while (this.totalInFlight < this.maxInFlight) {
      const state = this.nextEligibleLane();
      if (!state) return;
      const entry = state.queue.shift();
      if (!entry) return;
      // Posting transfers the payload charge from queued to in-flight; it is
      // NOT released here, because the entry still holds the raw frame.
      state.queuedBytes -= entry.bytes;
      state.inFlightBytes += entry.bytes;
      this.totalQueued -= 1;
      state.inFlight += 1;
      this.totalInFlight += 1;
      entry.posted = true;
      if (state.queue.length === 0) this.clearAgeTimer(state);
      this.postWork(entry);
    }
  }

  /** Round-robin over lanes so a flooded lane cannot starve a quiet one. */
  private nextEligibleLane(): LaneState | null {
    const lanes = this.laneOrder;
    if (lanes.length === 0) return null;
    for (let probe = 0; probe < lanes.length; probe += 1) {
      this.roundRobinIndex = (this.roundRobinIndex + 1) % lanes.length;
      const state = lanes[this.roundRobinIndex];
      if (!state) continue;
      this.enforceAge(state, Date.now());
      if (state.failed) continue;
      if (state.queue.length > 0 && state.inFlight < state.inFlightLimit) return state;
    }
    return null;
  }

  private postWork(entry: LaneEntry): void {
    const base = {
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: this.workerLink.workerGeneration,
      id: entry.id,
    } as const;
    // Host-only fields (`projectedBytes`) must not ride the wire shape.
    const request: ClientEngineWorkRequest =
      entry.work.type === "stringify-json"
        ? { ...base, type: "stringify-json", value: entry.work.value }
        : { ...base, type: entry.work.type, raw: entry.work.raw };
    if (!this.workerLink.postWork(request)) this.failWorker();
  }

  // ── Worker lifecycle ────────────────────────────────────────────────

  private onWorkerMessage(
    response: Exclude<ClientEngineResponse, { type: "protocol-mismatch" }>,
  ): void {
    if (response.type === "overflow") {
      // Worker backlog backstop: treat as worker unavailability (retire and
      // re-probe) instead of applying a cross-lane reset.
      this.failWorker();
      return;
    }
    const entry = this.pendingById.get(response.id);
    if (!entry) {
      // No live callback: the id may be a canceled/timed-out posted message.
      // The worker's response — even a useless result — proves it consumed the
      // clone, so the transport reservation can be released now.
      this.transport.release(response.id);
      this.postAck(response.id, response.generation);
      return;
    }
    this.pendingById.delete(response.id);
    clearTimeout(entry.timeout ?? undefined);
    this.releaseInFlight(entry);
    this.postAck(response.id, response.generation);
    if (entry.laneGeneration !== entry.lane.generation) {
      if (entry.fallback) entry.resolve(entry.fallback());
      else entry.reject(new ClientEngineLaneSupersededError());
      return;
    }
    entry.resolve(resultFromResponse(response));
    this.pump();
  }

  /** Generation-fenced response after a reset: never resolves work, but it is
   * the worker's consumption proof for a transport reservation. */
  private onStaleWorkerMessage(
    response: Exclude<ClientEngineResponse, { type: "protocol-mismatch" }>,
  ): void {
    if (response.type === "overflow") return;
    this.transport.release(response.id);
  }

  private handleProtocolMismatch(): void {
    this.rejectAllPending(new ClientEngineProtocolMismatchError());
    this.workerLink.retire({ mismatch: true });
    this.transport.clear();
  }

  /**
   * The worker did not consume the oldest retained clone within the watchdog
   * budget: it is not draining, so retire the actual instance (freeing every
   * clone it holds) and recover all lanes through the typed worker-failure
   * path. This is a worker-health event, not a lane overflow.
   */
  private retireHungWorker(): void {
    if (this.disposed) return;
    this.failWorker();
  }

  /** Admission refused because unconsumed canceled work (not live lanes) would
   * exceed the engine's advertised bound: retire the worker and reject this
   * admission typed. Lanes recover on the bounded re-probe. */
  private refuseForHungWorker(reason: string): Promise<never> {
    const error = new ClientEngineWorkerUnavailableError(
      `${reason} exhausted by unconsumed posted work; retiring worker`,
    );
    this.failWorker();
    return Promise.reject(error);
  }

  private failWorker(): void {
    // Persist JSON hydration must survive an engine crash (Zustand persist runs
    // it on the browser path), so aux entries settle through their bounded
    // same-task fallback; every bulk/socket lane rejects typed and is never
    // parsed synchronously.
    this.rejectAllPending(new ClientEngineWorkerUnavailableError(), {
      resolveAuxFallback: true,
    });
    for (const state of this.lanes.values()) {
      // Preserve an existing lane-level cause: a lane already latched by an
      // overflow/timeout/age loss must NOT be re-labelled worker-caused, or
      // worker recovery would clear the lane-level latch without a renew and a
      // later frame could be admitted past the loss.
      if (!state.failed) state.workerFailed = true;
      state.failed = true;
    }
    this.workerLink.retire();
    // Actual termination is the one release that needs no worker proof.
    this.transport.clear();
  }

  /** A fresh worker makes worker-failed lanes usable again; consumers still
   * resync from their last applied frame, and lane-level failures
   * (overflow/timeout/age) stay latched until a renew because `failWorker`
   * never re-labels them. */
  private clearWorkerFailedLanes(): void {
    for (const state of this.lanes.values()) {
      if (!state.workerFailed) continue;
      state.failed = false;
      state.workerFailed = false;
    }
  }

  // ── Budget enforcement ──────────────────────────────────────────────

  private expireEntry(entry: LaneEntry): void {
    if (this.pendingById.get(entry.id) !== entry) return;
    this.pendingById.delete(entry.id);
    if (entry.timeout) clearTimeout(entry.timeout);
    const state = entry.lane;
    if (!entry.posted) {
      state.queue = state.queue.filter((candidate) => candidate !== entry);
      state.queuedBytes -= entry.bytes;
      this.totalQueued -= 1;
      this.retainedPayloadBytes = Math.max(0, this.retainedPayloadBytes - entry.bytes);
    } else {
      this.cancelPosted(entry);
    }
    if (entry.fallback) {
      // Only the explicitly bounded small parse-json fallback can settle here;
      // bulk frames and unmeasurable aux work have a null fallback and fail
      // typed below instead of running on the UI thread.
      entry.resolve(entry.fallback());
      return;
    }
    entry.reject(new ClientEngineTimeoutError());
    // Fail the whole lane: a later frame resolving after this loss must never
    // be applied past the gap.
    this.failLane(state, new ClientEngineTimeoutError());
  }

  private enforceAge(state: LaneState, now: number): void {
    const oldest = state.queue[0];
    if (!oldest || !Number.isFinite(state.maxAgeMs)) return;
    if (now - oldest.enqueuedAt < state.maxAgeMs) return;
    const error = new ClientEngineTimeoutError("Client engine queue age exceeded");
    // Fail the whole lane: an aged queued frame was never applied, so no later
    // frame of this lane may be applied either.
    this.failLane(state, error);
  }

  private armAgeTimer(state: LaneState): void {
    if (state.ageTimer || state.queue.length === 0 || !Number.isFinite(state.maxAgeMs)) return;
    const oldest = state.queue[0]!;
    const delay = Math.max(0, oldest.enqueuedAt + state.maxAgeMs - Date.now());
    state.ageTimer = setTimeout(() => {
      state.ageTimer = null;
      this.enforceAge(state, Date.now());
      this.pump();
    }, delay);
  }

  private clearAgeTimer(state: LaneState): void {
    if (!state.ageTimer) return;
    clearTimeout(state.ageTimer);
    state.ageTimer = null;
  }

  private laneOverflow(
    state: LaneState,
    error: ClientEngineLaneOverflowError = new ClientEngineLaneOverflowError(),
  ): void {
    this.failLane(state, error);
    for (const listener of [...state.overflowListeners]) {
      try {
        listener();
      } catch {
        // A diagnostic sink must never break admission.
      }
    }
  }

  /** Rejects every pending entry of ONE lane (queued and in flight) and
   * latches the lane so no later frame is admitted until it is renewed (new
   * connection); a fresh worker only recovers lanes latched purely by worker
   * death. */
  private failLane(state: LaneState, error: Error): void {
    state.failed = true;
    // This loss has a lane-level cause, so worker recovery must not clear it;
    // only an explicit renew (new connection) reopens the lane.
    state.workerFailed = false;
    const queued = state.queue;
    state.queue = [];
    state.queuedBytes = 0;
    this.clearAgeTimer(state);
    for (const entry of queued) {
      this.pendingById.delete(entry.id);
      if (entry.timeout) clearTimeout(entry.timeout);
      this.totalQueued -= 1;
      this.retainedPayloadBytes = Math.max(0, this.retainedPayloadBytes - entry.bytes);
      entry.reject(error);
    }
    for (const entry of [...this.pendingById.values()]) {
      if (entry.lane !== state) continue;
      this.pendingById.delete(entry.id);
      if (entry.timeout) clearTimeout(entry.timeout);
      this.cancelPosted(entry);
      entry.reject(error);
    }
    if (state === this.auxLane) {
      // The aux persist lane is not an ordered stream and has no consumer
      // renew(): a lane-level loss there (overflow/timeout) must not latch
      // every later independent JSON hydration. Its pending entries were
      // rejected typed above; the lane stays available.
      state.failed = false;
      state.workerFailed = false;
    }
  }

  private rejectAllPending(error: Error, options?: { resolveAuxFallback?: boolean }): void {
    const entries = [...this.pendingById.values()];
    this.pendingById.clear();
    this.totalQueued = 0;
    this.totalInFlight = 0;
    this.retainedPayloadBytes = 0;
    for (const state of this.lanes.values()) {
      state.queue = [];
      state.queuedBytes = 0;
      state.inFlightBytes = 0;
      state.inFlight = 0;
      this.clearAgeTimer(state);
    }
    for (const entry of entries) {
      if (entry.timeout) clearTimeout(entry.timeout);
      // Posted entries transfer to the transport ledger: their callbacks settle
      // now, but the worker still holds the clone until it answers or dies.
      if (entry.posted) this.transport.reserve(entry.id, entry.bytes);
      if (options?.resolveAuxFallback && entry.fallback) entry.resolve(entry.fallback());
      else entry.reject(error);
    }
  }

  /** A posted entry whose callback is canceled: settle the consumer side now
   * (releaseInFlight) but keep the worker clone charged until the worker
   * responds for the id or the instance is terminated. */
  private cancelPosted(entry: LaneEntry): void {
    this.releaseInFlight(entry);
    this.transport.reserve(entry.id, entry.bytes);
    this.postAck(entry.id, this.workerLink.workerGeneration);
  }

  /** Live-release for one posted entry whose worker response arrived: the
   * payload charge ends when the entry leaves `pendingById`, never merely when
   * it was handed to the worker. */
  private releaseInFlight(entry: LaneEntry): void {
    entry.lane.inFlight = Math.max(0, entry.lane.inFlight - 1);
    entry.lane.inFlightBytes = Math.max(0, entry.lane.inFlightBytes - entry.bytes);
    this.totalInFlight = Math.max(0, this.totalInFlight - 1);
    this.retainedPayloadBytes = Math.max(0, this.retainedPayloadBytes - entry.bytes);
  }

  private postAck(id: number, generation: number): void {
    this.postControl({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation,
      type: "ack",
      id,
    });
  }

  private postControl(request: Extract<ClientEngineRequest, { type: "ack" | "reset" }>): void {
    this.workerLink.postControl(request);
  }
}

function resultFromResponse(
  response: Exclude<ClientEngineResponse, { type: "overflow" | "protocol-mismatch" }>,
): DecodeFrameResult | DesktopFrameDecodeResult | JsonParseResult | JsonStringifyResult {
  if (response.type === "decode-remote") {
    return response.ok ? { ok: true, message: response.message } : { ok: false, error: "invalid" };
  }
  if (response.type === "decode-desktop-frame") {
    return response.ok ? { ok: true, frame: response.frame } : { ok: false, error: "invalid" };
  }
  if (response.type === "parse-json") {
    return response.ok ? { ok: true, value: response.value } : { ok: false, error: "invalid" };
  }
  return response.ok ? { ok: true, json: response.json } : { ok: false, error: "invalid" };
}
