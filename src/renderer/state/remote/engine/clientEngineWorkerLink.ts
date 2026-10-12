import {
  CLIENT_ENGINE_PROTOCOL_VERSION,
  CLIENT_ENGINE_REPROBE_BASE_MS,
  CLIENT_ENGINE_REPROBE_MAX_ATTEMPTS,
  CLIENT_ENGINE_REPROBE_MAX_MS,
  type ClientEngineRequest,
  type ClientEngineResponse,
  type ClientEngineWorkRequest,
} from "./protocol";
import type { ClientEngineWorkerMode } from "./clientEngineErrors";

/**
 * A3 worker lifecycle for one client-engine instance: lazy construction, the
 * version/generation gate on replies, failure retirement and the bounded
 * re-probe cadence. Kept separate from `ClientEngineHost` so admission,
 * budgets and lane scheduling do not share a file with worker plumbing.
 *
 * The link never decides what happens to pending work; it reports typed
 * lifecycle events to the host, which owns the pending set and the lanes.
 */
export interface ClientEngineWorkerLinkHooks {
  /** A version-matched, generation-matched work or overflow response. */
  readonly onResponse: (
    response: Exclude<ClientEngineResponse, { type: "protocol-mismatch" }>,
  ) => void;
  /** A version-matched response whose worker generation was fenced by a
   * reset. It must never resolve current work, but it proves the worker
   * consumed that posted message, so the host releases the message's transport
   * reservation (worker clones cannot be reclaimed any other way). */
  readonly onStaleResponse: (
    response: Exclude<ClientEngineResponse, { type: "protocol-mismatch" }>,
  ) => void;
  /** The peer speaks another protocol version: retire it for good. */
  readonly onProtocolMismatch: () => void;
  /** The worker crashed or refused a message: retire and re-probe. */
  readonly onUnavailable: () => void;
  /** A fresh worker exists (first construction or a successful probe). */
  readonly onRecovered: () => void;
}

export class ClientEngineWorkerLink {
  private worker: Worker | null = null;
  private state: "untried" | "active" | "unsupported" | "unavailable" = "untried";
  /** Set when the worker proved to speak another protocol version; the engine
   * stays in the typed unavailable state instead of re-probing a wrong peer. */
  private mismatchRetired = false;
  private generation = 0;
  private reprobeTimer: ReturnType<typeof setTimeout> | null = null;
  private reprobeAttempts = 0;
  private reprobeEarliestAt = 0;
  private disposed = false;

  constructor(private readonly hooks: ClientEngineWorkerLinkHooks) {}

  /** Generation stamped onto requests and required on replies. */
  get workerGeneration(): number {
    return this.generation;
  }

  /** Worker state right now: "unsupported" (no Worker global), "active", or
   * "unavailable" after a crash/version mismatch. */
  get mode(): ClientEngineWorkerMode {
    if (this.disposed) return "unavailable";
    if (typeof Worker === "undefined") return "unsupported";
    if (this.state === "untried" || this.state === "active") return "active";
    return "unavailable";
  }

  /** True when the platform provides a Worker constructor at all. */
  isSupported(): boolean {
    return !this.disposed && typeof Worker !== "undefined";
  }

  /** Materializes the worker when possible; null means off-thread work is not
   * currently available (platform lacks Worker, or it failed and is within a
   * bounded re-probe backoff). */
  ensure(): Worker | null {
    if (this.disposed) return null;
    if (this.state === "active") return this.worker;
    if (typeof Worker === "undefined") {
      this.state = "unsupported";
      return null;
    }
    if (this.state === "unavailable") {
      if (this.mismatchRetired) return null;
      const now = Date.now();
      if (now < this.reprobeEarliestAt) return null;
      // Demand-driven probe, rate-limited to the capped cadence once the
      // bounded automatic probes are exhausted.
      this.reprobeEarliestAt = now + CLIENT_ENGINE_REPROBE_MAX_MS;
    }
    try {
      const worker = new Worker(new URL("./clientEngineWorker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<ClientEngineResponse>) => {
        const response = event.data;
        if (!response || response.v !== CLIENT_ENGINE_PROTOCOL_VERSION) {
          this.hooks.onProtocolMismatch();
          return;
        }
        if (response.type === "protocol-mismatch") {
          this.hooks.onProtocolMismatch();
          return;
        }
        if (response.generation !== this.generation) {
          // Fenced result: never resolve current work, but forward the
          // consumption proof so the host can drop its transport reservation.
          this.hooks.onStaleResponse(response);
          return;
        }
        // A worker that actually served a request is healthy again: the
        // bounded automatic re-probe budget is replenished only by real work,
        // never by a construction that is about to fail.
        this.reprobeAttempts = 0;
        this.hooks.onResponse(response);
      };
      worker.onerror = () => this.hooks.onUnavailable();
      worker.onmessageerror = () => this.hooks.onUnavailable();
      this.worker = worker;
      this.state = "active";
      this.reprobeEarliestAt = 0;
      this.clearReprobe();
      this.hooks.onRecovered();
      return worker;
    } catch {
      this.state = "unavailable";
      this.scheduleReprobe();
      return null;
    }
  }

  /** Posts one work request. Returns false when the worker vanished between
   * admission and posting; the caller owns the typed failure. */
  postWork(request: ClientEngineWorkRequest): boolean {
    try {
      if (!this.worker) return false;
      this.worker.postMessage(request);
      return true;
    } catch {
      return false;
    }
  }

  postControl(request: Extract<ClientEngineRequest, { type: "ack" | "reset" }>): void {
    try {
      this.worker?.postMessage(request);
    } catch {
      // Worker may already be gone; fencing is host-side.
    }
  }

  /** Explicit reset fence: requests posted before this are no longer answered
   * and the worker is told to drop its bookkeeping. */
  bumpGeneration(): number {
    this.generation += 1;
    return this.generation;
  }

  /** Retires the worker after a failure or protocol mismatch. */
  retire(options?: { readonly mismatch?: boolean }): void {
    this.worker?.terminate();
    this.worker = null;
    this.state = "unavailable";
    if (options?.mismatch) {
      this.mismatchRetired = true;
      this.clearReprobe();
    } else {
      // Subsequent jobs are typed-rejected while the worker is unavailable;
      // the first demand-driven probe waits out the base cadence instead of
      // hammering construction.
      this.reprobeEarliestAt = Date.now() + CLIENT_ENGINE_REPROBE_BASE_MS;
      this.scheduleReprobe();
    }
    this.generation += 1;
  }

  dispose(): void {
    this.disposed = true;
    this.clearReprobe();
    this.worker?.terminate();
    this.worker = null;
    this.state = "unavailable";
  }

  private scheduleReprobe(): void {
    if (this.disposed || this.mismatchRetired || this.reprobeTimer) return;
    if (this.reprobeAttempts >= CLIENT_ENGINE_REPROBE_MAX_ATTEMPTS) {
      // Bounded automatic probes are exhausted. Demand-driven probes may still
      // occur, at most once per capped cadence (see ensure).
      return;
    }
    this.reprobeAttempts += 1;
    const delay = Math.min(
      CLIENT_ENGINE_REPROBE_BASE_MS * 2 ** (this.reprobeAttempts - 1),
      CLIENT_ENGINE_REPROBE_MAX_MS,
    );
    this.reprobeTimer = setTimeout(() => {
      this.reprobeTimer = null;
      if (!this.ensure()) this.scheduleReprobe();
    }, delay);
  }

  private clearReprobe(): void {
    if (!this.reprobeTimer) return;
    clearTimeout(this.reprobeTimer);
    this.reprobeTimer = null;
  }
}
