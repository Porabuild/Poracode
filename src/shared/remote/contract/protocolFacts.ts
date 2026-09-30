import { runtimeEventSchema } from "../../contracts/runtimeEvent";
import {
  REMOTE_COMMAND_ID_HEADER,
  TERMINAL_CURSOR_SYNC_V2_VERSION,
  TERMINAL_CURSOR_SYNC_VERSION,
  remoteWebSocketClientMessageSchema,
  remoteWebSocketServerMessageSchema,
} from "../protocol";
import { compareUnicodeCodePoints } from "./unicodeOrder";
import {
  REMOTE_DESKTOP_INTERNAL_SEQ_PARAM,
  REMOTE_DESKTOP_INTERNAL_WS_PARAM,
  WEBSOCKET_QUERY_CODECS,
} from "./queryCodecs";

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
 * with this list). Everything else is live-only on THIS stream — but the
 * desktop-only supervisor families additionally ride the separate
 * desktop-internal `desktop-event` stream (see
 * {@link REMOTE_DESKTOP_INTERNAL_MESSAGES}); external and native clients never
 * receive those frames.
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

/**
 * Server messages that ride their own replayable sequence for DESKTOP-INTERNAL
 * sessions only (V5 plan 2.5): the co-located desktop renderer consumes the
 * desktop-only supervisor event families through them, and the server never
 * delivers one to an external or native client — those validate against the
 * remote runtime-event union and must never observe desktop-only types in any
 * frame. Declared here so the generated manifest publishes the frame shape and
 * its gating policy verbatim; the delivery gate itself lives in
 * `RemoteAccessServer` + `server/wsConnections.ts` (loopback-origin upgrade
 * opt-in via {@link REMOTE_DESKTOP_INTERNAL_WS_PARAM}, resume cursor via
 * {@link REMOTE_DESKTOP_INTERNAL_SEQ_PARAM}).
 */
export const REMOTE_DESKTOP_INTERNAL_MESSAGES: readonly string[] = ["desktop-event"];

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
  desktopInternalStream: {
    /**
     * V5 plan 2.5: the co-located desktop renderer consumes the desktop-only
     * supervisor event families over a second replayable sequence scoped to
     * desktop-internal sessions. Gated at the `/ws` upgrade: the client sets
     * `desktopInternal=1` and the server honors it ONLY when the upgrade
     * originates from a loopback address — a remote peer asking for it is
     * admitted as an ordinary session with the ordinary event surface.
     */
    admission: "loopback-origin-upgrade-opt-in",
    optInParameter: REMOTE_DESKTOP_INTERNAL_WS_PARAM,
    resumeCursorParameter: REMOTE_DESKTOP_INTERNAL_SEQ_PARAM,
    serverMessages: [...REMOTE_DESKTOP_INTERNAL_MESSAGES],
    replayable: true,
    sequencePolicy: {
      independentOfSharedEventSeq: true,
      snapshotSeqIsLastAppliedEvent: false,
      sendZeroLastSeenSeq: true,
      missingReplayWindow: "resync-required",
      serverSequenceRegression: "resync-required",
    },
    /** External/native clients never observe these frames or payload types. */
    externalVisibility: "never",
  },
  pairingCredential: {
    singleUse: true,
    transport: "url-fragment-or-request-body",
  },
} as const;
