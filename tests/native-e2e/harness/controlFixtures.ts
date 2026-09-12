import type { EmitRequest, FaultConfig, FaultKind } from "./types.ts";
import {
  buildReplayableEvent,
  buildRuntimeEvent,
  FIXTURE_TERMINAL_ID,
  FIXTURE_THREAD_ID,
} from "./labFixtures.ts";

export const FAULT_FIXTURE_IDS = [
  "delay-token",
  "delay-ticket",
  "delay-snapshot",
  "delay-history",
  "cancel-token",
  "cancel-ticket",
  "cancel-snapshot",
  "cancel-history",
  "unauthorized-token",
  "forbidden-token",
  "redirect-token",
  "oversized-body-token",
  "chunked-body-token",
  "html-body-token",
  "socket-pre-ready-close",
  "close-1008",
  "sequence-gap",
  "sequence-regression",
  "malformed-envelope",
  "unknown-envelope",
  "reconnect-race",
  "interest-race",
  "duplicate-event-delivery",
  "clear",
] as const;

export type FaultFixtureId = (typeof FAULT_FIXTURE_IDS)[number];

export const FRAME_FIXTURE_IDS = [
  "event-agent-status",
  "event-thread-state",
  "runtime-content-delta",
  "runtime-live-turn-started",
  "runtime-live-user-item-started",
  "runtime-live-item-started",
  "runtime-live-content-delta",
  "terminal-output",
  "resync-required",
  "malformed",
  "unknown",
  "duplicate-event-thread-state",
] as const;

export type FrameFixtureId = (typeof FRAME_FIXTURE_IDS)[number];

export const CHECKPOINT_FIXTURE_IDS = [
  "seed-replay-two-events",
  "seed-pairing",
  "expire-pairing",
  "expire-tickets",
] as const;

export type CheckpointFixtureId = (typeof CHECKPOINT_FIXTURE_IDS)[number];

const FAULT_FIXTURES: Record<Exclude<FaultFixtureId, "clear">, FaultConfig> = {
  "delay-token": { kind: "delay-token", delayMs: 80 },
  "delay-ticket": { kind: "delay-ticket", delayMs: 80 },
  "delay-snapshot": { kind: "delay-snapshot", delayMs: 80 },
  "delay-history": { kind: "delay-history", delayMs: 80 },
  "cancel-token": { kind: "cancel-token" },
  "cancel-ticket": { kind: "cancel-ticket" },
  "cancel-snapshot": { kind: "cancel-snapshot" },
  "cancel-history": { kind: "cancel-history" },
  "unauthorized-token": { kind: "unauthorized", routeId: "token-exchange" },
  "forbidden-token": { kind: "forbidden", routeId: "token-exchange" },
  "redirect-token": { kind: "redirect", routeId: "token-exchange", location: "/elsewhere" },
  "oversized-body-token": { kind: "oversized-body", routeId: "token-exchange" },
  "chunked-body-token": { kind: "chunked-body", routeId: "token-exchange" },
  "html-body-token": { kind: "html-body", routeId: "token-exchange" },
  "socket-pre-ready-close": { kind: "socket-pre-ready-close" },
  "close-1008": { kind: "close-1008" },
  "sequence-gap": { kind: "sequence-gap" },
  "sequence-regression": { kind: "sequence-regression" },
  "malformed-envelope": { kind: "malformed-envelope" },
  "unknown-envelope": { kind: "unknown-envelope" },
  "reconnect-race": { kind: "reconnect-race", delayMs: 40 },
  "interest-race": { kind: "interest-race" },
  "duplicate-event-delivery": { kind: "duplicate-event-delivery" },
};

const FRAME_FIXTURES: Record<
  Exclude<FrameFixtureId, "duplicate-event-thread-state">,
  EmitRequest
> = {
  "event-agent-status": {
    kind: "event",
    eventType: "agent-status-updated",
    event: buildReplayableEvent("agent-status-updated"),
  },
  "event-thread-state": {
    kind: "event",
    eventType: "thread-state",
    event: buildReplayableEvent("thread-state", FIXTURE_THREAD_ID),
  },
  "runtime-content-delta": {
    kind: "runtime",
    threadId: FIXTURE_THREAD_ID,
    runtimeEvent: buildRuntimeEvent("content.delta", FIXTURE_THREAD_ID),
  },
  "runtime-live-turn-started": {
    kind: "runtime",
    threadId: FIXTURE_THREAD_ID,
    runtimeEvent: {
      ...buildRuntimeEvent("turn.started", FIXTURE_THREAD_ID),
      turnId: "turn-native-e2e-live",
    },
  },
  "runtime-live-user-item-started": {
    kind: "runtime",
    threadId: FIXTURE_THREAD_ID,
    runtimeEvent: {
      ...buildRuntimeEvent("item.started", FIXTURE_THREAD_ID),
      turnId: "turn-native-e2e-live",
      itemId: "item-native-e2e-user",
      itemType: "user_message",
      payload: {
        content: [{ kind: "text", text: "Native journey message" }],
      },
    },
  },
  "runtime-live-item-started": {
    kind: "runtime",
    threadId: FIXTURE_THREAD_ID,
    runtimeEvent: {
      ...buildRuntimeEvent("item.started", FIXTURE_THREAD_ID),
      turnId: "turn-native-e2e-live",
      itemId: "item-native-e2e-live",
      payload: { content: [] },
    },
  },
  "runtime-live-content-delta": {
    kind: "runtime",
    threadId: FIXTURE_THREAD_ID,
    runtimeEvent: {
      ...buildRuntimeEvent("content.delta", FIXTURE_THREAD_ID),
      turnId: "turn-native-e2e-live",
      itemId: "item-native-e2e-live",
      delta: "Native live update",
    },
  },
  "terminal-output": {
    kind: "terminal-output",
    terminalId: FIXTURE_TERMINAL_ID,
    data: "live frame",
  },
  "resync-required": { kind: "resync-required", reason: "Injected resync." },
  malformed: { kind: "malformed" },
  unknown: { kind: "unknown" },
};

export function isFaultFixtureId(value: string): value is FaultFixtureId {
  return (FAULT_FIXTURE_IDS as readonly string[]).includes(value);
}

export function isFrameFixtureId(value: string): value is FrameFixtureId {
  return (FRAME_FIXTURE_IDS as readonly string[]).includes(value);
}

export function isCheckpointFixtureId(value: string): value is CheckpointFixtureId {
  return (CHECKPOINT_FIXTURE_IDS as readonly string[]).includes(value);
}

export function faultConfigForFixture(id: FaultFixtureId): FaultConfig | { kind: "clear" } {
  if (id === "clear") return { kind: "clear" };
  return FAULT_FIXTURES[id];
}

export function emitRequestForFixture(id: FrameFixtureId): EmitRequest {
  if (id === "duplicate-event-thread-state") {
    return FRAME_FIXTURES["event-thread-state"];
  }
  return FRAME_FIXTURES[id];
}

export function faultKindFromFixture(id: Exclude<FaultFixtureId, "clear">): FaultKind {
  return FAULT_FIXTURES[id].kind;
}
