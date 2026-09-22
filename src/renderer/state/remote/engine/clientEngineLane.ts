import type { DecodeFrameResult, DesktopFrameDecodeResult } from "./decode";
import type { ClientEngineWorkerMode } from "./clientEngineErrors";

/**
 * A3 lane handle: the ordering and admission scope for one consumer
 * connection. Work from one lane never reorders; budgets and failures are
 * confined to the lane, so one flooding host cannot reject another host's
 * pending decode or steal its overflow notification.
 *
 * The handle is a thin view over host-owned state: the host owns scheduling,
 * budgets and the worker; the handle is what a session keeps for its lifetime.
 */

export interface ClientEngineLaneOptions {
  /** Stable routing key. Creating a lane with an existing key supersedes the
   * old lane: its pending callbacks reject typed and its results are fenced. */
  readonly key: string;
  /** Count budget over queued + in-flight entries. */
  readonly maxPending?: number;
  /** Byte budget over this lane's live queued + posted work (UTF-16 upper
   * bound). Canceled posted work moves to the engine-level transport ledger,
   * which is bounded by the engine's global backstops and watchdog. */
  readonly maxBytes?: number;
  /** Age budget for a queued entry. */
  readonly maxAgeMs?: number;
  /** Posted-but-unanswered window for this lane. */
  readonly inFlight?: number;
}

export type ClientEngineLaneWork =
  | { readonly type: "decode-remote"; readonly raw: string }
  | { readonly type: "decode-desktop-frame"; readonly raw: string };

/** Host-owned lane record the handle exposes a narrow view of. */
export interface ClientEngineLaneState {
  readonly key: string;
  readonly overflowListeners: Set<() => void>;
}

/** The host operations a lane handle needs; keeps this module free of the
 * engine implementation (no runtime import cycle). */
export interface ClientEngineLaneHost {
  enqueueLaneWork(state: ClientEngineLaneState, work: ClientEngineLaneWork): Promise<unknown>;
  renewLane(state: ClientEngineLaneState): void;
  disposeLane(state: ClientEngineLaneState): void;
  laneWorkerMode(): ClientEngineWorkerMode;
  lanePendingCount(state: ClientEngineLaneState): number;
  laneRetainedBytes(state: ClientEngineLaneState): number;
}

export class ClientEngineLane {
  constructor(
    private readonly host: ClientEngineLaneHost,
    private readonly state: ClientEngineLaneState,
  ) {}

  get key(): string {
    return this.state.key;
  }

  /** Worker mode of the owning engine, for consumers that must expose or
   * adapt to a truthful reduced state. */
  get workerMode(): ClientEngineWorkerMode {
    return this.host.laneWorkerMode();
  }

  decodeRemote(raw: string): Promise<DecodeFrameResult> {
    return this.host.enqueueLaneWork(this.state, {
      type: "decode-remote",
      raw,
    }) as Promise<DecodeFrameResult>;
  }

  decodeDesktopFrame(raw: string): Promise<DesktopFrameDecodeResult> {
    return this.host.enqueueLaneWork(this.state, {
      type: "decode-desktop-frame",
      raw,
    }) as Promise<DesktopFrameDecodeResult>;
  }

  /** New connection generation: pending callbacks from the old connection
   * reject typed so a stale result can never be applied to its replacement. */
  renew(): void {
    this.host.renewLane(this.state);
  }

  /** Session teardown: every pending callback rejects typed, late worker
   * results are ignored, and the key may be re-created by a fresh session. */
  dispose(): void {
    this.host.disposeLane(this.state);
  }

  /** Notified once per lane overflow (count/byte budget). */
  addOverflowListener(listener: () => void): () => void {
    this.state.overflowListeners.add(listener);
    return () => {
      this.state.overflowListeners.delete(listener);
    };
  }

  /** Queued + in-flight entries, for diagnostics and tests. */
  pendingCount(): number {
    return this.host.lanePendingCount(this.state);
  }

  /** Retained payload bytes of this lane (queued + posted), for diagnostics
   * and tests. A UTF-16 upper bound for measured raw frames. */
  retainedBytes(): number {
    return this.host.laneRetainedBytes(this.state);
  }
}
