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

  it("aggregates transient 503 delivery failures without using the error sink", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
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

    expect(onError).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("[poracode] Remote push send warning: transient-response.");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("subscription");
    warn.mockRestore();
  });

  it("does not forward raw network errors and permits one report per bounded window", async () => {
    let now = 1_000;
    const onError = vi.fn<(error: unknown) => void>();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
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

    expect(onError).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
    for (const [reported] of warn.mock.calls) {
      expect(reported).toBe("[poracode] Remote push send warning: timeout.");
      expect(reported).not.toContain("secret");
      expect(reported).not.toBe(rawFailure);
    }
    warn.mockRestore();
  });

  it("bounds repeated Web Push key 503 reports while allowing request retries", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn<GatewayFetch>(async () => ({ ok: false, status: 503 }));
    const resolve = createWebPushPublicKeyResolver({
      gatewayUrl: "https://gateway.example.test",
      fetchImpl,
      onError,
    });

    await expect(resolve()).rejects.toThrow("status 503");
    await expect(resolve()).rejects.toThrow("status 503");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "[poracode] Remote push resolve-web-key warning: transient-response.",
    );
    warn.mockRestore();
  });

  it("reports malformed non-transient responses as sanitized real errors", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const send = createPushGateway({
      gatewayUrl: "https://gateway.example.test",
      fetchImpl: vi.fn<GatewayFetch>(async () => ({ ok: false, status: 400 })),
      onError,
    });

    await send({
      platform: "ios",
      pushType: "alert",
      token: "private-token",
      payload: { private: "request-body" },
    });

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      name: "PushGatewayDiagnosticError",
      message: "Remote push send failed: invalid-response.",
      operation: "send",
      outcome: "invalid-response",
      platform: "ios",
      status: 400,
    });
    expect(JSON.stringify(onError.mock.calls[0]?.[0])).not.toContain("private");
  });
});
