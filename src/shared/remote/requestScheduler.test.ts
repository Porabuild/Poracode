import { afterEach, describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "@/shared/concurrency";
import { friendlyError } from "@/shared/messages";
import {
  RemoteClientError,
  RemoteDesktopClient,
  RemoteRequestScheduler,
  __resetDefaultRemoteRequestSchedulerForTest,
  classifyRemoteRequestPriority,
  remoteMutationMayHaveCommitted,
  type RemoteFetch,
} from "./client";

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("mapWithConcurrency", () => {
  it("bounds in-flight work and preserves input order", async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 10 }, (_, index) => index + 1);
    const results = await mapWithConcurrency(items, 3, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, (value % 3) * 2));
      active -= 1;
      return value * 10;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(results).toEqual(items.map((value) => value * 10));
  });
});

describe("classifyRemoteRequestPriority", () => {
  it("classifies control, interactive, and background traffic accurately", () => {
    expect(classifyRemoteRequestPriority("POST", "/api/threads/t1/interrupt")).toBe("control");
    expect(classifyRemoteRequestPriority("POST", "/api/threads/t1/close")).toBe("control");
    expect(classifyRemoteRequestPriority("POST", "/api/threads/t1/terminal/close")).toBe("control");
    expect(classifyRemoteRequestPriority("POST", "/api/threads/t1/requests/resolve")).toBe(
      "control",
    );
    expect(
      classifyRemoteRequestPriority(
        "POST",
        "/api/environments/env-1/proxy/api/threads/t1/interrupt",
      ),
    ).toBe("control");
    expect(classifyRemoteRequestPriority("POST", "/oauth/token")).toBe("control");
    expect(classifyRemoteRequestPriority("POST", "/api/auth/websocket-ticket")).toBe("control");

    expect(
      classifyRemoteRequestPriority("POST", "/api/git/call", {
        procedure: "gitGetWorktreeSourceBranch",
      }),
    ).toBe("background");
    expect(
      classifyRemoteRequestPriority("POST", "/api/git/call", {
        procedure: "ghPollPullRequests",
      }),
    ).toBe("background");
    expect(classifyRemoteRequestPriority("GET", "/api/files/image?path=/a.png")).toBe("background");
    expect(classifyRemoteRequestPriority("POST", "/api/files/image-ticket")).toBe("background");
    expect(classifyRemoteRequestPriority("GET", "/api/host/update")).toBe("background");
    expect(classifyRemoteRequestPriority("GET", "/api/agents/claude/slash-commands")).toBe(
      "background",
    );

    expect(classifyRemoteRequestPriority("POST", "/api/threads/start")).toBe("interactive");
    expect(classifyRemoteRequestPriority("POST", "/api/threads/new")).toBe("interactive");
    expect(classifyRemoteRequestPriority("POST", "/api/threads/t1/send")).toBe("interactive");
    expect(
      classifyRemoteRequestPriority("POST", "/api/git/call", { procedure: "gitAddWorktree" }),
    ).toBe("interactive");
    expect(
      classifyRemoteRequestPriority("POST", "/api/git/call", { procedure: "startThread" }),
    ).toBe("interactive");
    expect(classifyRemoteRequestPriority("GET", "/api/snapshot")).toBe("interactive");
  });
});

describe("RemoteRequestScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
    __resetDefaultRemoteRequestSchedulerForTest();
  });

  it("reserves headroom for interactive and control work under background saturation", async () => {
    const scheduler = new RemoteRequestScheduler({
      limits: { maxTotal: 5, maxBulk: 4, maxBackground: 2 },
    });
    const origin = "https://host-a.test";

    const bg1 = await scheduler.acquire(origin, "background");
    const bg2 = await scheduler.acquire(origin, "background");
    let bg3Granted = false;
    const bg3Promise = scheduler.acquire(origin, "background").then((lease) => {
      bg3Granted = true;
      return lease;
    });

    // Background cap reached: third background request queues, but interactive still runs immediately.
    expect(bg3Granted).toBe(false);
    const interactive1 = await scheduler.acquire(origin, "interactive");
    const interactive2 = await scheduler.acquire(origin, "interactive");

    // Bulk cap (4) reached: interactive3 queues, but control still uses the reserved 5th slot.
    let interactive3Granted = false;
    const interactive3Promise = scheduler.acquire(origin, "interactive").then((lease) => {
      interactive3Granted = true;
      return lease;
    });
    expect(interactive3Granted).toBe(false);

    const control1 = await scheduler.acquire(origin, "control");
    expect(scheduler.stats(origin)).toMatchObject({
      activeControl: 1,
      activeInteractive: 2,
      activeBackground: 2,
      queuedInteractive: 1,
      queuedBackground: 1,
    });

    // When a bulk slot frees, interactive dequeues ahead of queued background work.
    bg1.release();
    const interactive3 = await interactive3Promise;
    expect(interactive3Granted).toBe(true);
    expect(bg3Granted).toBe(false);

    interactive1.release();
    const bg3 = await bg3Promise;
    expect(bg3Granted).toBe(true);

    bg2.release();
    bg3.release();
    interactive2.release();
    interactive3.release();
    control1.release();
    expect(scheduler.stats(origin)).toMatchObject({
      activeControl: 0,
      activeInteractive: 0,
      activeBackground: 0,
    });
  });

  it("removes aborted queued waiters without consuming a slot", async () => {
    const scheduler = new RemoteRequestScheduler({
      limits: { maxTotal: 2, maxBulk: 2, maxBackground: 1 },
    });
    const origin = "https://host-abort.test";
    const held = await scheduler.acquire(origin, "background");
    const controller = new AbortController();
    const queued = scheduler.acquire(origin, "background", controller.signal);

    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    expect(scheduler.stats(origin).queuedBackground).toBe(0);

    held.release();
    expect(scheduler.stats(origin).activeBackground).toBe(0);
  });

  it("pauses new background work during overload backoff while keeping interactive traffic flowing", async () => {
    vi.useFakeTimers();
    const scheduler = new RemoteRequestScheduler({
      limits: { maxTotal: 4, maxBulk: 3, maxBackground: 2 },
    });
    const origin = "https://host-backoff.test";

    scheduler.noteOverload(origin, 500);
    let bgGranted = false;
    const bgPromise = scheduler.acquire(origin, "background").then((lease) => {
      bgGranted = true;
      return lease;
    });

    // Interactive work is unaffected by background pause.
    const interactive = await scheduler.acquire(origin, "interactive");
    expect(bgGranted).toBe(false);
    interactive.release();

    await vi.advanceTimersByTimeAsync(499);
    expect(bgGranted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const bg = await bgPromise;
    expect(bgGranted).toBe(true);
    bg.release();
  });

  it("adaptively lowers effective concurrency on overload and recovers after steady completions", async () => {
    vi.useFakeTimers();
    const scheduler = new RemoteRequestScheduler({
      limits: { maxTotal: 48, maxBulk: 40, maxBackground: 14 },
    });
    const origin = "https://host-aimd.test";

    scheduler.noteOverload(origin, 200);
    await vi.advanceTimersByTimeAsync(200);

    // After one overload event, background effective limit halved from 14 -> 7.
    const heldBg = await Promise.all(
      Array.from({ length: 7 }, () => scheduler.acquire(origin, "background")),
    );
    let eighthGranted = false;
    const eighth = scheduler.acquire(origin, "background").then((lease) => {
      eighthGranted = true;
      return lease;
    });
    expect(eighthGranted).toBe(false);

    // Release 8 leases to trigger additive recovery (+1 background slot -> 8).
    for (const lease of heldBg) lease.release();
    const lease8 = await eighth;
    expect(eighthGranted).toBe(true);
    lease8.release();

    const recoveredBg = await Promise.all(
      Array.from({ length: 8 }, () => scheduler.acquire(origin, "background")),
    );
    expect(recoveredBg).toHaveLength(8);
    for (const lease of recoveredBg) lease.release();
  });
});

describe("RemoteClientTransport scheduling and admission retry", () => {
  afterEach(() => {
    vi.useRealTimers();
    __resetDefaultRemoteRequestSchedulerForTest();
  });

  it("shares per-origin limits across sibling client instances and prioritizes interactive launches over background git storms", async () => {
    const scheduler = new RemoteRequestScheduler({
      limits: { maxTotal: 6, maxBulk: 5, maxBackground: 2 },
    });
    const resolvers: Array<() => void> = [];
    const startedProcedures: string[] = [];
    let activeBackground = 0;
    let peakBackground = 0;

    const fetchImpl: RemoteFetch = async (url, init) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/api/threads/start") {
        startedProcedures.push("startThread");
        return jsonResponse(200, { threadId: "t-new" });
      }
      const parsed = JSON.parse(String(init?.body ?? "{}")) as { procedure?: string };
      const proc = parsed.procedure ?? pathname;
      startedProcedures.push(proc);
      activeBackground += 1;
      peakBackground = Math.max(peakBackground, activeBackground);
      await new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });
      activeBackground -= 1;
      return jsonResponse(200, {
        result: { sourceBranch: "main", commitsAhead: 0, sourceAhead: 0 },
      });
    };

    const endpoint = "https://macbook.example.test/";
    // Separate client instances per call, mirroring remoteServersStore.withClient().
    let completedBg = 0;
    const bgCalls = Array.from({ length: 6 }, (_, index) => {
      const client = new RemoteDesktopClient(endpoint, "token", fetchImpl, {
        requestScheduler: scheduler,
      });
      return client
        .callRemoteProcedure("gitGetWorktreeSourceBranch", {
          projectLocation: { kind: "posix", path: "/repo" },
          branch: `wt-${index}`,
        })
        .then((res) => {
          completedBg += 1;
          return res;
        });
    });

    expect(peakBackground).toBe(2);
    expect(resolvers).toHaveLength(2);

    // Interactive thread start completes immediately despite 6 background git calls waiting.
    const launchClient = new RemoteDesktopClient(endpoint, "token", fetchImpl, {
      requestScheduler: scheduler,
    });
    const started = await launchClient.startThread({
      projectLocation: { kind: "posix", path: "/repo" },
      agentKind: "devin",
      config: { model: "m" },
      prompt: "bring upstream updates",
    });
    expect(started).toEqual({ threadId: "t-new" });
    expect(startedProcedures).toContain("startThread");

    await vi.waitFor(() => {
      while (resolvers.length > 0) resolvers.shift()?.();
      expect(completedBg).toBe(6);
    });
    await Promise.all(bgCalls);
    expect(peakBackground).toBe(2);
  });

  it.each([
    ["principal_busy", 429, { "retry-after": "1" }],
    ["settings_overloaded", 429, {}],
    ["host_busy", 503, { "retry-after": "1" }],
  ] as const)(
    "automatically retries transient %s (%i) admission refusals and succeeds",
    async (code, status, headers) => {
      vi.useFakeTimers();
      let attempts = 0;
      const fetchImpl = vi.fn<RemoteFetch>(async () => {
        attempts += 1;
        if (attempts < 3) {
          return jsonResponse(status, { error: { code, message: "Busy" } }, headers);
        }
        return jsonResponse(200, { threadId: "t-ok" });
      });
      const client = new RemoteDesktopClient("https://host-retry.test/", "token", fetchImpl, {
        requestScheduler: new RemoteRequestScheduler(),
      });

      const pending = client.startThread({
        projectLocation: { kind: "posix", path: "/repo" },
        agentKind: "devin",
        config: { model: "m" },
        prompt: "hello",
      });

      await vi.advanceTimersByTimeAsync(2_500);
      await expect(pending).resolves.toEqual({ threadId: "t-ok" });
      expect(attempts).toBe(3);
    },
  );

  it("automatically retries presend bridge overloaded (429) errors", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const fetchImpl = vi.fn<RemoteFetch>(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new RemoteClientError("Too many active remote requests.", 429, "overloaded", {
          requestPhase: "presend",
          requestMayHaveCommitted: false,
        });
      }
      return jsonResponse(200, { threadId: "t-bridge" });
    });
    const client = new RemoteDesktopClient("https://host-bridge.test/", "token", fetchImpl, {
      requestScheduler: new RemoteRequestScheduler(),
    });

    const pending = client.startThread({
      projectLocation: { kind: "posix", path: "/repo" },
      agentKind: "devin",
      config: { model: "m" },
      prompt: "hello",
    });

    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toEqual({ threadId: "t-bridge" });
    expect(attempts).toBe(2);
  });

  it("marks exhausted 503 host_busy mutations as uncommitted and maps them to remote.server.busy", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<RemoteFetch>(async () =>
      jsonResponse(503, { error: { code: "host_busy", message: "Host busy" } }),
    );
    const client = new RemoteDesktopClient("https://host-exhaust.test/", "token", fetchImpl, {
      requestScheduler: new RemoteRequestScheduler(),
      maxOverloadRetries: 1,
    });

    const pending = client
      .sendThreadInput({ threadId: "t1", prompt: "hi", config: { model: "m" } })
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);
    const error = await pending;

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(error).toMatchObject({ status: 503, code: "host_busy", requestMayHaveCommitted: false });
    expect(remoteMutationMayHaveCommitted(error)).toBe(false);
    expect(friendlyError(error)).toBe(
      "Too many remote requests are in progress. Try again in a moment.",
    );
  });

  it("aborts cleanly during overload retry backoff without dispatching again", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const fetchImpl = vi.fn<RemoteFetch>(async () => {
      attempts += 1;
      return jsonResponse(
        429,
        { error: { code: "principal_busy", message: "Busy" } },
        { "retry-after": "2" },
      );
    });
    const client = new RemoteDesktopClient("https://host-cancel-retry.test/", "token", fetchImpl, {
      requestScheduler: new RemoteRequestScheduler(),
    });
    const controller = new AbortController();
    const pending = client
      .threadHistory("t1", { signal: controller.signal })
      .catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(100);
    expect(attempts).toBe(1);
    controller.abort();
    const error = await pending;

    expect(error).toMatchObject({ status: 499, code: "cancelled", requestPhase: "presend" });
    expect(attempts).toBe(1);
  });

  it("does not deadlock when 401 refresh runs while all bulk slots are saturated", async () => {
    const scheduler = new RemoteRequestScheduler({
      limits: { maxTotal: 3, maxBulk: 2, maxBackground: 1 },
    });
    let currentToken = "expired";
    const fetchImpl = vi.fn<RemoteFetch>(async (url, init) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/oauth/token") {
        currentToken = "fresh";
        return jsonResponse(200, {
          accessToken: "fresh",
          tokenType: "Bearer",
          expiresAt: "2099-01-01T00:00:00.000Z",
          scopes: ["session:read"],
          refreshToken: "r2",
        });
      }
      if (init?.headers?.authorization !== "Bearer fresh") {
        return jsonResponse(401, { error: { code: "unauthorized", message: "Expired" } });
      }
      return jsonResponse(200, {});
    });

    const client = new RemoteDesktopClient("https://host-401.test/", "expired", fetchImpl, {
      requestScheduler: scheduler,
      tokenLifecycle: {
        accessToken: () => currentToken,
        refreshToken: () => "r1",
        onTokensRefreshed: () => undefined,
      },
    });

    const [a, b, c] = await Promise.all([
      client.callRemoteProcedure("gitUnwatchProject", { projectId: "p1" }),
      client.callRemoteProcedure("gitUnwatchProject", { projectId: "p2" }),
      client.callRemoteProcedure("gitUnwatchProject", { projectId: "p3" }),
    ]);
    expect([a, b, c]).toEqual([undefined, undefined, undefined]);
  });

  it("skips redundant pre-request TLS probes when the transport enforces the certificate pin directly", async () => {
    const probe = vi.fn<() => Promise<string | null>>(async () => "a".repeat(64));
    const seenPins: Array<string | null | undefined> = [];
    const fetchImpl = vi.fn<RemoteFetch>(async (_url, init) => {
      seenPins.push(init?.certFingerprint);
      return jsonResponse(200, { threadId: "t-pinned" });
    });
    const client = new RemoteDesktopClient("https://pinned.example.test/", "token", fetchImpl, {
      certFingerprint: "a".repeat(64),
      certFingerprintProbe: probe,
      transportEnforcesCertPin: true,
      requestScheduler: new RemoteRequestScheduler(),
    });

    const result = await client.startThread({
      projectLocation: { kind: "posix", path: "/repo" },
      agentKind: "devin",
      config: { model: "m" },
      prompt: "hello",
    });

    expect(result).toEqual({ threadId: "t-pinned" });
    expect(probe).not.toHaveBeenCalled();
    expect(seenPins).toEqual(["a".repeat(64)]);
  });
});
