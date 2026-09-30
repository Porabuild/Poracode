import { describe, expect, it } from "vitest";
import { parsePushRequest } from "../../../../website/src/lib/push/validate";

describe("hosted Web Push gateway contract", () => {
  const valid = {
    platform: "web",
    pushType: "alert",
    subscription: {
      endpoint: "https://web.push.apple.com/subscription-1",
      expirationTime: null,
      keys: { p256dh: "p256dh_key", auth: "auth_key" },
    },
    payload: {
      title: "Thread",
      body: "Finished",
      threadId: "thread-1",
      url: "/app/thread/thread-1",
    },
  };

  it("accepts the desktop's Web Push envelope", () => {
    expect(parsePushRequest(valid)).toMatchObject({ ok: true, value: valid });
  });

  it("rejects arbitrary delivery hosts and cross-origin click URLs", () => {
    expect(
      parsePushRequest({
        ...valid,
        subscription: { ...valid.subscription, endpoint: "https://example.test/push" },
      }).ok,
    ).toBe(false);
    expect(
      parsePushRequest({
        ...valid,
        payload: { ...valid.payload, url: "https://attacker.test/" },
      }).ok,
    ).toBe(false);
  });
});
