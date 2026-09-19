/**
 * Off-thread client decode/JSON engine. Bump when the worker message shape is
 * incompatible. Version 2 (V5 plan 2.5) removes the backend renderer-stream
 * work type with the deleted stream; worker and host ship in one bundle, so
 * the bump only fence-sits a stale cached chunk pair into the loud
 * protocol-mismatch path instead of half-serving a deleted request type.
 */
export const CLIENT_ENGINE_PROTOCOL_VERSION = 2 as const;
export const CLIENT_ENGINE_MAX_PENDING = 256;
export const CLIENT_ENGINE_TIMEOUT_MS = 2_000;

export type ClientEngineWorkType = "decode-remote" | "parse-json" | "stringify-json";

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
