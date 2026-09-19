import { runtimeEventSchema } from "../../contracts/runtimeEvent";
import {
  REMOTE_COMMAND_ID_HEADER,
  TERMINAL_CURSOR_SYNC_V2_VERSION,
  TERMINAL_CURSOR_SYNC_VERSION,
  remoteWebSocketClientMessageSchema,
  remoteWebSocketServerMessageSchema,
} from "../protocol";
import { compareUnicodeCodePoints } from "./unicodeOrder";
import { WEBSOCKET_QUERY_CODECS } from "./queryCodecs";

/**
 * Protocol-level facts that are NOT route or procedure tables. The route,
 * procedure, scope, and schema tables live in the contract registry
 * (`./registry`); this module is the single declaration home for the
 * wire-format and compatibility policy the generated protocol manifest
 * publishes (`buildRemoteProtocolManifest` in `./generate`). Every entry here
 * is authoritative: nothing else in the repository may restate these values,
 * and the generated manifest carries them verbatim so TS, Swift, Kotlin, and
 * the web client read one copy.
 */

/** Output format version of the generated protocol manifest document. */
export const REMOTE_PROTOCOL_MANIFEST_FORMAT_VERSION = 1 as const;

/** The WebSocket endpoint path served by the remote host (`wsConnections.ts`). */
export const REMOTE_WEBSOCKET_PATH = "/ws" as const;

/**
 * Discovery fallback paths a client tries when it cannot discover a preserved
 * base path. Each entry must be a registered route path; the generator asserts
 * this so the list can never name an unregistered endpoint.
 */
export const REMOTE_DISCOVERY_FALLBACK_PATHS: readonly string[] = [
  "/.well-known/poracode/environment",
  "/.well-known/lightcode/environment",
];

/** Discriminator `type` literals of a zod discriminated union, sorted. */
export function discriminatedTypeLiterals(schema: unknown): string[] {
  const options = (schema as { options?: readonly unknown[] }).options ?? [];
  const names: string[] = [];
  for (const option of options) {
    const typeField = (option as { shape?: { type?: { value?: unknown } } }).shape?.type;
    const value = typeField?.value;
    if (typeof value === "string") names.push(value);
  }
  return names.sort(compareUnicodeCodePoints);
}

/** Client → server WebSocket message discriminators, from the shared schema. */
export const REMOTE_WEBSOCKET_CLIENT_MESSAGES: readonly string[] = discriminatedTypeLiterals(
  remoteWebSocketClientMessageSchema,
);

/** Server → client WebSocket message discriminators, from the shared schema. */
export const REMOTE_WEBSOCKET_SERVER_MESSAGES: readonly string[] = discriminatedTypeLiterals(
  remoteWebSocketServerMessageSchema,
);

/** Runtime event discriminators carried inside `event` envelopes, from the shared schema. */
export const REMOTE_RUNTIME_EVENT_TYPES: readonly string[] =
  discriminatedTypeLiterals(runtimeEventSchema);

/**
 * Broadcast event types the host stores in its bounded replay buffer and can
 * therefore re-deliver after a reconnect (`RemoteAccessServer`'s
 * `REMOTELY_CONSUMED_EVENT_TYPES`; the conformance suite keeps that set aligned
 * with this list). Everything else is live-only.
 */
export const REMOTE_REPLAYABLE_EVENT_TYPES: readonly string[] = [
  "thread-runtime-event",
  "thread-runtime-events",
  "thread-runtime-events-multi",
  "thread-state",
  "thread-pending-steer",
  "thread-follow-up-queue",
  "thread-reset",
  "thread-exited",
  "agent-status-updated",
  "windows-agent-statuses",
  "wsl-agent-statuses",
  "remote-git-summaries",
  "remote-git-state",
  "remote-projects-changed",
  "remote-threads-changed",
  "remote-user-notification",
];

/**
 * Server messages that arrive outside the replay/seq window (mirror frames and
 * terminal pushes). Must be a subset of {@link REMOTE_WEBSOCKET_SERVER_MESSAGES};
 * the generator asserts the subset invariant.
 */
export const REMOTE_OUT_OF_BAND_WS_MESSAGES: readonly string[] = [
  "browser-state",
  "browser-frame",
  "browser-mirror-status",
  "terminal-output",
  "terminal-watch-result",
  "terminal-watch-baseline-chunk",
];

/** Wire-format section of the generated protocol manifest. */
export const REMOTE_WIRE_FORMAT = {
  http: "application/json",
  webSocket: "json-text-frames",
  webSocketPath: REMOTE_WEBSOCKET_PATH,
  webSocketQueryParameters: WEBSOCKET_QUERY_CODECS.map((codec) => codec.name),
  commandIdHeader: REMOTE_COMMAND_ID_HEADER,
} as const;

/** Compatibility-policy section of the generated protocol manifest. */
export const REMOTE_COMPATIBILITY_POLICY = {
  versionPolicy: "exact",
  discoveryFallback: REMOTE_DISCOVERY_FALLBACK_PATHS,
  unknownObjectFields: "ignore",
  unknownAdvertisedScopes: "filter",
  unknownClientRequestedScopes: "reject",
  unknownWebSocketEventPayloads: "accept-envelope-and-ignore-unknown-event",
  endpointPathPolicy: "append-to-preserved-base-path",
  sequencePolicy: {
    snapshotSeqIsLastAppliedEvent: true,
    sendZeroLastSeenSeq: true,
    missingReplayWindow: "resync-required",
    serverSequenceRegression: "resync-required",
  },
  terminalOutput: {
    replayable: false,
    reconnectRecovery: "fetch-thread-scrollback-then-watch",
    cursorSync: {
      capability: "terminalCursorSync",
      versions: [TERMINAL_CURSOR_SYNC_VERSION, TERMINAL_CURSOR_SYNC_V2_VERSION],
      optIn: true,
      reliableCongestion: "disconnect",
      legacyCongestion: "lossy-skip",
      v2: {
        baselineDelivery: "chunked",
        chunkByteBounds: { min: 1024, max: 65536, default: 8192 },
        windowByteBounds: { min: 1024, max: 262144, default: 8192 },
        ackMessages: true,
        resume: "generation-and-cursor",
        controlFrameBypass: "half-window",
      },
    },
  },
  pairingCredential: {
    singleUse: true,
    transport: "url-fragment-or-request-body",
  },
} as const;
