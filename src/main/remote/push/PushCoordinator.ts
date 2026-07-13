import type { ThreadStatus } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import {
  buildAlertPayload,
  buildAndroidStatusPayload,
  buildContentState,
  buildLiveActivityPayload,
  dismissalDateMs,
  type ActiveThreadSnapshot,
  type AlertContent,
  type AndroidStatusPayload,
  type DesktopSessionAttributes,
} from "./payloads";
import type { SendPush } from "./pushGateway";
import type { PushRegistrationStore } from "./PushRegistrationStore";

/** Statuses that keep a thread "running" in the desktop-session activity. */
const ACTIVE_STATUSES: ReadonlySet<ThreadStatus> = new Set<ThreadStatus>([
  "working",
  "needs_approval",
  "needs_reply",
]);

/** Transitions that break through with priority 10 + an alert dict in the Live
 * Activity payload, and that trigger a plain alert push. */
const ATTENTION_STATUSES: ReadonlySet<ThreadStatus> = new Set<ThreadStatus>([
  "needs_approval",
  "needs_reply",
  "error",
]);

/** Statuses that fire an ordinary alert push on transition. */
const ALERT_STATUSES: ReadonlySet<ThreadStatus> = new Set<ThreadStatus>([
  "finished",
  "error",
  "needs_approval",
  "needs_reply",
]);

const DEBOUNCE_MS = 3_000;
const GENERIC_TITLE = "A conversation";

export interface PushScheduler {
  setTimeout(handler: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

const defaultScheduler: PushScheduler = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

export interface PushCoordinatorOptions {
  readonly store: PushRegistrationStore;
  readonly sendPush: SendPush;
  readonly getThreads: () => ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly projectId: string;
  }>;
  readonly getProjects: () => ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly getSettings: () => { readonly redactContent: boolean; readonly enabled: boolean };
  /** Fixed Live Activity attributes for push-to-start. */
  readonly getAttributes?: () => DesktopSessionAttributes;
  readonly now?: () => number;
  readonly scheduler?: PushScheduler;
}

interface DeviceLiveState {
  /** iOS: a push-to-start `start` was sent and we're awaiting the app's activity
   * token; guards against re-sending start every tick. */
  startSent: boolean;
}

function emptyLiveState(): DeviceLiveState {
  return { startSent: false };
}

/**
 * How the Android tray notification for a thread-state transition should be
 * sent. Body strings are user-visible on the phone but originate here in the
 * desktop main process, so they stay plain English — push-body localization is
 * a future concern (matches the iOS alert pushes, which do the same).
 */
interface AndroidStatusSpec {
  readonly body: string;
  readonly priority: number;
  /** Immediate (attention/finished/error) vs debounced (working). */
  readonly immediate: boolean;
  readonly silent?: boolean;
}

/** Maps a thread status to its Android status notification, or null (no push
 * for idle/inactive/launching). */
function androidStatusFor(
  status: ThreadStatus,
  errorMessage: string | undefined,
): AndroidStatusSpec | null {
  switch (status) {
    case "working":
      // First activation of a thread: a quiet "Running" card, coalesced.
      return { body: "Running", priority: 5, immediate: false, silent: true };
    case "needs_approval":
    case "needs_reply":
      return { body: "Needs your input", priority: 10, immediate: true };
    case "finished":
      return { body: "Finished", priority: 10, immediate: true };
    case "error":
      return { body: truncateError(errorMessage), priority: 10, immediate: true };
    default:
      return null;
  }
}

/** Error bodies are truncated to ~120 chars; empty/absent falls back to "Error". */
function truncateError(errorMessage: string | undefined): string {
  const trimmed = errorMessage?.trim();
  if (!trimmed) return "Error";
  return trimmed.length > 120 ? trimmed.slice(0, 120) : trimmed;
}

/**
 * Maps supervisor `thread-state` transitions to push notifications and iOS
 * Live Activity updates for every registered device. One "desktop session"
 * Live Activity per device carries up to 3 running threads.
 *
 * Provider-agnostic: it consumes only `ThreadStatus` / `ThreadAttention`.
 */
export class PushCoordinator {
  private readonly activeThreads = new Map<string, ActiveThreadSnapshot>();
  private readonly lastStatusByThread = new Map<string, ThreadStatus>();
  private readonly liveState = new Map<string, DeviceLiveState>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Android working-push debounce timers, keyed by `deviceId\0threadId`. */
  private readonly androidTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly scheduler: PushScheduler;
  private readonly now: () => number;

  constructor(private readonly options: PushCoordinatorOptions) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.now = options.now ?? (() => Date.now());
  }

  handleSupervisorEvent(event: SupervisorEvent): void {
    if (event.type !== "thread-state") return;
    if (!this.options.getSettings().enabled) return;
    this.handleThreadState(event);
  }

  private handleThreadState(event: Extract<SupervisorEvent, { type: "thread-state" }>): void {
    const now = this.now();
    const status = event.status;
    const prevStatus = this.lastStatusByThread.get(event.threadId);
    this.lastStatusByThread.set(event.threadId, status);

    const hadAnyActive = this.activeThreads.size > 0;
    const existing = this.activeThreads.get(event.threadId);
    if (ACTIVE_STATUSES.has(status)) {
      const info = this.threadInfo(event.threadId);
      this.activeThreads.set(event.threadId, {
        threadId: event.threadId,
        title: info.title,
        project: info.project,
        status,
        startedAt: existing?.startedAt ?? now,
        lastActiveAt: now,
      });
    } else {
      this.activeThreads.delete(event.threadId);
    }
    const hasAnyActive = this.activeThreads.size > 0;
    const causedStart = !hadAnyActive && hasAnyActive;
    const causedEnd = hadAnyActive && !hasAnyActive;

    const changed = status !== prevStatus;
    const attentionAlert =
      changed && ATTENTION_STATUSES.has(status)
        ? this.alertContent(event.threadId, status)
        : undefined;
    const urgent = causedStart || causedEnd || attentionAlert !== undefined;

    // iOS: aggregate desktop-session Live Activity sync per device.
    for (const reg of this.options.store.list()) {
      if (reg.platform === "android") continue;
      this.scheduleDeviceSync(reg.deviceId, urgent, attentionAlert);
    }

    // iOS: ordinary alert pushes on attention / terminal transitions.
    if (changed && ALERT_STATUSES.has(status)) {
      void this.sendAlertPushes(event.threadId, status).catch(() => {});
    }

    // Android: per-thread replaceable status notification (no Live Activity).
    if (changed) {
      this.handleAndroidTransition(event.threadId, status, event.errorMessage);
    }
  }

  /**
   * Android per-thread status push. Successive pushes for a thread share
   * `collapseId = threadId`, so the tray notification replaces itself. Working
   * is quiet + debounced (coalesces bursts); attention / terminal transitions
   * flush immediately and cancel any pending working push for that thread so a
   * stale "Running" can't land on top of "Finished".
   */
  private handleAndroidTransition(
    threadId: string,
    status: ThreadStatus,
    errorMessage: string | undefined,
  ): void {
    const spec = androidStatusFor(status, errorMessage);
    if (!spec) return;
    const payload = buildAndroidStatusPayload({
      title: this.androidTitle(threadId),
      body: spec.body,
      threadId,
      ...(spec.silent ? { silent: true } : {}),
    });
    for (const reg of this.options.store.list()) {
      if (reg.platform !== "android" || !reg.deviceToken) continue;
      const token = reg.deviceToken;
      if (spec.immediate) {
        this.clearAndroidTimer(reg.deviceId, threadId);
        void this.sendAndroidPush(reg.deviceId, token, payload, spec.priority).catch(() => {});
      } else {
        this.scheduleAndroidPush(reg.deviceId, threadId, token, payload, spec.priority);
      }
    }
  }

  private androidTimerKey(deviceId: string, threadId: string): string {
    return `${deviceId} ${threadId}`;
  }

  private clearAndroidTimer(deviceId: string, threadId: string): void {
    const key = this.androidTimerKey(deviceId, threadId);
    const pending = this.androidTimers.get(key);
    if (pending !== undefined) {
      this.scheduler.clearTimeout(pending);
      this.androidTimers.delete(key);
    }
  }

  private scheduleAndroidPush(
    deviceId: string,
    threadId: string,
    token: string,
    payload: AndroidStatusPayload,
    priority: number,
  ): void {
    this.clearAndroidTimer(deviceId, threadId);
    const key = this.androidTimerKey(deviceId, threadId);
    const handle = this.scheduler.setTimeout(() => {
      this.androidTimers.delete(key);
      void this.sendAndroidPush(deviceId, token, payload, priority).catch(() => {});
    }, DEBOUNCE_MS);
    this.androidTimers.set(key, handle);
  }

  private async sendAndroidPush(
    deviceId: string,
    token: string,
    payload: AndroidStatusPayload,
    priority: number,
  ): Promise<void> {
    const result = await this.options.sendPush({
      token,
      platform: "android",
      pushType: "alert",
      payload,
      priority,
      collapseId: payload.threadId,
    });
    if (result.unregistered) {
      this.options.store.removeToken(deviceId, { kind: "device" });
    }
  }

  private androidTitle(threadId: string): string {
    if (this.options.getSettings().redactContent) return GENERIC_TITLE;
    return this.threadInfo(threadId).title || GENERIC_TITLE;
  }

  private scheduleDeviceSync(
    deviceId: string,
    urgent: boolean,
    alert: AlertContent | undefined,
  ): void {
    if (urgent) {
      const pending = this.timers.get(deviceId);
      if (pending !== undefined) {
        this.scheduler.clearTimeout(pending);
        this.timers.delete(deviceId);
      }
      void this.syncDevice(deviceId, alert ? 10 : 5, alert).catch(() => {});
      return;
    }
    if (this.timers.has(deviceId)) return;
    const handle = this.scheduler.setTimeout(() => {
      this.timers.delete(deviceId);
      void this.syncDevice(deviceId, 5, undefined).catch(() => {});
    }, DEBOUNCE_MS);
    this.timers.set(deviceId, handle);
  }

  private async syncDevice(
    deviceId: string,
    priority: number,
    alert: AlertContent | undefined,
  ): Promise<void> {
    const reg = this.options.store.get(deviceId);
    if (!reg || reg.platform === "android") return;
    const active = [...this.activeThreads.values()];
    const contentState = buildContentState(active, this.options.getSettings().redactContent);
    const now = this.now();
    const liveState = this.liveState.get(deviceId) ?? emptyLiveState();
    const activityEntries = Object.entries(reg.activityTokens);

    if (active.length > 0) {
      if (activityEntries.length > 0) {
        liveState.startSent = true;
        const payload = buildLiveActivityPayload({
          event: "update",
          contentState,
          now,
          ...(alert ? { alert } : {}),
        });
        await Promise.all(
          activityEntries.map(async ([activityId, token]) => {
            const result = await this.options.sendPush({
              token,
              platform: "ios",
              pushType: "liveactivity",
              payload,
              priority,
            });
            if (result.unregistered) {
              this.options.store.removeToken(deviceId, { kind: "activity", activityId });
            }
          }),
        );
      } else if (reg.pushToStartToken && !liveState.startSent) {
        const payload = buildLiveActivityPayload({
          event: "start",
          contentState,
          now,
          attributes: this.attributes(),
          ...(alert ? { alert } : {}),
        });
        const result = await this.options.sendPush({
          token: reg.pushToStartToken,
          platform: "ios",
          pushType: "liveactivity",
          payload,
          priority,
        });
        if (result.unregistered) {
          this.options.store.removeToken(deviceId, { kind: "pushToStart" });
        } else if (result.ok) {
          liveState.startSent = true;
        }
      }
    } else {
      if (activityEntries.length > 0) {
        const payload = buildLiveActivityPayload({
          event: "end",
          contentState,
          now,
          dismissalDate: dismissalDateMs(now),
          ...(alert ? { alert } : {}),
        });
        await Promise.all(
          activityEntries.map(async ([activityId, token]) => {
            const result = await this.options.sendPush({
              token,
              platform: "ios",
              pushType: "liveactivity",
              payload,
              priority,
            });
            if (result.unregistered) {
              this.options.store.removeToken(deviceId, { kind: "activity", activityId });
            }
          }),
        );
      }
      liveState.startSent = false;
    }
    this.liveState.set(deviceId, liveState);
  }

  private async sendAlertPushes(threadId: string, status: ThreadStatus): Promise<void> {
    const content = this.alertContent(threadId, status);
    const payload = buildAlertPayload(content);
    await Promise.all(
      this.options.store.list().map(async (reg) => {
        // Android devices get their own status notifications (handleAndroidTransition).
        if (reg.platform === "android" || !reg.deviceToken) return;
        const result = await this.options.sendPush({
          token: reg.deviceToken,
          platform: "ios",
          pushType: "alert",
          payload,
          priority: 10,
        });
        if (result.unregistered) {
          this.options.store.removeToken(reg.deviceId, { kind: "device" });
        }
      }),
    );
  }

  private alertContent(threadId: string, status: ThreadStatus): AlertContent {
    const redact = this.options.getSettings().redactContent;
    const info = this.threadInfo(threadId);
    return {
      title: redact ? GENERIC_TITLE : info.title || GENERIC_TITLE,
      body: alertBody(status),
    };
  }

  private threadInfo(threadId: string): { title: string; project: string } {
    const thread = this.options.getThreads().find((entry) => entry.id === threadId);
    if (!thread) return { title: GENERIC_TITLE, project: "" };
    const project = this.options.getProjects().find((entry) => entry.id === thread.projectId);
    return { title: thread.title, project: project?.name ?? "" };
  }

  private attributes(): DesktopSessionAttributes {
    return this.options.getAttributes?.() ?? { desktopId: "desktop", desktopName: "Poracode" };
  }
}

function alertBody(status: ThreadStatus): string {
  switch (status) {
    case "finished":
      return "Finished";
    case "error":
      return "Ended with an error";
    case "needs_approval":
      return "Needs your approval";
    case "needs_reply":
      return "Needs your input";
    default:
      return "Updated";
  }
}
