import type { ThreadStatus } from "@/shared/contracts";
import type {
  RemoteLiveActivityContentState,
  RemotePushPayloadRouting,
  RemotePushRegistrationRouting,
} from "@/shared/remote";

/** How far ahead to mark a Live Activity stale if no further update arrives
 * (covers a desktop that dies mid-run). */
const STALE_AHEAD_MS = 10 * 60 * 1000;
/** How long a finished session lingers on the lock screen before auto-dismiss. */
const DISMISSAL_AHEAD_MS = 15 * 60 * 1000;

/** APNs custom-data key. It must remain a sibling of `aps`, never a child. */
export const IOS_PUSH_ROUTING_KEY = "poracode" as const;

/** Fixed Live Activity attributes, set once at start. Mirrors the Swift
 * `DesktopSessionAttributes`. */
export interface DesktopSessionAttributes {
  readonly desktopId: string;
  readonly desktopName: string;
  /** Routed-v1 identity for the native host registry entry. Legacy starts omit it. */
  readonly routing?: RemotePushRegistrationRouting;
}

/** Generic text used when the redaction setting is on. */
const REDACTED_TITLE = "A conversation";
const REDACTED_PROJECT = "";

export interface ActiveThreadSnapshot {
  readonly threadId: string;
  readonly title: string;
  readonly project: string;
  readonly status: ThreadStatus;
  readonly startedAt: number;
  /** Last time this thread changed state; drives most-recently-active order. */
  readonly lastActiveAt: number;
}

/** Builds the content-state: runningCount = total active, up to 3 rows,
 * most-recently-active first. Redacts titles/projects when requested. */
export function buildContentState(
  active: readonly ActiveThreadSnapshot[],
  redact: boolean,
): RemoteLiveActivityContentState {
  const ordered = [...active].sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  return {
    runningCount: active.length,
    threads: ordered.slice(0, 3).map((thread) => ({
      threadId: thread.threadId,
      title: redact ? REDACTED_TITLE : thread.title,
      project: redact ? REDACTED_PROJECT : thread.project,
      status: thread.status,
      startedAt: thread.startedAt,
    })),
  };
}

/** Fixed generic title retained by the titled Android and web surfaces. */
export const GENERIC_ALERT_TITLE = "A conversation";

/** Apple localization keys accepted in production `aps.alert` dictionaries. */
export const IOS_ALERT_TITLE_LOC_KEY = "push.alert.title" as const;
export const IOS_ALERT_BODY_LOC_KEYS = {
  running: "push.alert.running",
  finished: "push.alert.finished",
  error: "push.alert.error",
  needsApproval: "push.alert.needsApproval",
  needsInput: "push.alert.needsInput",
  updated: "push.alert.updated",
} as const;

export type IOSAlertBodyLocKey =
  (typeof IOS_ALERT_BODY_LOC_KEYS)[keyof typeof IOS_ALERT_BODY_LOC_KEYS];

/** No `*-loc-args` are permitted: every localized alert is content-free. */
export interface IOSLocalizedAlertContent {
  readonly "title-loc-key": typeof IOS_ALERT_TITLE_LOC_KEY;
  readonly "loc-key": IOSAlertBodyLocKey;
}

const IOS_ALERT_BODY_LOC_KEY_SET: ReadonlySet<string> = new Set(
  Object.values(IOS_ALERT_BODY_LOC_KEYS),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rejects literal strings, unknown localization keys, arguments, and extra fields. */
export function assertIOSLocalizedAlert(alert: unknown): asserts alert is IOSLocalizedAlertContent {
  if (!isRecord(alert)) {
    throw new Error("Invalid iOS APNs localized alert; refusing to send");
  }
  const keys = Object.keys(alert);
  if (
    keys.length !== 2 ||
    !keys.includes("title-loc-key") ||
    !keys.includes("loc-key") ||
    alert["title-loc-key"] !== IOS_ALERT_TITLE_LOC_KEY ||
    typeof alert["loc-key"] !== "string" ||
    !IOS_ALERT_BODY_LOC_KEY_SET.has(alert["loc-key"])
  ) {
    throw new Error("Invalid iOS APNs localized alert; refusing to send");
  }
}

export interface IOSPushPayload {
  readonly aps: Record<string, unknown>;
  readonly [IOS_PUSH_ROUTING_KEY]?: RemotePushPayloadRouting;
}

/** Final APNs boundary guard shared by ordinary and ActivityKit sends. */
export function assertIOSPushPayload(
  payload: unknown,
  pushType: "alert" | "liveactivity",
): asserts payload is IOSPushPayload {
  if (!isRecord(payload) || !isRecord(payload.aps)) {
    throw new Error("Invalid iOS APNs payload; refusing to send");
  }
  const alert = payload.aps.alert;
  if (pushType === "alert" || payload.aps.event === "start") {
    assertIOSLocalizedAlert(alert);
  } else if (alert !== undefined) {
    assertIOSLocalizedAlert(alert);
  }
}

function toSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

interface LiveActivityPayloadBase {
  readonly contentState: RemoteLiveActivityContentState;
  readonly now: number;
  /** Present only for `end`. */
  readonly dismissalDate?: number;
  readonly routing?: RemotePushPayloadRouting;
}

type LiveActivityPayloadInput = LiveActivityPayloadBase &
  (
    | {
        readonly event: "start";
        readonly attributes: DesktopSessionAttributes;
        /** ActivityKit requires an alert for push-to-start. */
        readonly alert: IOSLocalizedAlertContent;
      }
    | {
        readonly event: "update" | "end";
        readonly attributes?: DesktopSessionAttributes;
        readonly alert?: IOSLocalizedAlertContent;
      }
  );

/** Builds an APNs `liveactivity` payload (start / update / end). */
export function buildLiveActivityPayload(input: LiveActivityPayloadInput): IOSPushPayload {
  const aps: Record<string, unknown> = {
    timestamp: toSeconds(input.now),
    event: input.event,
    "content-state": input.contentState,
    "stale-date": toSeconds(input.now + STALE_AHEAD_MS),
  };
  if (input.event === "start" && input.attributes) {
    aps["attributes-type"] = "DesktopSessionAttributes";
    aps.attributes = input.attributes;
  }
  if (input.event === "end") {
    aps["dismissal-date"] = toSeconds(input.dismissalDate ?? input.now + DISMISSAL_AHEAD_MS);
  }
  if (input.alert) {
    assertIOSLocalizedAlert(input.alert);
    aps.alert = { ...input.alert };
  }
  const payload = {
    aps,
    ...(input.routing ? { [IOS_PUSH_ROUTING_KEY]: input.routing } : {}),
  };
  assertIOSPushPayload(payload, "liveactivity");
  return payload;
}

/** Builds an ordinary APNs `alert` push payload (iOS only). */
export function buildAlertPayload(
  alert: IOSLocalizedAlertContent,
  routing?: RemotePushPayloadRouting,
): IOSPushPayload {
  assertIOSLocalizedAlert(alert);
  const payload = {
    aps: {
      alert: { ...alert },
      sound: "default",
    },
    ...(routing ? { [IOS_PUSH_ROUTING_KEY]: routing } : {}),
  };
  assertIOSPushPayload(payload, "alert");
  return payload;
}

/**
 * Android status-notification payload. Android has no Live Activity: the
 * desktop sends FCM notification messages that the OS auto-renders. The
 * coordinator supplies a bounded composite collapse id, mapped to FCM
 * `collapse_key` + `tag`, so one routed host/thread card replaces itself
 * ("Running" → "Needs your input" → "Finished") without colliding with the
 * same thread id on another host. `silent` requests a quiet tray update.
 */
interface AndroidStatusPayloadBase {
  readonly title: string;
  readonly body: string;
  readonly threadId: string;
  readonly silent?: boolean;
}

/** New payloads carry the complete route; legacy payloads keep the old shape. */
export type AndroidStatusPayload =
  | AndroidStatusPayloadBase
  | (AndroidStatusPayloadBase & RemotePushPayloadRouting);

interface AndroidStatusInput {
  readonly title: string;
  readonly body: string;
  readonly threadId: string;
  readonly silent?: boolean;
  readonly routing?: RemotePushPayloadRouting;
}

/** Builds the Android status-notification payload the gateway forwards to FCM. */
export function buildAndroidStatusPayload(input: AndroidStatusInput): AndroidStatusPayload {
  const base: AndroidStatusPayloadBase = {
    title: input.title,
    body: input.body,
    threadId: input.threadId,
    ...(input.silent ? { silent: true } : {}),
  };
  return input.routing ? { ...base, ...input.routing } : base;
}

export function staleDateSeconds(now: number): number {
  return toSeconds(now + STALE_AHEAD_MS);
}

export function dismissalDateMs(now: number): number {
  return now + DISMISSAL_AHEAD_MS;
}
