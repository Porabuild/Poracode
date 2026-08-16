import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { buildFcmMessage } from "../../../../website/src/lib/push/fcm";
import { parsePushRequest } from "../../../../website/src/lib/push/validate";
import {
  IOS_ALERT_BODY_LOC_KEYS,
  IOS_ALERT_TITLE_LOC_KEY,
  buildAlertPayload,
  buildAndroidStatusPayload,
} from "./payloads";
import { PUSH_COLLAPSE_ID_MAX_BYTES, pushCollapseId, pushPayloadRouting } from "./pushRouting";

const routeA = {
  version: 1 as const,
  clientConnectionId: "11111111-1111-4111-8111-111111111111",
  desktopId: "shared-desktop",
};
const routeB = {
  ...routeA,
  clientConnectionId: "22222222-2222-4222-8222-222222222222",
};

describe("native push routing", () => {
  it("routes two host entries even when desktop and thread ids are identical", () => {
    const threadId = "shared-thread";
    const first = pushPayloadRouting(routeA, threadId);
    const second = pushPayloadRouting(routeB, threadId);

    expect(first).toEqual({ ...routeA, threadId });
    expect(second).toEqual({ ...routeB, threadId });
    expect(first).not.toEqual(second);
  });

  it("keeps APNs routing outside aps and never includes registration secrets", () => {
    const routing = pushPayloadRouting(routeA, "thread-1")!;
    const payload = buildAlertPayload(
      {
        "title-loc-key": IOS_ALERT_TITLE_LOC_KEY,
        "loc-key": IOS_ALERT_BODY_LOC_KEYS.finished,
      },
      routing,
    ) as {
      aps: Record<string, unknown>;
      poracode: Record<string, unknown>;
    };

    expect(payload.poracode).toEqual(routing);
    expect(payload.aps).not.toHaveProperty("poracode");
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("device-token-secret");
    expect(serialized).not.toContain("accessToken");
  });

  it("delivers every Android routing field as an FCM data string", () => {
    const routing = pushPayloadRouting(routeA, "thread-1")!;
    const payload = buildAndroidStatusPayload({
      title: "Title",
      body: "Finished",
      threadId: "thread-1",
      routing,
    });
    const parsed = parsePushRequest({
      platform: "android",
      token: "fcm-token",
      pushType: "alert",
      payload,
      collapseId: "pc1.example",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.value.platform !== "android") throw new Error("expected Android");
    expect(buildFcmMessage(parsed.value).message.data).toEqual({
      version: "1",
      clientConnectionId: routeA.clientConnectionId,
      desktopId: "shared-desktop",
      threadId: "thread-1",
    });
    expect(buildFcmMessage(parsed.value).message.android.notification.channel_id).toBe(
      "poracode_attention_v1",
    );
  });

  it("selects the quiet status channel only for silent Android updates", () => {
    const build = (silent: boolean) => {
      const parsed = parsePushRequest({
        platform: "android",
        token: "fcm-token",
        pushType: "alert",
        payload: buildAndroidStatusPayload({
          title: "Title",
          body: silent ? "Running" : "Needs your input",
          threadId: "thread-1",
          ...(silent ? { silent: true } : {}),
        }),
      });
      if (!parsed.ok || parsed.value.platform !== "android") throw new Error("expected Android");
      return buildFcmMessage(parsed.value);
    };

    expect(build(true).message.android.notification.channel_id).toBe("poracode_status_v1");
    expect(build(false).message.android.notification.channel_id).toBe("poracode_attention_v1");
  });

  it("preserves legacy Android and iOS payloads without routing fields", () => {
    const androidPayload = buildAndroidStatusPayload({
      title: "Title",
      body: "Running",
      threadId: "thread-1",
    });
    const android = parsePushRequest({
      platform: "android",
      token: "legacy-fcm-token",
      pushType: "alert",
      payload: androidPayload,
    });
    expect(android.ok).toBe(true);
    if (!android.ok || android.value.platform !== "android") throw new Error("expected Android");
    expect(buildFcmMessage(android.value).message).not.toHaveProperty("data");
    expect(
      buildAlertPayload({
        "title-loc-key": IOS_ALERT_TITLE_LOC_KEY,
        "loc-key": IOS_ALERT_BODY_LOC_KEYS.finished,
      }),
    ).toEqual({
      aps: {
        alert: {
          "title-loc-key": IOS_ALERT_TITLE_LOC_KEY,
          "loc-key": IOS_ALERT_BODY_LOC_KEYS.finished,
        },
        sound: "default",
      },
    });
  });

  it("rejects incomplete/malformed routes and routing nested inside aps", () => {
    const base = {
      platform: "android",
      token: "fcm-token",
      pushType: "alert",
      payload: {
        title: "Title",
        body: "Finished",
        threadId: "thread-1",
        version: 1,
        desktopId: "desktop-1",
      },
    };
    expect(parsePushRequest(base).ok).toBe(false);
    expect(
      parsePushRequest({
        platform: "ios",
        token: "a".repeat(64),
        pushType: "alert",
        payload: {
          aps: { poracode: { ...routeA, threadId: "thread-1" } },
        },
      }).ok,
    ).toBe(false);
  });

  it("uses bounded deterministic composite collapse ids without raw identifiers", () => {
    const legacy = { deviceId: "device-secret-1" };
    const routedA = { deviceId: "device-secret-1", routing: routeA };
    const routedB = { deviceId: "device-secret-1", routing: routeB };
    const threadId = "thread/" + "x".repeat(1_000);
    const first = pushCollapseId(routedA, routeA.desktopId, threadId);

    expect(pushCollapseId(routedA, routeA.desktopId, threadId)).toBe(first);
    expect(pushCollapseId(routedB, routeB.desktopId, threadId)).not.toBe(first);
    expect(pushCollapseId(legacy, routeA.desktopId, threadId)).not.toBe(first);
    expect(Buffer.byteLength(first, "utf8")).toBeLessThanOrEqual(PUSH_COLLAPSE_ID_MAX_BYTES);
    expect(first).not.toContain(threadId);
    expect(first).not.toContain(routeA.clientConnectionId);
    expect(first).not.toContain("device-secret-1");
  });

  it("uses length-delimited tuple hashing so ambiguous concatenations stay distinct", () => {
    const registration = { deviceId: "device-1", routing: routeA };
    expect(pushCollapseId(registration, "ab", "c")).not.toBe(
      pushCollapseId(registration, "a", "bc"),
    );
  });
});
