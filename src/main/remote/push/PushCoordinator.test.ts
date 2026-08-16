import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadAttention, ThreadStatus } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import {
  IOS_ALERT_BODY_LOC_KEYS,
  IOS_ALERT_TITLE_LOC_KEY,
  type IOSAlertBodyLocKey,
  type IOSLocalizedAlertContent,
} from "./payloads";
import { PushCoordinator } from "./PushCoordinator";
import { PushRegistrationStore } from "./PushRegistrationStore";
import type { SendPush, SendPushResult } from "./pushGateway";

interface ApsPayload {
  aps: Record<string, unknown>;
}

function threadState(
  threadId: string,
  status: ThreadStatus,
  attention: ThreadAttention = "none",
): Extract<SupervisorEvent, { type: "thread-state" }> {
  return { type: "thread-state", threadId, status, attention, canResumeWithConfig: false };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const okResult: SendPushResult = { ok: true, status: 200, unregistered: false };

function localizedAlert(locKey: IOSAlertBodyLocKey): IOSLocalizedAlertContent {
  return { "title-loc-key": IOS_ALERT_TITLE_LOC_KEY, "loc-key": locKey };
}

describe("PushCoordinator", () => {
  let dir: string;
  let store: PushRegistrationStore;
  let sendPush: ReturnType<typeof vi.fn<SendPush>>;
  let settings: { enabled: boolean; redactContent: boolean };
  let now: number;

  const threads = [{ id: "thread-1", title: "Release check", projectId: "project-1" }];
  const projects = [{ id: "project-1", name: "Poracode" }];

  function makeCoordinator(overrides: { threads?: typeof threads } = {}): PushCoordinator {
    return new PushCoordinator({
      store,
      sendPush,
      getThreads: () => overrides.threads ?? threads,
      getProjects: () => projects,
      getSettings: () => settings,
      getAttributes: () => ({ desktopId: "desk-1", desktopName: "My Mac" }),
      now: () => now,
    });
  }

  function liveActivityCalls(): ApsPayload[] {
    return sendPush.mock.calls
      .filter(([input]) => input.pushType === "liveactivity")
      .map(([input]) => input.payload as ApsPayload);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "push-coord-"));
    store = new PushRegistrationStore(dir, () => 1000);
    sendPush = vi.fn<SendPush>(async () => okResult);
    settings = { enabled: true, redactContent: false };
    now = 1_000_000;
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it("sends a push-to-start payload on the first working thread", async () => {
    store.upsert({ deviceId: "device-0001", platform: "ios", pushToStartToken: "pts-1" });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "working"));
    await tick();

    expect(sendPush).toHaveBeenCalledTimes(1);
    const [input] = sendPush.mock.calls[0]!;
    if (input.platform === "web") throw new Error("expected native push");
    expect(input.token).toBe("pts-1");
    expect(input.pushType).toBe("liveactivity");
    const payload = input.payload as ApsPayload;
    expect(payload.aps.event).toBe("start");
    expect(payload.aps["attributes-type"]).toBe("DesktopSessionAttributes");
    expect(payload.aps["content-state"]).toMatchObject({ runningCount: 1 });
    expect(payload.aps.alert).toEqual(localizedAlert(IOS_ALERT_BODY_LOC_KEYS.running));
    expect(payload.aps.attributes).not.toHaveProperty("routing");
  });

  it("does nothing when push is disabled", async () => {
    settings.enabled = false;
    store.upsert({ deviceId: "device-0001", platform: "ios", pushToStartToken: "pts-1" });
    makeCoordinator().handleSupervisorEvent(threadState("thread-1", "working"));
    await tick();
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("coalesces non-urgent updates behind a 3s debounce", async () => {
    vi.useFakeTimers();
    store.upsert({ deviceId: "device-0001", platform: "ios", activityTokens: { a: "tok-a" } });
    const coordinator = makeCoordinator();

    // First working thread => start transition => immediate update.
    coordinator.handleSupervisorEvent(threadState("thread-1", "working"));
    await vi.runAllTimersAsync();
    expect(sendPush).toHaveBeenCalledTimes(1);

    // Two more non-urgent ticks coalesce into a single trailing update.
    coordinator.handleSupervisorEvent(threadState("thread-2", "working"));
    coordinator.handleSupervisorEvent(threadState("thread-2", "working"));
    expect(sendPush).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(sendPush).toHaveBeenCalledTimes(2);
    expect(sendPush.mock.calls[1]![0].priority).toBe(5);
  });

  it("flushes attention transitions immediately at priority 10 with an alert", async () => {
    store.upsert({
      deviceId: "device-0001",
      platform: "ios",
      activityTokens: { a: "tok-a" },
      deviceToken: "dev-1",
    });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "working"));
    await tick();
    sendPush.mockClear();

    coordinator.handleSupervisorEvent(threadState("thread-1", "needs_approval", "needs_approval"));
    await tick();

    const liveActivity = sendPush.mock.calls.find(([input]) => input.pushType === "liveactivity");
    expect(liveActivity).toBeDefined();
    expect(liveActivity![0].priority).toBe(10);
    expect((liveActivity![0].payload as ApsPayload).aps.alert).toEqual(
      localizedAlert(IOS_ALERT_BODY_LOC_KEYS.needsApproval),
    );

    // A plain alert push also goes to the device token.
    const alert = sendPush.mock.calls.find(([input]) => input.pushType === "alert");
    expect(alert).toBeDefined();
    expect((alert![0].payload as ApsPayload).aps.alert).toEqual(
      localizedAlert(IOS_ALERT_BODY_LOC_KEYS.needsApproval),
    );
  });

  it("ends the activity with a dismissal-date when the last thread finishes", async () => {
    store.upsert({ deviceId: "device-0001", platform: "ios", activityTokens: { a: "tok-a" } });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "working"));
    await tick();
    sendPush.mockClear();

    coordinator.handleSupervisorEvent(threadState("thread-1", "finished"));
    await tick();

    const [endPayload] = liveActivityCalls();
    expect(endPayload!.aps.event).toBe("end");
    expect(endPayload!.aps["dismissal-date"]).toBeTypeOf("number");
  });

  it("sends a plain alert push on finished", async () => {
    store.upsert({ deviceId: "device-0001", platform: "ios", deviceToken: "dev-1" });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "working"));
    coordinator.handleSupervisorEvent(threadState("thread-1", "finished"));
    await tick();

    const alertCalls = sendPush.mock.calls.filter(([input]) => input.pushType === "alert");
    expect(alertCalls).toHaveLength(1);
    expect((alertCalls[0]![0].payload as ApsPayload).aps.alert).toEqual(
      localizedAlert(IOS_ALERT_BODY_LOC_KEYS.finished),
    );
  });

  it("updates iOS activity state without alerting for a user-forced turn close", async () => {
    vi.useFakeTimers();
    store.upsert({
      deviceId: "device-0001",
      platform: "ios",
      activityTokens: { a: "tok-a" },
      deviceToken: "dev-1",
    });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "working"));
    await vi.runAllTimersAsync();
    sendPush.mockClear();

    coordinator.handleSupervisorEvent({
      ...threadState("thread-1", "needs_reply", "needs_reply"),
      forceCloseActiveTurn: true,
    });
    await vi.advanceTimersByTimeAsync(3_000);

    const calls = sendPush.mock.calls;
    expect(calls.some(([input]) => input.pushType === "alert")).toBe(false);
    const activity = calls.find(([input]) => input.pushType === "liveactivity");
    expect(activity).toBeDefined();
    expect((activity![0].payload as ApsPayload).aps.alert).toBeUndefined();
  });

  it("redacts titles and project names when the setting is on", async () => {
    settings.redactContent = true;
    store.upsert({
      deviceId: "device-0001",
      platform: "ios",
      activityTokens: { a: "tok-a" },
      deviceToken: "dev-1",
    });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "working"));
    await tick();

    const [payload] = liveActivityCalls();
    const contentState = payload!.aps["content-state"] as {
      threads: Array<{ title: string; project: string }>;
    };
    expect(contentState.threads[0]).toMatchObject({ title: "A conversation", project: "" });
  });

  it("prunes a token when APNs reports it unregistered (410)", async () => {
    store.upsert({ deviceId: "device-0001", platform: "ios", activityTokens: { a: "tok-a" } });
    sendPush.mockResolvedValue({ ok: false, status: 410, unregistered: true });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "working"));
    await tick();

    expect(store.get("device-0001")).toBeUndefined();
  });

  it("web: sends a service-worker payload with the registered app route", async () => {
    store.upsert({
      deviceId: "browser-0001",
      platform: "web",
      webPushSubscription: {
        endpoint: "https://web.push.apple.com/subscription-1",
        expirationTime: null,
        keys: { p256dh: "key-1", auth: "auth-1" },
      },
      webAppBasePath: "/app",
    });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "working"));
    coordinator.handleSupervisorEvent(threadState("thread-1", "finished"));
    await tick();

    const webCalls = sendPush.mock.calls.filter(([input]) => input.platform === "web");
    expect(webCalls).toHaveLength(1);
    expect(webCalls[0]![0]).toMatchObject({
      platform: "web",
      pushType: "alert",
      collapseId: expect.stringMatching(/^pc1\.[A-Za-z0-9_-]{27}$/),
      payload: {
        title: "Release check",
        body: "Finished",
        threadId: "thread-1",
        url: "/app/thread/thread-1",
      },
    });
  });

  it("web: prunes a subscription rejected by the push service", async () => {
    store.upsert({
      deviceId: "browser-0001",
      platform: "web",
      webPushSubscription: {
        endpoint: "https://web.push.apple.com/subscription-1",
        expirationTime: null,
        keys: { p256dh: "key-1", auth: "auth-1" },
      },
      webAppBasePath: "/",
    });
    sendPush.mockResolvedValue({ ok: false, status: 410, unregistered: true });

    makeCoordinator().handleSupervisorEvent(threadState("thread-1", "needs_reply", "needs_reply"));
    await tick();

    expect(store.get("browser-0001")).toBeUndefined();
  });

  // ---- Android (auto-rendered FCM notification messages) --------------------

  function androidCalls() {
    return sendPush.mock.calls.filter(([input]) => input.platform === "android");
  }

  it("android: working is a silent p5 status with bounded composite collapse, debounced", async () => {
    vi.useFakeTimers();
    store.upsert({ deviceId: "device-0001", platform: "android", deviceToken: "fcm-1" });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "working"));
    // Debounced: nothing yet.
    expect(androidCalls()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(3_000);

    const calls = androidCalls();
    expect(calls).toHaveLength(1);
    const [input] = calls[0]!;
    if (input.platform === "web") throw new Error("expected Android push");
    expect(input.platform).toBe("android");
    expect(input.pushType).toBe("alert");
    expect(input.token).toBe("fcm-1");
    expect(input.priority).toBe(5);
    expect(input.collapseId).toMatch(/^pc1\.[A-Za-z0-9_-]{27}$/);
    expect(input.collapseId).not.toContain("thread-1");
    expect(input.payload).toMatchObject({
      title: "Release check",
      body: "Running",
      threadId: "thread-1",
      silent: true,
    });
  });

  it("android: needs_reply is an immediate p10 status", async () => {
    store.upsert({ deviceId: "device-0001", platform: "android", deviceToken: "fcm-1" });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "needs_reply", "needs_reply"));
    await tick();

    const calls = androidCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]![0].priority).toBe(10);
    expect(calls[0]![0].payload).toMatchObject({ body: "Needs your input", threadId: "thread-1" });
    expect(calls[0]![0].payload).not.toMatchObject({ silent: true });
  });

  it("android: finished is an immediate p10 status", async () => {
    store.upsert({ deviceId: "device-0001", platform: "android", deviceToken: "fcm-1" });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "working"));
    coordinator.handleSupervisorEvent(threadState("thread-1", "finished"));
    await tick();

    const finished = androidCalls().filter(
      ([i]) => (i.payload as { body: string }).body === "Finished",
    );
    expect(finished).toHaveLength(1);
    expect(finished[0]![0].priority).toBe(10);
  });

  it("android: error uses generic text and never includes arbitrary error details", async () => {
    store.upsert({ deviceId: "device-0001", platform: "android", deviceToken: "fcm-1" });
    const coordinator = makeCoordinator();
    const secret = "Bearer sk-live-super-secret /Users/alice/private/project";

    coordinator.handleSupervisorEvent({
      type: "thread-state",
      threadId: "thread-1",
      status: "error",
      attention: "none",
      canResumeWithConfig: false,
      errorMessage: secret,
    });
    await tick();
    expect((androidCalls()[0]![0].payload as { body: string }).body).toBe("Ended with an error");
    expect(JSON.stringify(sendPush.mock.calls)).not.toContain(secret);
  });

  it("android: redacts the title when the setting is on", async () => {
    settings.redactContent = true;
    store.upsert({ deviceId: "device-0001", platform: "android", deviceToken: "fcm-1" });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "needs_reply", "needs_reply"));
    await tick();

    expect(androidCalls()[0]![0].payload).toMatchObject({
      title: "A conversation",
      body: "Needs your input",
    });
  });

  it("android: sends nothing for idle transitions", async () => {
    store.upsert({ deviceId: "device-0001", platform: "android", deviceToken: "fcm-1" });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "idle"));
    await tick();
    expect(androidCalls()).toHaveLength(0);
  });

  it("android: cancels a queued running notification when the user stops or steers", async () => {
    vi.useFakeTimers();
    store.upsert({ deviceId: "device-0001", platform: "android", deviceToken: "fcm-1" });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "working"));
    coordinator.handleSupervisorEvent({
      ...threadState("thread-1", "idle"),
      forceCloseActiveTurn: true,
    });
    await vi.advanceTimersByTimeAsync(3_000);

    expect(androidCalls()).toHaveLength(0);
  });

  it("android: suppresses an immediate status alert for a user-forced turn close", async () => {
    store.upsert({ deviceId: "device-0001", platform: "android", deviceToken: "fcm-1" });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent({
      ...threadState("thread-1", "needs_reply", "needs_reply"),
      forceCloseActiveTurn: true,
    });
    await tick();

    expect(androidCalls()).toHaveLength(0);
  });

  it("android: prunes the record on a 410 from the gateway", async () => {
    store.upsert({ deviceId: "device-0001", platform: "android", deviceToken: "fcm-1" });
    sendPush.mockResolvedValue({ ok: false, status: 410, unregistered: true });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "needs_reply", "needs_reply"));
    await tick();
    expect(store.get("device-0001")).toBeUndefined();
  });

  it("mixed fleet: iOS gets liveactivity, Android gets alert, from one event", async () => {
    vi.useFakeTimers();
    store.upsert({ deviceId: "ios-0001", platform: "ios", activityTokens: { a: "tok-a" } });
    store.upsert({ deviceId: "and-0001", platform: "android", deviceToken: "fcm-1" });
    const coordinator = makeCoordinator();

    coordinator.handleSupervisorEvent(threadState("thread-1", "working"));
    await vi.runAllTimersAsync();

    const ios = sendPush.mock.calls.filter(([i]) => i.platform === "ios");
    const android = androidCalls();
    expect(ios.some(([i]) => i.pushType === "liveactivity")).toBe(true);
    expect(android).toHaveLength(1);
    expect(android[0]![0].pushType).toBe("alert");
    expect(android[0]![0].payload).toMatchObject({ body: "Running", silent: true });
  });

  it("routes identical desktop/thread ids to independent native host entries", async () => {
    const routeA = {
      version: 1 as const,
      clientConnectionId: "11111111-1111-4111-8111-111111111111",
      desktopId: "desk-1",
    };
    const routeB = {
      ...routeA,
      clientConnectionId: "22222222-2222-4222-8222-222222222222",
    };
    store.upsert({
      deviceId: "device-shared",
      platform: "android",
      deviceToken: "fcm-a",
      routing: routeA,
    });
    store.upsert({
      deviceId: "device-shared",
      platform: "android",
      deviceToken: "fcm-b",
      routing: routeB,
    });

    makeCoordinator().handleSupervisorEvent(threadState("thread-1", "needs_reply", "needs_reply"));
    await tick();

    const calls = androidCalls();
    expect(calls).toHaveLength(2);
    expect(calls.map(([input]) => input.collapseId)).toHaveLength(2);
    expect(new Set(calls.map(([input]) => input.collapseId)).size).toBe(2);
    expect(calls.map(([input]) => input.payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ...routeA, threadId: "thread-1" }),
        expect.objectContaining({ ...routeB, threadId: "thread-1" }),
      ]),
    );
  });
});
