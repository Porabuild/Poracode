import { afterEach, describe, expect, it, vi } from "vitest";
import { connectionRefreshSubject } from "./refreshTokens";
import { __resetSharedCredentialsForTest, runCredentialExclusive } from "./sharedCredentials";

afterEach(() => {
  Reflect.deleteProperty(navigator, "locks");
  __resetSharedCredentialsForTest();
});

describe("runCredentialExclusive", () => {
  it("holds one Web Lock per grant across realms when the platform has them", async () => {
    const request = vi.fn<(name: string, callback: () => Promise<string>) => Promise<string>>(
      async (_name, callback) => callback(),
    );
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });

    await expect(
      runCredentialExclusive(connectionRefreshSubject("desktop-1"), async () => "done"),
    ).resolves.toBe("done");
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "poracode.credentials.refresh.desktop-1",
      expect.any(Function),
    );
  });

  it("serializes within the realm when Web Locks are unavailable", async () => {
    const order: string[] = [];
    const first = Promise.withResolvers<void>();
    const subject = connectionRefreshSubject("desktop-1");
    const running = runCredentialExclusive(subject, async () => {
      order.push("first:start");
      await first.promise;
      order.push("first:end");
    });
    const next = runCredentialExclusive(subject, async () => {
      order.push("second");
    });
    const other = runCredentialExclusive(connectionRefreshSubject("desktop-2"), async () => {
      order.push("other-grant");
    });
    await other;
    expect(order).toEqual(["first:start", "other-grant"]);
    first.resolve();
    await Promise.all([running, next]);
    expect(order).toEqual(["first:start", "other-grant", "first:end", "second"]);
  });

  it("keeps the queue moving after a failed section", async () => {
    const subject = connectionRefreshSubject("desktop-1");
    await expect(
      runCredentialExclusive(subject, async () => {
        throw new Error("refresh failed");
      }),
    ).rejects.toThrow("refresh failed");
    await expect(runCredentialExclusive(subject, async () => "next")).resolves.toBe("next");
  });
});
