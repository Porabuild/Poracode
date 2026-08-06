import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PushRegistrationStore } from "./PushRegistrationStore";

describe("PushRegistrationStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "push-store-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("merges partial upserts, preserving absent token fields", () => {
    const store = new PushRegistrationStore(dir, () => 1000);
    store.upsert({ deviceId: "device-1234", platform: "ios", deviceToken: "dev-a" });
    store.upsert({ deviceId: "device-1234", platform: "ios", pushToStartToken: "pts-b" });
    store.upsert({
      deviceId: "device-1234",
      platform: "ios",
      activityTokens: { act1: "tok1" },
    });

    const record = store.get("device-1234");
    expect(record).toMatchObject({
      deviceId: "device-1234",
      deviceToken: "dev-a",
      pushToStartToken: "pts-b",
      activityTokens: { act1: "tok1" },
    });
  });

  it("merges activityTokens per-activity without dropping others", () => {
    const store = new PushRegistrationStore(dir);
    store.upsert({ deviceId: "device-1234", platform: "ios", activityTokens: { a: "1" } });
    store.upsert({ deviceId: "device-1234", platform: "ios", activityTokens: { b: "2" } });
    expect(store.get("device-1234")?.activityTokens).toEqual({ a: "1", b: "2" });
  });

  it("removeToken prunes a single token and drops empty records", () => {
    const store = new PushRegistrationStore(dir);
    store.upsert({
      deviceId: "device-1234",
      platform: "ios",
      deviceToken: "dev-a",
      activityTokens: { a: "1" },
    });
    store.removeToken("device-1234", { kind: "activity", activityId: "a" });
    expect(store.get("device-1234")?.activityTokens).toEqual({});
    expect(store.get("device-1234")?.deviceToken).toBe("dev-a");

    store.removeToken("device-1234", { kind: "device" });
    // No tokens left -> record removed entirely.
    expect(store.get("device-1234")).toBeUndefined();
  });

  it("persists across instances (round-trip)", () => {
    const store = new PushRegistrationStore(dir, () => 42);
    store.upsert({
      deviceId: "device-1234",
      platform: "ios",
      deviceToken: "dev-a",
      appVersion: "1.2.3",
    });

    const reopened = new PushRegistrationStore(dir);
    const record = reopened.get("device-1234");
    expect(record).toMatchObject({
      deviceId: "device-1234",
      deviceToken: "dev-a",
      appVersion: "1.2.3",
      activityTokens: {},
      updatedAt: 42,
    });
  });

  it("remove deletes the whole device record", () => {
    const store = new PushRegistrationStore(dir);
    store.upsert({ deviceId: "device-1234", platform: "ios", deviceToken: "dev-a" });
    store.remove("device-1234");
    expect(store.list()).toEqual([]);
  });

  it("persists and prunes a web Push API subscription", () => {
    const store = new PushRegistrationStore(dir, () => 42);
    const webPushSubscription = {
      endpoint: "https://web.push.apple.com/subscription-1",
      expirationTime: null,
      keys: { p256dh: "key-1", auth: "auth-1" },
    };
    store.upsert({
      deviceId: "browser-1234",
      platform: "web",
      webPushSubscription,
      webAppBasePath: "/app",
    });

    expect(new PushRegistrationStore(dir).get("browser-1234")).toMatchObject({
      platform: "web",
      webPushSubscription,
      webAppBasePath: "/app",
    });
    store.removeToken("browser-1234", { kind: "web" });
    expect(store.get("browser-1234")).toBeUndefined();
  });

  it("does not preserve native credentials across a platform change", () => {
    const store = new PushRegistrationStore(dir);
    store.upsert({ deviceId: "device-1234", platform: "ios", deviceToken: "apns-token" });
    store.upsert({
      deviceId: "device-1234",
      platform: "web",
      webPushSubscription: {
        endpoint: "https://web.push.apple.com/subscription-1",
        expirationTime: null,
        keys: { p256dh: "key-1", auth: "auth-1" },
      },
      webAppBasePath: "/",
    });

    expect(store.get("device-1234")).not.toHaveProperty("deviceToken");
  });
});
