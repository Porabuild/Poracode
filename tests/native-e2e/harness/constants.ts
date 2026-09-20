export const LOOPBACK_HOST = "127.0.0.1";
export const DEFAULT_HOST_PORT = 49152;
export const DEFAULT_CONTROL_PORT = 49153;
export const HARNESS_AUTHORIZATION_SCHEME = "Harness";

export const MAX_JSON_BODY_BYTES = 1024 * 1024;
export const REPLAY_RING_LIMIT = 500;
export const REPLAY_RING_MAX_BYTES = 8 * 1024 * 1024;

export const DEFAULT_PAIRING_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_WEBSOCKET_TICKET_TTL_MS = 30 * 1000;

export const STARTUP_TIMEOUT_MS = 30_000;
export const TEST_TIMEOUT_MS = 120_000;
export const SHUTDOWN_TIMEOUT_MS = 15_000;

export const COMMAND_ID_HEADER = "x-poracode-command-id";
export const CONTROL_CAPABILITY_ENV = "NATIVE_E2E_CONTROL_CAPABILITY";

export const PAIRING_TOKEN_PREFIX = "lc_pair_";
export const ACCESS_TOKEN_PREFIX = "lc_access_";
export const WEBSOCKET_TICKET_PREFIX = "lc_ws_";

export const DEFAULT_SCOPES = [
  "session:read",
  "session:operate",
  "terminal:read",
  "terminal:operate",
  "requests:resolve",
  "projects:manage",
  "ports:forward",
] as const;

export type RemoteScope = (typeof DEFAULT_SCOPES)[number];
