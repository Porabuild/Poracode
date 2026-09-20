import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadStatus } from "@/shared/contracts";
import { PushCoordinator, type PushScheduler } from "./PushCoordinator";
import { PushRegistrationStore, pushRegistrationsFilePath } from "./PushRegistrationStore";
import type { SendPush, SendPushResult } from "./pushGateway";

const cleanups: Array<() => Promise<void>> = [];
const releases: Array<() => void> = [];
const ok: SendPushResult = { ok: true, status: 200, unregistered: false };
const gone: SendPushResult = { ok: false, status: 410, unregistered: true };

function fixture(send: SendPush = async () => ok) {
  const root = mkdtempSync(join(tmpdir(), "poracode-push-lifetime-"));
  const store = new PushRegistrationStore(root);
  const sendPush = vi.fn<SendPush>(send);
  const getSettings = vi.fn<() => { enabled: boolean; redactContent: boolean }>(() => ({
    enabled: true,
    redactContent: true,
  }));
  const scheduled = new Map<ReturnType<typeof setTimeout>, () => void>();
  let next = 0;
  const scheduler: PushScheduler = {
    setTimeout(handler) {
      const handle = ++next as unknown as ReturnType<typeof setTimeout>;
      scheduled.set(handle, handler);
      return handle;
    },
    clearTimeout(handle) {
      scheduled.delete(handle);
    },
  };
  const coordinator = new PushCoordinator({
    store,
    sendPush,
    getSettings,
    scheduler,
    getThreads: () => [],
    getProjects: () => [],
  });
  cleanups.push(async () => {
    await coordinator.dispose();
    rmSync(root, { recursive: true, force: true });
  });
  function event(status: ThreadStatus, threadId = "synthetic-thread") {
    coordinator.handleSupervisorEvent({
      type: "thread-state",
      threadId,
      status,
      attention: "none",
      canResumeWithConfig: false,
    });
  }
  return { root, store, coordinator, sendPush, getSettings, scheduled, event };
}

function heldResult() {
  const held = Promise.withResolvers<SendPushResult>();
  releases.push(() => held.resolve(ok));
  return held;
}

async function turn() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

afterEach(async () => {
  for (const release of releases.splice(0)) release();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

describe("push coordinator lifetime", () => {
  it("shares stop and joins an admitted response without applying its late410", async () => {
    const held = heldResult();
    const test = fixture(() => held.promise);
    test.store.upsert({
      deviceId: "synthetic-android",
      platform: "android",
      deviceToken: "synthetic-device-token",
    });
    test.event("finished");
    expect(test.sendPush).toHaveBeenCalledOnce();
    const file = pushRegistrationsFilePath(test.root);
    const before = readFileSync(file, "utf8");
    const closing = test.coordinator.dispose();
    expect(test.coordinator.dispose()).toBe(closing);
    let joined = false;
    void closing.then(() => {
      joined = true;
    });
    await turn();
    expect(joined).toBe(false);
    test.getSettings.mockClear();
    test.event("needs_reply");
    expect(test.getSettings).not.toHaveBeenCalled();
    held.resolve(gone);
    await closing;
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(test.sendPush).toHaveBeenCalledOnce();
  });

  it("cancels both debounce timer sets and refuses callbacks already queued before stop", async () => {
    const test = fixture();
    test.store.upsert({
      deviceId: "synthetic-ios",
      platform: "ios",
      activityTokens: { active: "synthetic-live-token" },
    });
    test.store.upsert({
      deviceId: "synthetic-android",
      platform: "android",
      deviceToken: "synthetic-device-token",
    });
    test.event("working", "first");
    await turn();
    test.event("working", "second");
    const queued = [...test.scheduled.values()];
    expect(queued).toHaveLength(3);
    await test.coordinator.dispose();
    expect(test.scheduled.size).toBe(0);
    test.sendPush.mockClear();
    test.getSettings.mockClear();
    for (const callback of queued) callback();
    test.event("finished", "first");
    await turn();
    expect(test.sendPush).not.toHaveBeenCalled();
    expect(test.getSettings).not.toHaveBeenCalled();
  });

  it.each(["liveactivity", "web-alert"])(
    "joins a held sibling after another %s send rejects",
    async (kind) => {
      const held = heldResult();
      let calls = 0;
      const test = fixture(() =>
        ++calls === 1 ? Promise.reject(new Error("synthetic rejected sibling")) : held.promise,
      );
      if (kind === "liveactivity") {
        test.store.upsert({
          deviceId: "synthetic-ios",
          platform: "ios",
          activityTokens: { first: "synthetic-first", second: "synthetic-second" },
        });
        test.event("working");
      } else {
        for (const deviceId of ["synthetic-web-a", "synthetic-web-b"])
          test.store.upsert({
            deviceId,
            platform: "web",
            webAppBasePath: "/",
            webPushSubscription: {
              endpoint: `https://fixture.test/${deviceId}`,
              expirationTime: null,
              keys: { auth: "synthetic-auth", p256dh: "synthetic-key" },
            },
          });
        test.event("finished");
      }
      expect(test.sendPush).toHaveBeenCalledTimes(2);
      await turn();
      let joined = false;
      const closing = test.coordinator.dispose().then(() => {
        joined = true;
      });
      await turn();
      expect(joined).toBe(false);
      const before = readFileSync(pushRegistrationsFilePath(test.root), "utf8");
      held.resolve(gone);
      await closing;
      expect(readFileSync(pushRegistrationsFilePath(test.root), "utf8")).toBe(before);
    },
  );

  it("registers work before a send adapter reenters disposal and admits no second send", async () => {
    const held = heldResult();
    let closing: Promise<void> | undefined;
    const test = fixture(() => {
      closing = test.coordinator.dispose();
      return held.promise;
    });
    for (const deviceId of ["synthetic-android-a", "synthetic-android-b"])
      test.store.upsert({ deviceId, platform: "android", deviceToken: deviceId });
    test.event("finished");
    expect(closing).toBeDefined();
    expect(test.sendPush).toHaveBeenCalledOnce();
    let joined = false;
    void closing!.then(() => {
      joined = true;
    });
    await turn();
    expect(joined).toBe(false);
    held.resolve(ok);
    await closing;
    expect(joined).toBe(true);
  });
});
