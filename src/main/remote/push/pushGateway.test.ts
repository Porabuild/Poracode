import { describe, expect, it, vi } from "vitest";
import {
  createPushGateway,
  createWebPushPublicKeyResolver,
  type CreatePushGatewayOptions,
} from "./pushGateway";

type GatewayFetch = NonNullable<CreatePushGatewayOptions["fetchImpl"]>;

describe("push gateway client", () => {
  it("sends a Web Push subscription without a native token", async () => {
    let body: Record<string, unknown> = {};
    const send = createPushGateway({
      gatewayUrl: "https://gateway.example.test",
      fetchImpl: vi.fn<GatewayFetch>(async (_url, init) => {
        body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
        return { ok: false, status: 404 };
      }),
    });

    await expect(
      send({
        platform: "web",
        pushType: "alert",
        subscription: {
          endpoint: "https://web.push.apple.com/subscription-1",
          expirationTime: null,
          keys: { p256dh: "key", auth: "auth" },
        },
        payload: { title: "Thread", body: "Finished", threadId: "t1", url: "/thread/t1" },
      }),
    ).resolves.toMatchObject({ status: 404, unregistered: true });

    expect(body).toMatchObject({
      platform: "web",
      subscription: { endpoint: "https://web.push.apple.com/subscription-1" },
    });
    expect(body).not.toHaveProperty("token");
  });

  it("resolves the gateway VAPID public key", async () => {
    const resolve = createWebPushPublicKeyResolver({
      gatewayUrl: "https://gateway.example.test",
      fetchImpl: vi.fn<GatewayFetch>(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ publicKey: "vapid-key" }),
      })),
    });

    await expect(resolve()).resolves.toBe("vapid-key");
  });

  it("aggregates transient 503 delivery failures as privacy-safe operational health", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const send = createPushGateway({
      gatewayUrl: "https://gateway.example.test",
      fetchImpl: vi.fn<GatewayFetch>(async () => ({ ok: false, status: 503 })),
      onError,
    });
    const input = {
      platform: "web",
      pushType: "alert",
      subscription: {
        endpoint: "https://web.push.apple.com/private-subscription",
        expirationTime: null,
        keys: { p256dh: "private-key", auth: "private-auth" },
      },
      payload: { title: "Private", body: "Private", threadId: "secret", url: "/thread/secret" },
    } as const;

    await send(input);
    await send(input);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      name: "PushGatewayOperationalWarning",
      message: "Remote push send warning: transient-response.",
      operation: "send",
      outcome: "transient-response",
      platform: "web",
      status: 503,
    });
    expect(JSON.stringify(onError.mock.calls[0]?.[0])).not.toContain("private");
    expect(JSON.stringify(onError.mock.calls[0]?.[0])).not.toContain("subscription");
  });

  it("does not forward raw network errors and permits one report per bounded window", async () => {
    let now = 1_000;
    const onError = vi.fn<(error: unknown) => void>();
    const rawFailure = Object.assign(
      new Error("request to https://gateway.example.test?token=secret failed"),
      { code: "ETIMEDOUT" },
    );
    const send = createPushGateway({
      gatewayUrl: "https://gateway.example.test",
      fetchImpl: vi.fn<GatewayFetch>(async () => {
        throw rawFailure;
      }),
      onError,
      now: () => now,
      operationalReportIntervalMs: 100,
    });
    const input = {
      platform: "ios",
      pushType: "alert",
      token: "secret-token",
      payload: {},
    } as const;

    await expect(send(input)).resolves.toMatchObject({
      status: 0,
      reason: "Gateway request timed out.",
    });
    await send(input);
    now += 100;
    await send(input);

    expect(onError).toHaveBeenCalledTimes(2);
    for (const [reported] of onError.mock.calls) {
      expect((reported as Error).message).toBe("Remote push send warning: timeout.");
      expect((reported as Error).message).not.toContain("secret");
      expect(reported).not.toBe(rawFailure);
    }
  });

  it("bounds repeated Web Push key 503 reports while allowing request retries", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const fetchImpl = vi.fn<GatewayFetch>(async () => ({ ok: false, status: 503 }));
    const resolve = createWebPushPublicKeyResolver({
      gatewayUrl: "https://gateway.example.test",
      fetchImpl,
      onError,
    });

    await expect(resolve()).rejects.toThrow("status 503");
    await expect(resolve()).rejects.toThrow("status 503");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      operation: "resolve-web-key",
      outcome: "transient-response",
      platform: "web",
      status: 503,
    });
  });
});
