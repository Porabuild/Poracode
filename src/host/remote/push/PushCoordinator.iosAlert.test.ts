import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadAttention, ThreadStatus } from "@/shared/contracts";
import {
  IOS_ALERT_BODY_LOC_KEYS,
  IOS_ALERT_TITLE_LOC_KEY,
  type DesktopSessionAttributes,
  type IOSAlertBodyLocKey,
  type IOSLocalizedAlertContent,
} from "./payloads";
import { PushCoordinator } from "./PushCoordinator";
import { PushRegistrationStore } from "./PushRegistrationStore";
import type { SendPush, SendPushResult } from "./pushGateway";

interface ApsPayload {
  aps: Record<string, unknown>;
}

const okResult: SendPushResult = { ok: true, status: 200, unregistered: false };
const bodyKeys = new Set(Object.values(IOS_ALERT_BODY_LOC_KEYS));

function threadState(threadId: string, status: ThreadStatus, attention: ThreadAttention = "none") {
  return { type: "thread-state", threadId, status, attention, canResumeWithConfig: false } as const;
}

function localizedAlert(locKey: IOSAlertBodyLocKey): IOSLocalizedAlertContent {
  return { "title-loc-key": IOS_ALERT_TITLE_LOC_KEY, "loc-key": locKey };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("PushCoordinator iOS localized alert privacy", () => {
  let dir: string;
  let store: PushRegistrationStore;
  let sendPush: ReturnType<typeof vi.fn<SendPush>>;
  const settings = { enabled: true, redactContent: false };

  function coordinator(title = "Release check"): PushCoordinator {
    return new PushCoordinator({
      store,
      sendPush,
      getThreads: () => [{ id: "thread-1", title, projectId: "project-1" }],
      getProjects: () => [{ id: "project-1", name: "Poracode" }],
      getSettings: () => settings,
      getAttributes: () => ({ desktopId: "desk-1", desktopName: "My Mac" }),
      now: () => 1_000_000,
    });
  }

  function iosAlertCalls() {
    return sendPush.mock.calls.filter(
      ([input]) => input.platform === "ios" && input.pushType === "alert",
    );
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "push-ios-alert-"));
    store = new PushRegistrationStore(dir, () => 1000);
    sendPush = vi.fn<SendPush>(async () => okResult);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("duplicates routed-v1 identity into guarded push-to-start attributes", async () => {
    const routing = {
      version: 1 as const,
      clientConnectionId: "11111111-1111-4111-8111-111111111111",
      desktopId: "desk-1",
    };
    store.upsert({
      deviceId: "ios-routed",
      platform: "ios",
      pushToStartToken: "pts-routed",
      routing,
    });
    coordinator().handleSupervisorEvent(threadState("thread-1", "working"));
    await tick();

    const payload = sendPush.mock.calls[0]![0].payload as {
      aps: { attributes: DesktopSessionAttributes; alert: IOSLocalizedAlertContent };
      poracode: Record<string, unknown>;
    };
    expect(payload.aps.attributes.routing).toEqual(routing);
    expect(payload.poracode).toEqual({ ...routing, threadId: "thread-1" });
    expect(payload.aps.alert).toEqual(localizedAlert(IOS_ALERT_BODY_LOC_KEYS.running));
  });

  it("keeps ordinary alerts content-free for hostile titles, errors, paths, and tokens", async () => {
    const secret = "sk-live-super-secret-123 /Users/alice/private/project/.env";
    store.upsert({
      deviceId: "device-0001",
      platform: "ios",
      deviceToken: "dev-1",
      routing: {
        version: 1,
        clientConnectionId: "11111111-1111-4111-8111-111111111111",
        desktopId: "desk-1",
      },
    });
    coordinator(secret).handleSupervisorEvent({
      ...threadState("thread-1", "error"),
      errorMessage: secret,
    });
    await tick();

    expect(iosAlertCalls().length).toBeGreaterThan(0);
    for (const [input] of iosAlertCalls()) {
      const payload = input.payload as ApsPayload;
      const alert = payload.aps.alert as IOSLocalizedAlertContent;
      expect(alert["title-loc-key"]).toBe(IOS_ALERT_TITLE_LOC_KEY);
      expect(bodyKeys.has(alert["loc-key"])).toBe(true);
      expect(Object.keys(alert).sort()).toEqual(["loc-key", "title-loc-key"]);
      expect(JSON.stringify(payload)).not.toContain(secret);
    }
  });

  it("keeps legacy ordinary alerts localized and content-free", async () => {
    const secret = "deploy key: /Users/alice/.ssh/id_rsa";
    store.upsert({ deviceId: "device-0001", platform: "ios", deviceToken: "dev-1" });
    coordinator(secret).handleSupervisorEvent(
      threadState("thread-1", "needs_reply", "needs_reply"),
    );
    await tick();

    const payload = iosAlertCalls()[0]![0].payload as ApsPayload;
    expect(payload.aps.alert).toEqual(localizedAlert(IOS_ALERT_BODY_LOC_KEYS.needsInput));
    expect(JSON.stringify(payload)).not.toContain(secret);
  });

  it("applies each iOS registration's status and sound preferences", async () => {
    store.upsert({
      deviceId: "quiet-device",
      platform: "ios",
      deviceToken: "quiet-token",
      alertPreferences: {
        sound: false,
        statuses: { done: true, needsAttention: false, error: true },
      },
    });
    const subject = coordinator();
    subject.handleSupervisorEvent(threadState("thread-1", "needs_reply", "needs_reply"));
    await tick();
    expect(iosAlertCalls()).toHaveLength(0);
    const attentionActivities = sendPush.mock.calls.filter(
      ([input]) =>
        input.pushType === "liveactivity" &&
        (input.payload as ApsPayload).aps.alert !== undefined &&
        (input.payload as ApsPayload).aps.event !== "start",
    );
    expect(attentionActivities).toHaveLength(0);

    subject.handleSupervisorEvent(threadState("thread-1", "error"));
    await tick();
    expect(iosAlertCalls()).toHaveLength(1);
    expect((iosAlertCalls()[0]![0].payload as ApsPayload).aps).not.toHaveProperty("sound");
  });

  it("keeps every ActivityKit alert dictionary content-free", async () => {
    const secret = "PRIVATE-TOKEN abc123 /var/lib/poracode";
    store.upsert({
      deviceId: "device-0001",
      platform: "ios",
      activityTokens: { a: "tok-a" },
      deviceToken: "dev-1",
    });
    const subject = coordinator(secret);
    subject.handleSupervisorEvent(threadState("thread-1", "working"));
    await tick();
    subject.handleSupervisorEvent(threadState("thread-1", "needs_approval", "needs_approval"));
    await tick();

    const withAlert = sendPush.mock.calls.filter(
      ([input]) =>
        input.pushType === "liveactivity" && (input.payload as ApsPayload).aps.alert !== undefined,
    );
    expect(withAlert.length).toBeGreaterThan(0);
    for (const [input] of withAlert) {
      const alert = (input.payload as ApsPayload).aps.alert as IOSLocalizedAlertContent;
      expect(alert["title-loc-key"]).toBe(IOS_ALERT_TITLE_LOC_KEY);
      expect(bodyKeys.has(alert["loc-key"])).toBe(true);
      expect(Object.keys(alert).sort()).toEqual(["loc-key", "title-loc-key"]);
      expect(JSON.stringify(alert)).not.toContain(secret);
    }
  });
});
