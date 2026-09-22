import type { DesktopLoopbackFrame } from "@/renderer/state/remoteServers/desktopLoopbackFrames";

/**
 * Off-thread client decode/JSON engine. Bump when the worker message shape is
 * incompatible. Version 3 (A3) adds the private `decode-desktop-frame` work
 * type: the managed loopback leg validates and parses its private frame
 * vocabulary in the worker instead of on the UI thread. Worker and host ship
 * in one bundle, so the bump only fence-sits a stale cached chunk pair into the
 * loud protocol-mismatch path instead of half-serving a request type it does
 * not know.
 */
export const CLIENT_ENGINE_PROTOCOL_VERSION = 3 as const;
/** Global outstanding-work backstop across every lane of one engine: queued +
 * in flight + canceled posted messages whose worker clone has not been
 * consumed yet. Counting the transport reservations keeps the ledger itself
 * bounded, not just the live callbacks. Per-lane budgets are the primary
 * bound; this only refuses work when the sum is already pathological. */
export const CLIENT_ENGINE_MAX_PENDING = 256;
export const CLIENT_ENGINE_TIMEOUT_MS = 2_000;
/** Global in-flight window: posted-but-unanswered work per engine. Keeps the
 * worker's own unanswered set bounded well below its protocol limit. */
export const CLIENT_ENGINE_MAX_IN_FLIGHT = 128;
/**
 * Per-engine global bound over RETAINED payload bytes: every live queued or
 * posted entry still holding its payload PLUS every outstanding transport
 * reservation for a posted message the worker has not consumed yet (canceled
 * by renew/dispose/timeout/overflow/reset). Measured as the UTF-16 upper bound
 * of the raw string (`raw.length × 2`), not as exact heap bytes;
 * `stringify-json` is charged its bounded producer-side projection. Keeping
 * canceled work charged is what makes the host bound actually cover the
 * worker's structured clones instead of releasing them at cancel time.
 */
export const CLIENT_ENGINE_MAX_BYTES = 64 * 1024 * 1024;
/**
 * Hung-worker watchdog: when the oldest unconsumed posted message outlives
 * this budget, the worker is not draining and is retired (terminated), which is
 * the only way to actually reclaim its clones. Generous relative to the 2 s
 * entry timeout and 5 s lane age so a merely busy worker is not killed; the
 * byte/count backstops already refuse admission long before a draining worker
 * accumulates this much.
 */
export const CLIENT_ENGINE_TRANSPORT_WATCHDOG_MS = 10_000;
/** Per-lane count budget (queued + in flight). */
export const CLIENT_ENGINE_LANE_MAX_PENDING = 64;
/** Per-lane byte budget over queued AND posted live work: the payload stays
 * charged to the lane until its response or cancellation. A canceled posted
 * message moves to the engine-level transport ledger (globally bounded and
 * watchdog-retired), never silently back to zero. */
export const CLIENT_ENGINE_LANE_MAX_BYTES = 4 * 1024 * 1024;
/**
 * Aux persist-JSON lane (Zustand persist hydration/serialization). Real
 * callers are the non-app `createDbStorage` named stores; the app store does
 * not ride this lane. `parse-json` inputs are measured wire strings;
 * `stringify-json` inputs are bounded by a producer-side projection before
 * admission (see `jsonProjection.ts`), so the lane is byte-bounded on both
 * work types and not merely count-capped.
 */
export const CLIENT_ENGINE_AUX_MAX_PENDING = 8;
export const CLIENT_ENGINE_AUX_IN_FLIGHT = 4;
export const CLIENT_ENGINE_AUX_MAX_BYTES = 16 * 1024 * 1024;
/**
 * Per-request cap on a `stringify-json` input graph's projected footprint. A
 * graph that projects beyond this is refused typed before `postMessage`, so
 * the worker clone of one stringify job is bounded instead of "reservation 64
 * KiB for an unbounded graph". The projection aborts at the cap, so its own
 * string scans, descriptor reads and charges are bounded by the budget rather
 * than the graph; engine-owned key enumeration is not separately measured (see
 * `jsonProjection.ts`). Callers that need genuinely larger blobs must chunk
 * them; no whole-graph JSON.stringify is ever used to measure.
 */
export const CLIENT_ENGINE_AUX_STRINGIFY_MAX_BYTES = 8 * 1024 * 1024;
/**
 * Bounded inline fallback policy: when the worker cannot serve aux work (crash,
 * mismatch, timeout), ONLY a `parse-json` whose raw input is at most this many
 * UTF-16 code units may still execute on the UI thread. Everything larger —
 * and every `stringify-json` — rejects typed so a failed worker can never turn
 * into a synchronous parse/stringify burst of persisted metadata.
 */
export const CLIENT_ENGINE_INLINE_FALLBACK_MAX_CHARS = 4096;
/** Per-lane queue age budget: work older than this is a failed lane, not a
 * backlog to apply later. */
export const CLIENT_ENGINE_LANE_MAX_AGE_MS = 5_000;
/** Per-lane in-flight window: one lane may not occupy the worker with more
 * than this many unanswered frames, so a round-robin pass interleaves hosts. */
export const CLIENT_ENGINE_LANE_IN_FLIGHT = 8;
/** Bounded worker re-probe cadence after a failure. */
export const CLIENT_ENGINE_REPROBE_BASE_MS = 250;
export const CLIENT_ENGINE_REPROBE_MAX_MS = 5_000;
export const CLIENT_ENGINE_REPROBE_MAX_ATTEMPTS = 5;

export type ClientEngineWorkType =
  | "decode-remote"
  | "decode-desktop-frame"
  | "parse-json"
  | "stringify-json";

export type ClientEngineWorkRequest =
  | {
      v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
      generation: number;
      id: number;
      type: "decode-remote";
      raw: string;
    }
  | {
      v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
      generation: number;
      id: number;
      type: "decode-desktop-frame";
      raw: string;
    }
  | {
      v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
      generation: number;
      id: number;
      type: "parse-json";
      raw: string;
    }
  | {
      v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
      generation: number;
      id: number;
      type: "stringify-json";
      value: unknown;
    };

export type ClientEngineAckRequest = {
  v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
  generation: number;
  type: "ack";
  id: number;
};

export type ClientEngineResetRequest = {
  v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
  generation: number;
  type: "reset";
};

export type ClientEngineRequest =
  | ClientEngineWorkRequest
  | ClientEngineAckRequest
  | ClientEngineResetRequest;

export type ClientEngineWorkResponse =
  | {
      v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
      generation: number;
      id: number;
      type: "decode-remote";
      ok: true;
      message: unknown;
    }
  | {
      v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
      generation: number;
      id: number;
      type: "decode-remote";
      ok: false;
      error: "invalid";
    }
  | {
      v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
      generation: number;
      id: number;
      type: "decode-desktop-frame";
      ok: true;
      frame: DesktopLoopbackFrame;
    }
  | {
      v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
      generation: number;
      id: number;
      type: "decode-desktop-frame";
      ok: false;
      error: "invalid";
    }
  | {
      v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
      generation: number;
      id: number;
      type: "parse-json";
      ok: true;
      value: unknown;
    }
  | {
      v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
      generation: number;
      id: number;
      type: "parse-json";
      ok: false;
      error: "invalid";
    }
  | {
      v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
      generation: number;
      id: number;
      type: "stringify-json";
      ok: true;
      json: string;
    }
  | {
      v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
      generation: number;
      id: number;
      type: "stringify-json";
      ok: false;
      error: "invalid";
    };

export type ClientEngineOverflowResponse = {
  v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
  generation: number;
  type: "overflow";
};

/**
 * Typed answer to a request whose `v` this worker does not speak (V5 2.6).
 * The worker echoes its OWN current version, so a mismatched host fails the
 * version gate on this response and rejects its pending work typed instead of
 * silently dropping every frame until the per-request timeout.
 */
export type ClientEngineProtocolMismatchResponse = {
  v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
  type: "protocol-mismatch";
  receivedV: number;
};

export type ClientEngineResponse =
  | ClientEngineWorkResponse
  | ClientEngineOverflowResponse
  | ClientEngineProtocolMismatchResponse;
