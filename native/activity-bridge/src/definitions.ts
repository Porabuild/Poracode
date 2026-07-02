import type { PluginListenerHandle } from "@capacitor/core";

/**
 * A single conversation row shown inside a desktop-session Live Activity.
 * Mirrors `DesktopSessionAttributes.ContentState.ThreadRow` in Swift — the
 * keys must stay in sync with the ActivityKit `Codable` decoder and with the
 * `content-state` payload the push gateway sends to APNs.
 */
export interface ThreadRow {
  threadId: string;
  title: string;
  project: string;
  /** "working" | "needs_approval" | "needs_reply" | "idle" | "finished" | "error" */
  status: string;
  /** Epoch milliseconds; drives the elapsed `Text(timerInterval:)` timer. */
  startedAt: number;
}

/** Dynamic portion of a desktop-session activity (mutates over its lifetime). */
export interface ContentState {
  runningCount: number;
  /** Top ~3 threads, most-recently-active first (APNs payload cap is 4 KB). */
  threads: ThreadRow[];
}

/** Fixed attributes set once when the activity starts. */
export interface DesktopSessionAttributes {
  desktopId: string;
  /** e.g. hostname; rendered as the card header. */
  desktopName: string;
}

export interface IsSupportedResult {
  /** `ActivityAuthorizationInfo().areActivitiesEnabled` (iOS 16.2+). */
  liveActivities: boolean;
  /** Remote push-to-start capability (iOS 17.2+ and activities enabled). */
  pushToStart: boolean;
}

export interface GetPushToStartTokenResult {
  /** Hex-encoded push-to-start token, or null below iOS 17.2 / on timeout. */
  token: string | null;
}

export interface StartActivityOptions {
  attributes: DesktopSessionAttributes;
  contentState: ContentState;
}

export interface StartActivityResult {
  /** The started activity's id, or null when Live Activities are unavailable. */
  activityId: string | null;
}

export interface EndActivityOptions {
  activityId: string;
  contentState?: ContentState;
}

/** Emitted whenever ActivityKit rotates a per-activity APNs update token. */
export interface ActivityTokenUpdate {
  activityId: string;
  /** Hex-encoded per-activity update token (distinct from the device token). */
  token: string;
}

export interface ActivityBridgePlugin {
  /** Reports Live Activity + push-to-start capability for the current OS. */
  isSupported(): Promise<IsSupportedResult>;
  /**
   * Resolves the first push-to-start token (iOS 17.2+), hex-encoded. Resolves
   * `{ token: null }` below 17.2 or if no token arrives within a short timeout.
   */
  getPushToStartToken(): Promise<GetPushToStartTokenResult>;
  /**
   * Starts a desktop-session Live Activity with an update token
   * (`pushType: .token`). Used when push-to-start is unavailable (16.2–17.1)
   * or the app is foregrounded when a thread starts.
   */
  startActivity(options: StartActivityOptions): Promise<StartActivityResult>;
  /** Ends an activity (or all activities) with a ~15 min dismissal window. */
  endActivity(options: EndActivityOptions): Promise<void>;
  /**
   * Streams per-activity update tokens as ActivityKit rotates them. Also
   * re-emits the current token of every running activity on attach.
   */
  addListener(
    eventName: "activityTokenUpdate",
    listenerFunc: (update: ActivityTokenUpdate) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
