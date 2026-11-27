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

describe("commitSharedRefresh", () => {
  it("persists a rotated grant before releasing its lock after failed vault writes", async () => {
    vi.useFakeTimers();
    try {
      const commit = vi.fn<(input: { refreshToken: string | undefined }) => Promise<string>>();
      commit.mockResolvedValueOnce("failed").mockResolvedValueOnce("failed");
      commit.mockResolvedValueOnce("committed");
      vi.doMock("./refreshTokens", async (importOriginal) => ({
        ...(await importOriginal<typeof import("./refreshTokens")>()),
        commitSharedCredential: commit,
      }));
      vi.resetModules();
      const { commitSharedRefresh, runCredentialExclusive: runExclusive } =
        await import("./sharedCredentials");
      const refreshTokens = await import("./refreshTokens");
      const applied: Array<{ refreshToken: string | undefined; durable: boolean }> = [];
      let memory: { accessToken: string | undefined; refreshToken: string | undefined } = {
        accessToken: "access-0",
        refreshToken: "refresh-0",
      };
      const subject = refreshTokens.connectionRefreshSubject("desktop-1");
      const settled = runExclusive(subject, () =>
        commitSharedRefresh(
          {
            subject,
            bearerConnectionKey: "desktop-1",
            isCurrent: () => true,
            canAdopt: () => true,
            current: () => memory,
            apply: (pair, durable) => {
              memory = pair;
              applied.push({ refreshToken: pair.refreshToken, durable });
            },
          },
          {
            accessToken: "access-1",
            refreshToken: "refresh-1",
            accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
          } as never,
        ),
      );
      const useSharedGrant = vi.fn<() => Promise<(typeof applied)[number] | undefined>>(async () =>
        applied.at(-1),
      );
      const next = runExclusive(subject, useSharedGrant);
      await vi.advanceTimersByTimeAsync(0);
      expect(commit).toHaveBeenCalledTimes(1);
      expect(useSharedGrant).not.toHaveBeenCalled();
      await vi.runAllTimersAsync();
      await settled;
      await expect(next).resolves.toEqual({ refreshToken: "refresh-1", durable: true });

      // The successor was retried until it landed; the grant was never deleted.
      expect(commit.mock.calls.map(([input]) => input.refreshToken)).toEqual([
        "refresh-1",
        "refresh-1",
        "refresh-1",
      ]);
      expect(applied).toEqual([
        { refreshToken: "refresh-1", durable: false },
        { refreshToken: "refresh-1", durable: true },
      ]);
    } finally {
      vi.doUnmock("./refreshTokens");
      vi.resetModules();
      vi.useRealTimers();
    }
  });

  it("abandons a pending re-land once a newer rotation replaced the pair in memory", async () => {
    vi.useFakeTimers();
    try {
      const commit = vi.fn<(input: { refreshToken: string | undefined }) => Promise<string>>();
      commit.mockResolvedValue("failed");
      vi.doMock("./refreshTokens", async (importOriginal) => ({
        ...(await importOriginal<typeof import("./refreshTokens")>()),
        commitSharedCredential: commit,
      }));
      vi.resetModules();
      const { commitSharedRefresh } = await import("./sharedCredentials");
      const refreshTokens = await import("./refreshTokens");
      let memory: { accessToken: string | undefined; refreshToken: string | undefined } = {
        accessToken: "access-0",
        refreshToken: "refresh-0",
      };
      const durable: Array<string | undefined> = [];
      const settled = commitSharedRefresh(
        {
          subject: refreshTokens.connectionRefreshSubject("desktop-1"),
          bearerConnectionKey: "desktop-1",
          isCurrent: () => true,
          canAdopt: () => true,
          current: () => memory,
          apply: (pair, isDurable) => {
            memory = pair;
            if (isDurable) durable.push(pair.refreshToken);
          },
        },
        {
          accessToken: "access-1",
          refreshToken: "refresh-1",
          accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
        } as never,
      );
      await vi.advanceTimersByTimeAsync(0);
      // A newer pair replaces this one before its retry runs.
      memory = { accessToken: "access-2", refreshToken: "refresh-2" };
      commit.mockClear();
      await vi.runAllTimersAsync();
      await settled;

      // The stale re-land neither writes the spent pair nor regresses memory.
      expect(commit).not.toHaveBeenCalled();
      expect(memory.refreshToken).toBe("refresh-2");
      expect(durable).toEqual([]);
    } finally {
      vi.doUnmock("./refreshTokens");
      vi.resetModules();
      vi.useRealTimers();
    }
  });
});
