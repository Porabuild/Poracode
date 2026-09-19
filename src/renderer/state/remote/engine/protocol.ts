/** Off-thread client decode/JSON engine. Bump when the worker message shape is incompatible. */
export const CLIENT_ENGINE_PROTOCOL_VERSION = 1 as const;
export const CLIENT_ENGINE_MAX_PENDING = 256;
export const CLIENT_ENGINE_TIMEOUT_MS = 2_000;

export type ClientEngineWorkType =
  | "decode-backend"
  | "decode-remote"
  | "parse-json"
  | "stringify-json";

export type ClientEngineWorkRequest =
  | {
      v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
      generation: number;
      id: number;
      type: "decode-backend";
      raw: string;
    }
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
      type: "decode-backend";
      ok: true;
      message: unknown;
    }
  | {
      v: typeof CLIENT_ENGINE_PROTOCOL_VERSION;
      generation: number;
      id: number;
      type: "decode-backend";
      ok: false;
      error: "invalid";
    }
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
