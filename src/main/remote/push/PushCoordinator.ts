import type { ThreadStatus } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import {
  buildAlertPayload,
  buildAndroidStatusPayload,
  buildContentState,
  buildLiveActivityPayload,
  dismissalDateMs,
  GENERIC_ALERT_TITLE,
  IOS_ALERT_BODY_LOC_KEYS,
  IOS_ALERT_TITLE_LOC_KEY,
  type ActiveThreadSnapshot,
  type AndroidStatusPayload,
  type DesktopSessionAttributes,
  type IOSLocalizedAlertContent,
} from "./payloads";
import {
  androidStatusFor,
  iosAlertContent,
  pushAlertTitle,
  webAlertContent,
} from "./pushAlertContent";
import type { SendPush } from "./pushGateway";
import {
  pushRegistrationIdentity,
  type PushRegistrationStore,
  type StoredPushRegistration,
} from "./PushRegistrationStore";
import { pushCollapseId, pushPayloadRouting } from "./pushRouting";

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

function alertCategory(status: ThreadStatus): "done" | "needsAttention" | "error" | null {
  if (status === "finished") return "done";
  if (status === "needs_approval" || status === "needs_reply") return "needsAttention";
  if (status === "error") return "error";
  return null;
}

const DEBOUNCE_MS = 3_000;

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
  /** Android working-push debounce timers, keyed by registration + thread. */
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
    const suppressNotification = event.forceCloseActiveTurn === true;
    const attentionAlert =
      changed && !suppressNotification && ATTENTION_STATUSES.has(status)
        ? iosAlertContent(status)
        : undefined;
    // iOS: aggregate desktop-session Live Activity sync per device.
    for (const reg of this.options.store.list()) {
      if (reg.platform !== "ios") continue;
      const category = alertCategory(status);
      const deviceAlert =
        category && reg.alertPreferences?.statuses[category] === false ? undefined : attentionAlert;
      this.scheduleDeviceSync(
        reg,
        event.threadId,
        causedStart || causedEnd || deviceAlert !== undefined,
        deviceAlert,
      );
    }

    // iOS: ordinary alert pushes on attention / terminal transitions.
    if (changed && !suppressNotification && ALERT_STATUSES.has(status)) {
      void this.sendAlertPushes(event.threadId, status).catch(() => {});
    }

    // Android: per-thread replaceable status notification (no Live Activity).
    if (changed) {
      this.handleAndroidTransition(event.threadId, status, suppressNotification);
    }
  }

  /** Android per-thread status push. Routed registrations receive v1 custom
   * data, while legacy registrations retain the released payload shape. */
  private handleAndroidTransition(
    threadId: string,
    status: ThreadStatus,
    suppressNotification: boolean,
  ): void {
    const spec = androidStatusFor(status);
    if (suppressNotification || !spec) {
      this.clearAndroidTimersForThread(threadId);
      return;
    }
    for (const reg of this.options.store.list()) {
      if (reg.platform !== "android" || !reg.deviceToken) continue;
      const category = alertCategory(status);
      if (category && reg.alertPreferences?.statuses[category] === false) continue;
      const routing = pushPayloadRouting(reg.routing, threadId);
      const payload = buildAndroidStatusPayload({
        title: pushAlertTitle(
          this.threadInfo(threadId).title,
          this.options.getSettings().redactContent,
        ),
        body: spec.body,
        threadId,
        ...(spec.silent || reg.alertPreferences?.sound === false ? { silent: true } : {}),
        ...(routing ? { routing } : {}),
      });
      if (spec.immediate) {
        this.clearAndroidTimer(pushRegistrationIdentity(reg), threadId);
        void this.sendAndroidPush(reg, payload, spec.priority).catch(() => {});
      } else {
        this.scheduleAndroidPush(reg, threadId, payload, spec.priority);
      }
    }
  }

  private clearAndroidTimersForThread(threadId: string): void {
    for (const reg of this.options.store.list()) {
      if (reg.platform === "android") {
        this.clearAndroidTimer(pushRegistrationIdentity(reg), threadId);
      }
    }
  }

  private androidTimerKey(deviceId: string, threadId: string): string {
    return `${deviceId}\u0000${threadId}`;
  }

  private clearAndroidTimer(registrationId: string, threadId: string): void {
    const key = this.androidTimerKey(registrationId, threadId);
    const pending = this.androidTimers.get(key);
    if (pending !== undefined) {
      this.scheduler.clearTimeout(pending);
      this.androidTimers.delete(key);
    }
  }

  private scheduleAndroidPush(
    registration: StoredPushRegistration,
    threadId: string,
    payload: AndroidStatusPayload,
    priority: number,
  ): void {
    const registrationId = pushRegistrationIdentity(registration);
    this.clearAndroidTimer(registrationId, threadId);
    const key = this.androidTimerKey(registrationId, threadId);
    const handle = this.scheduler.setTimeout(() => {
      this.androidTimers.delete(key);
      void this.sendAndroidPush(registration, payload, priority).catch(() => {});
    }, DEBOUNCE_MS);
    this.androidTimers.set(key, handle);
  }

  private async sendAndroidPush(
    registration: StoredPushRegistration,
    payload: AndroidStatusPayload,
    priority: number,
  ): Promise<void> {
    if (!registration.deviceToken) return;
    const result = await this.options.sendPush({
      token: registration.deviceToken,
      platform: "android",
      pushType: "alert",
      payload,
      priority,
      collapseId: pushCollapseId(
        registration,
        registration.routing?.desktopId ?? this.attributes().desktopId,
        payload.threadId,
      ),
    });
    if (result.unregistered) {
      this.options.store.removeToken(
        registration.deviceId,
        { kind: "device" },
        registration.routing,
      );
    }
  }

  private scheduleDeviceSync(
    registration: StoredPushRegistration,
    threadId: string,
    urgent: boolean,
    alert: IOSLocalizedAlertContent | undefined,
  ): void {
    const registrationId = pushRegistrationIdentity(registration);
    if (urgent) {
      const pending = this.timers.get(registrationId);
      if (pending !== undefined) {
        this.scheduler.clearTimeout(pending);
        this.timers.delete(registrationId);
      }
      void this.syncDevice(registration, threadId, alert ? 10 : 5, alert).catch(() => {});
      return;
    }
    if (this.timers.has(registrationId)) return;
    const handle = this.scheduler.setTimeout(() => {
      this.timers.delete(registrationId);
      void this.syncDevice(registration, threadId, 5, undefined).catch(() => {});
    }, DEBOUNCE_MS);
    this.timers.set(registrationId, handle);
  }

  private async syncDevice(
    scheduledRegistration: StoredPushRegistration,
    threadId: string,
    priority: number,
    alert: IOSLocalizedAlertContent | undefined,
  ): Promise<void> {
    const reg = this.options.store.get(
      scheduledRegistration.deviceId,
      scheduledRegistration.routing,
    );
    if (!reg || reg.platform !== "ios") return;
    const active = [...this.activeThreads.values()];
    const contentState = buildContentState(active, this.options.getSettings().redactContent);
    const now = this.now();
    const registrationId = pushRegistrationIdentity(reg);
    const liveState = this.liveState.get(registrationId) ?? emptyLiveState();
    const activityEntries = Object.entries(reg.activityTokens);
    const routing = pushPayloadRouting(reg.routing, threadId);

    if (active.length > 0) {
      if (activityEntries.length > 0) {
        liveState.startSent = true;
        const payload = buildLiveActivityPayload({
          event: "update",
          contentState,
          now,
          ...(alert ? { alert } : {}),
          ...(routing ? { routing } : {}),
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
              this.options.store.removeToken(
                reg.deviceId,
                { kind: "activity", activityId },
                reg.routing,
              );
            }
          }),
        );
      } else if (reg.pushToStartToken && !liveState.startSent) {
        const attributes = this.attributes();
        const payload = buildLiveActivityPayload({
          event: "start",
          contentState,
          now,
          attributes: {
            ...attributes,
            ...(reg.routing ? { routing: reg.routing } : {}),
          },
          alert: alert ?? {
            "title-loc-key": IOS_ALERT_TITLE_LOC_KEY,
            "loc-key": IOS_ALERT_BODY_LOC_KEYS.running,
          },
          ...(routing ? { routing } : {}),
        });
        const result = await this.options.sendPush({
          token: reg.pushToStartToken,
          platform: "ios",
          pushType: "liveactivity",
          payload,
          priority,
        });
        if (result.unregistered) {
          this.options.store.removeToken(reg.deviceId, { kind: "pushToStart" }, reg.routing);
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
          ...(routing ? { routing } : {}),
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
              this.options.store.removeToken(
                reg.deviceId,
                { kind: "activity", activityId },
                reg.routing,
              );
            }
          }),
        );
      }
      liveState.startSent = false;
    }
    this.liveState.set(registrationId, liveState);
  }

  private async sendAlertPushes(threadId: string, status: ThreadStatus): Promise<void> {
    const content = webAlertContent(
      this.threadInfo(threadId).title,
      status,
      this.options.getSettings().redactContent,
    );
    await Promise.all(
      this.options.store.list().map(async (reg) => {
        // Android devices get their own status notifications (handleAndroidTransition).
        if (reg.platform === "android") return;
        if (reg.platform === "web") {
          if (!reg.webPushSubscription || !reg.webAppBasePath) return;
          const basePath = reg.webAppBasePath === "/" ? "" : reg.webAppBasePath.replace(/\/$/, "");
          const result = await this.options.sendPush({
            platform: "web",
            pushType: "alert",
            subscription: reg.webPushSubscription,
            payload: {
              title: content.title,
              body: content.body,
              threadId,
              url: `${basePath}/thread/${encodeURIComponent(threadId)}`,
            },
            priority: 10,
            collapseId: pushCollapseId(reg, this.attributes().desktopId, threadId),
          });
          if (result.unregistered) {
            this.options.store.removeToken(reg.deviceId, { kind: "web" });
          }
          return;
        }
        if (!reg.deviceToken) return;
        const category = alertCategory(status);
        if (category && reg.alertPreferences?.statuses[category] === false) return;
        const payload = buildAlertPayload(
          iosAlertContent(status),
          pushPayloadRouting(reg.routing, threadId),
          reg.alertPreferences?.sound ?? true,
        );
        const result = await this.options.sendPush({
          token: reg.deviceToken,
          platform: "ios",
          pushType: "alert",
          payload,
          priority: 10,
          collapseId: pushCollapseId(
            reg,
            reg.routing?.desktopId ?? this.attributes().desktopId,
            threadId,
          ),
        });
        if (result.unregistered) {
          this.options.store.removeToken(reg.deviceId, { kind: "device" }, reg.routing);
        }
      }),
    );
  }

  private threadInfo(threadId: string): { title: string; project: string } {
    const thread = this.options.getThreads().find((entry) => entry.id === threadId);
    if (!thread) return { title: GENERIC_ALERT_TITLE, project: "" };
    const project = this.options.getProjects().find((entry) => entry.id === thread.projectId);
    return { title: thread.title, project: project?.name ?? "" };
  }

  private attributes(): DesktopSessionAttributes {
    return this.options.getAttributes?.() ?? { desktopId: "desktop", desktopName: "Poracode" };
  }
}
