/** Typed failure when the worker and the host disagree on the engine protocol
 * version (V5 2.6): pending consumers reject with this instead of the message
 * being dropped silently until its timeout. */
export class ClientEngineProtocolMismatchError extends Error {
  constructor() {
    super("Client engine protocol version mismatch");
    this.name = "ClientEngineProtocolMismatchError";
  }
}

/**
 * A3 typed failure: the worker cannot serve work right now (crashed, refused
 * the message, or its backlog overflowed). Bulk socket work is NEVER parsed on
 * the UI thread for this reason; consumers resync from the last applied frame.
 */
export class ClientEngineWorkerUnavailableError extends Error {
  constructor(message = "Client engine worker unavailable") {
    super(message);
    this.name = "ClientEngineWorkerUnavailableError";
  }
}

/** Typed refusal reason for aux `stringify-json` input. `too-large` means the
 * bounded projection exceeded the per-request cap; `unsupported` means the
 * graph cannot be projected or structured-cloned safely (toJSON, accessors,
 * class instances, typed arrays, Map/Set, BigInt, functions/symbols, cycles,
 * or excessive depth). Nothing is posted and nothing runs on the UI thread. */
export type ClientEngineAuxInputRefusalReason = "too-large" | "unsupported";

/** A3 correction: typed refusal when a `stringify-json` input graph's bounded
 * producer-side projection cannot be admitted. The caller keeps its in-memory
 * state and reports the failed persist; the value is never posted to the
 * worker and never serialized on the UI thread. */
export class ClientEngineAuxInputTooLargeError extends Error {
  constructor(readonly reason: ClientEngineAuxInputRefusalReason) {
    super(
      reason === "too-large"
        ? "Client engine aux input exceeds the projected byte budget"
        : "Client engine aux input cannot be projected or cloned safely",
    );
    this.name = "ClientEngineAuxInputTooLargeError";
  }
}

/** A3 typed failure: this lane exceeded its count/byte/global budget. Only the
 * overflowing lane is rejected; healthy lanes keep decoding. */
export class ClientEngineLaneOverflowError extends Error {
  constructor(message = "Client engine lane overflow") {
    super(message);
    this.name = "ClientEngineLaneOverflowError";
  }
}

/** A3 typed failure: one queued frame exceeded the lane's age/time budget. The
 * lane is failed so a later frame can never be applied past the loss. */
export class ClientEngineTimeoutError extends Error {
  constructor(message = "Client engine decode timed out") {
    super(message);
    this.name = "ClientEngineTimeoutError";
  }
}

/** A3 generation fence: the lane was renewed for a new connection while work
 * from the old connection was still in flight. Results are never applied. */
export class ClientEngineLaneSupersededError extends Error {
  constructor() {
    super("Client engine lane superseded");
    this.name = "ClientEngineLaneSupersededError";
  }
}

/** A3 teardown fence: the consuming session closed the lane; every pending
 * callback and every late worker result is invalid. */
export class ClientEngineLaneDisposedError extends Error {
  constructor() {
    super("Client engine lane disposed");
    this.name = "ClientEngineLaneDisposedError";
  }
}

export type ClientEngineWorkerMode = "unsupported" | "active" | "unavailable";
