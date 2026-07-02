import type { ThreadStatus } from "@/shared/contracts";
import type { RemoteLiveActivityContentState } from "@/shared/remote";

/** How far ahead to mark a Live Activity stale if no further update arrives
 * (covers a desktop that dies mid-run). */
const STALE_AHEAD_MS = 10 * 60 * 1000;
/** How long a finished session lingers on the lock screen before auto-dismiss. */
const DISMISSAL_AHEAD_MS = 15 * 60 * 1000;

/** Fixed Live Activity attributes, set once at start. Mirrors the Swift
 * `DesktopSessionAttributes`. */
export interface DesktopSessionAttributes {
  readonly desktopId: string;
  readonly desktopName: string;
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

export interface AlertContent {
  readonly title: string;
  readonly body: string;
}

function toSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

interface LiveActivityPayloadInput {
  readonly event: "start" | "update" | "end";
  readonly contentState: RemoteLiveActivityContentState;
  readonly now: number;
  readonly attributes?: DesktopSessionAttributes;
  readonly alert?: AlertContent;
  /** Present only for `end`. */
  readonly dismissalDate?: number;
}

/** Builds an APNs `liveactivity` payload (start / update / end). */
export function buildLiveActivityPayload(input: LiveActivityPayloadInput): unknown {
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
    aps.alert = { title: input.alert.title, body: input.alert.body };
  }
  return { aps };
}

/** Builds an ordinary APNs `alert` push payload. */
export function buildAlertPayload(alert: AlertContent): unknown {
  return {
    aps: {
      alert: { title: alert.title, body: alert.body },
      sound: "default",
    },
  };
}

/**
 * Android status-notification payload. Android gets no native code and no
 * Live Activity: the desktop sends FCM **notification** messages that the OS
 * auto-renders. Successive pushes for a thread share `collapseId = threadId`
 * (sent as the wire `collapseId`, mapped to FCM `collapse_key` + `tag`), so a
 * thread's tray notification REPLACES itself ("Running" → "Needs your input" →
 * "Finished") — approximating a status card. `silent` requests a quiet tray
 * update (low notification priority).
 */
export interface AndroidStatusPayload {
  readonly title: string;
  readonly body: string;
  readonly threadId: string;
  readonly silent?: boolean;
}

interface AndroidStatusInput {
  readonly title: string;
  readonly body: string;
  readonly threadId: string;
  readonly silent?: boolean;
}

/** Builds the Android status-notification payload the gateway forwards to FCM. */
export function buildAndroidStatusPayload(input: AndroidStatusInput): AndroidStatusPayload {
  return {
    title: input.title,
    body: input.body,
    threadId: input.threadId,
    ...(input.silent ? { silent: true } : {}),
  };
}

export function staleDateSeconds(now: number): number {
  return toSeconds(now + STALE_AHEAD_MS);
}

export function dismissalDateMs(now: number): number {
  return now + DISMISSAL_AHEAD_MS;
}
