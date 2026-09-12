import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PUSH_REGISTRATIONS_FILE_FORMAT_VERSION,
  PushRegistrationStore,
  pushRegistrationsFilePath,
} from "./PushRegistrationStore";

const routeA = {
  version: 1 as const,
  clientConnectionId: "11111111-1111-4111-8111-111111111111",
  desktopId: "shared-desktop",
};

const routeB = {
  ...routeA,
  clientConnectionId: "22222222-2222-4222-8222-222222222222",
};

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

  it("stores two routed hosts independently even when device/desktop ids match", () => {
    const store = new PushRegistrationStore(dir);
    store.upsert({
      deviceId: "device-1234",
      platform: "android",
      deviceToken: "token-a",
      routing: routeA,
    });
    store.upsert({
      deviceId: "device-1234",
      platform: "android",
      deviceToken: "token-b",
      routing: routeB,
    });

    expect(store.list()).toHaveLength(2);
    expect(store.get("device-1234", routeA)?.deviceToken).toBe("token-a");
    expect(store.get("device-1234", routeB)?.deviceToken).toBe("token-b");

    store.remove("device-1234", routeA);
    expect(store.get("device-1234", routeA)).toBeUndefined();
    expect(store.get("device-1234", routeB)?.deviceToken).toBe("token-b");
  });

  it("migrates a legacy unversioned file and writes the current format", () => {
    writeFileSync(
      pushRegistrationsFilePath(dir),
      JSON.stringify({
        registrations: [
          {
            deviceId: "device-legacy",
            platform: "ios",
            deviceToken: "legacy-token",
            activityTokens: {},
            updatedAt: 7,
          },
        ],
      }),
      { mode: 0o600 },
    );
    const store = new PushRegistrationStore(dir, () => 8);
    expect(store.get("device-legacy")?.deviceToken).toBe("legacy-token");

    store.upsert({ deviceId: "device-new", platform: "ios", deviceToken: "new-token" });
    const persisted = JSON.parse(readFileSync(pushRegistrationsFilePath(dir), "utf8")) as {
      formatVersion: number;
      registrations: unknown[];
    };
    expect(persisted.formatVersion).toBe(PUSH_REGISTRATIONS_FILE_FORMAT_VERSION);
    expect(persisted.registrations).toHaveLength(2);
  });

  it("migrates format v1 and persists native alert preferences in format v2", () => {
    writeFileSync(
      pushRegistrationsFilePath(dir),
      JSON.stringify({
        formatVersion: 1,
        registrations: [
          {
            deviceId: "device-legacy",
            platform: "ios",
            deviceToken: "legacy-token",
            activityTokens: {},
            routing: routeA,
            updatedAt: 7,
          },
        ],
      }),
      { mode: 0o600 },
    );
    const store = new PushRegistrationStore(dir, () => 8);
    expect(store.get("device-legacy", routeA)?.deviceToken).toBe("legacy-token");

    const alertPreferences = {
      sound: false,
      statuses: { done: false, needsAttention: true, error: true },
    };
    store.upsert({
      deviceId: "device-legacy",
      platform: "ios",
      routing: routeA,
      alertPreferences,
    });
    expect(new PushRegistrationStore(dir).get("device-legacy", routeA)?.alertPreferences).toEqual(
      alertPreferences,
    );
    const persisted = JSON.parse(readFileSync(pushRegistrationsFilePath(dir), "utf8")) as {
      formatVersion: number;
    };
    expect(persisted.formatVersion).toBe(2);
  });

  it("does not overwrite a future registration-file format", () => {
    const path = pushRegistrationsFilePath(dir);
    const future = '{"formatVersion":99,"registrations":[{"secret":"keep"}]}\n';
    writeFileSync(path, future, { mode: 0o600 });
    const store = new PushRegistrationStore(dir);

    expect(() =>
      store.upsert({ deviceId: "device-1234", platform: "ios", deviceToken: "token" }),
    ).toThrow("newer unsupported format");
    expect(readFileSync(path, "utf8")).toBe(future);
  });

  it("upgrading a legacy install to routed identity avoids duplicate delivery", () => {
    const store = new PushRegistrationStore(dir);
    store.upsert({ deviceId: "device-1234", platform: "ios", deviceToken: "legacy-token" });
    store.upsert({
      deviceId: "device-1234",
      platform: "ios",
      deviceToken: "routed-token",
      routing: routeA,
    });

    expect(store.list()).toHaveLength(1);
    expect(store.get("device-1234", routeA)?.deviceToken).toBe("routed-token");
  });
});
