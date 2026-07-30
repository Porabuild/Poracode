import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SCHEDULE_AUTOMATION, type ScheduledTaskRun } from "@/shared/contracts";
import { RemoteDesktopClient } from "./client";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "./protocol";

describe("RemoteDesktopClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("exchanges pairing credentials without requiring a browser navigator", async () => {
    vi.stubGlobal("navigator", undefined);
    let body: unknown;
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      undefined,
      async (_url, init) => {
        body = JSON.parse(init?.body ?? "{}") as unknown;
        return new Response(
          JSON.stringify({
            accessToken: "lc_access_test",
            tokenType: "Bearer",
            expiresAt: "2099-01-01T00:00:00.000Z",
            scopes: ["session:read"],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    await expect(
      client.exchangePairingCredential({
        credential: "lc_pair_test",
        scopes: ["session:read"],
      }),
    ).resolves.toMatchObject({ accessToken: "lc_access_test" });
    expect(body).toMatchObject({
      client: {
        label: "Poracode web app",
        deviceType: "browser",
      },
    });
  });

  it("keeps profile-stats fields beyond the light shape check (loose parse)", async () => {
    const coreStats = {
      scope: "device",
      device: { id: "dev-1" },
      totals: { prompts: 3 },
      accounts: [{ key: "claude", label: "Claude", count: 3, share: 1 }],
      providers: [],
      availableAccounts: [],
      identity: { name: "Test", handle: "test", avatarColor: "oklch(0.6 0.14 295)" },
    };
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      "lc_access_test",
      async () =>
        new Response(JSON.stringify(coreStats), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    // A plain z.object would strip every key the check doesn't name; the
    // desktop ProfileSettings component reads accounts/providers/identity.
    await expect(client.profileCoreStats({ utcOffsetMinutes: 0 })).resolves.toEqual(coreStats);
  });

  it("preserves endpoint path prefixes when issuing HTTP requests", async () => {
    let requestedUrl = "";
    let authorization = "";
    const client = new RemoteDesktopClient(
      "https://relay.example.test/s/server-1/",
      "lc_access_test",
      async (url, init) => {
        requestedUrl = String(url);
        authorization = init?.headers?.authorization ?? "";
        return new Response(
          JSON.stringify({
            ticket: "lc_ws_test",
            expiresAt: "2099-01-01T00:00:00.000Z",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    await expect(client.websocketTicket()).resolves.toBe("lc_ws_test");

    expect(requestedUrl).toBe("https://relay.example.test/s/server-1/api/auth/websocket-ticket");
    expect(authorization).toBe("Bearer lc_access_test");
  });

  it("passes an abort signal to remote fetches", async () => {
    let signal: AbortSignal | undefined;
    const client = new RemoteDesktopClient(
      "https://relay.example.test/s/server-1/",
      "lc_access_test",
      async (_url, init) => {
        signal = init?.signal;
        return new Response(
          JSON.stringify({
            ticket: "lc_ws_test",
            expiresAt: "2099-01-01T00:00:00.000Z",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    await expect(client.websocketTicket()).resolves.toBe("lc_ws_test");

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  it("uses the optimistic message id as the remote send idempotency key", async () => {
    let commandId = "";
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      "lc_access_test",
      async (_url, init) => {
        commandId = init?.headers?.["x-poracode-command-id"] ?? "";
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await client.sendThreadInput({
      threadId: "thread-1",
      prompt: "continue",
      config: { model: "gpt-5" },
      userMessageItemId: "user-message-1",
    });

    expect(commandId).toBe("user-message-1");
  });

  it("times out requests even when the transport ignores abort signals", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      undefined,
      (_url, init) => {
        signal = init?.signal;
        return new Promise<Response>(() => {});
      },
      { requestTimeoutMs: 10 },
    );

    const request = client.environment();
    const result = request.then(
      () => "resolved",
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(10);

    expect(signal?.aborted).toBe(true);
    await expect(result).resolves.toMatchObject({
      code: "timeout",
      status: 0,
      message: "Remote request timed out after 10ms.",
    });
  });

  it("rejects direct remote responses above the configured body limit", async () => {
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      undefined,
      async () =>
        new Response("{}", {
          headers: { "content-length": "4", "content-type": "application/json" },
        }),
      { maxResponseBodyBytes: 3 },
    );

    await expect(client.environment()).rejects.toThrow("response body too large");
  });

  it("preserves endpoint path prefixes in WebSocket URLs", () => {
    const client = new RemoteDesktopClient("https://relay.example.test/s/server-1");

    expect(client.websocketUrl("lc_ws_test", 42)).toBe(
      "wss://relay.example.test/s/server-1/ws?ticket=lc_ws_test&lastSeenSeq=42",
    );
  });

  it("sends lastSeenSeq=0 (replay-from-start) but omits it for the no-snapshot sentinel", () => {
    const client = new RemoteDesktopClient("https://relay.example.test/s/server-1");

    // 0 means "I have snapshotSeq 0; replay everything since" — must be sent so
    // the server replays instead of treating it as "no replay".
    expect(client.websocketUrl("t", 0)).toBe(
      "wss://relay.example.test/s/server-1/ws?ticket=t&lastSeenSeq=0",
    );
    // null/undefined is the "no snapshot yet" sentinel → omitted.
    expect(client.websocketUrl("t", null)).toBe("wss://relay.example.test/s/server-1/ws?ticket=t");
    expect(client.websocketUrl("t", undefined)).toBe(
      "wss://relay.example.test/s/server-1/ws?ticket=t",
    );
  });

  const descriptorResponse = (protocolVersion: number, scopes: string[]): Response =>
    new Response(
      JSON.stringify({
        protocolVersion,
        desktopId: "desktop-1",
        label: "Test Desktop",
        appVersion: "1.0.0",
        auth: {
          policy: "remote-reachable",
          bootstrapMethods: ["one-time-token"],
          sessionMethods: ["bearer-access-token"],
          scopes,
        },
        endpoints: {
          httpBaseUrl: "http://127.0.0.1:38987/",
          wsBaseUrl: "ws://127.0.0.1:38987/",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  it("surfaces a protocol-version mismatch as a readable, branchable error", async () => {
    const client = new RemoteDesktopClient("http://127.0.0.1:38987/", undefined, async () =>
      descriptorResponse(999, ["session:read"]),
    );

    await expect(client.environment()).rejects.toMatchObject({
      code: "protocol_version_mismatch",
    });
    // Not a raw ZodError JSON dump.
    await expect(client.environment()).rejects.toThrow(/incompatible/i);
  });

  it("falls back to the legacy environment endpoint when the Poracode endpoint is unavailable", async () => {
    const requestedPaths: string[] = [];
    const client = new RemoteDesktopClient("http://127.0.0.1:38987/", undefined, async (url) => {
      const pathname = new URL(url).pathname;
      requestedPaths.push(pathname);
      if (pathname === "/.well-known/poracode/environment") {
        return new Response(
          JSON.stringify({ error: { code: "not_found", message: "Not found." } }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return descriptorResponse(PORACODE_REMOTE_PROTOCOL_VERSION, ["session:read"]);
    });

    await expect(client.environment()).resolves.toMatchObject({ desktopId: "desktop-1" });
    expect(requestedPaths).toEqual([
      "/.well-known/poracode/environment",
      "/.well-known/lightcode/environment",
    ]);
  });

  it("drops server-advertised scopes this build does not know instead of failing to parse", async () => {
    const client = new RemoteDesktopClient("http://127.0.0.1:38987/", undefined, async () =>
      descriptorResponse(PORACODE_REMOTE_PROTOCOL_VERSION, [
        "session:read",
        "session:operate",
        "future:capability",
      ]),
    );

    const descriptor = await client.environment();
    expect(descriptor.auth.scopes).toEqual(["session:read", "session:operate"]);
    expect(descriptor.auth.scopes).not.toContain("future:capability");
  });

  it("narrows unknown scopes echoed in a pairing token result", async () => {
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      undefined,
      async () =>
        new Response(
          JSON.stringify({
            accessToken: "lc_access_test",
            tokenType: "Bearer",
            expiresAt: "2099-01-01T00:00:00.000Z",
            scopes: ["session:read", "future:capability"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const result = await client.exchangePairingCredential({ credential: "lc_pair_test" });
    expect(result.scopes).toEqual(["session:read"]);
  });

  it("registers a caller-supplied client metadata (desktop-as-client) over the navigator default", async () => {
    let body: { client?: unknown } = {};
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      undefined,
      async (_url, init) => {
        body = JSON.parse(init?.body ?? "{}") as { client?: unknown };
        return new Response(
          JSON.stringify({
            accessToken: "lc_access_test",
            tokenType: "Bearer",
            expiresAt: "2099-01-01T00:00:00.000Z",
            scopes: ["session:read"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    await client.exchangePairingCredential({
      credential: "lc_pair_test",
      client: { label: "My Mac", deviceType: "desktop" },
    });
    expect(body.client).toEqual({ label: "My Mac", deviceType: "desktop" });
  });

  it("gives long-running git operations a larger timeout than ordinary requests", async () => {
    vi.useFakeTimers();
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      "lc_access_test",
      () => new Promise<Response>(() => {}),
      { requestTimeoutMs: 10 },
    );

    const push = client
      .gitCall("gitPush", { projectLocation: { kind: "posix", path: "/tmp/x" } })
      .then(
        () => "resolved",
        (error: unknown) => error,
      );
    // Ordinary 10ms deadline has long passed, but the push uses the 5-minute
    // long-op deadline, so it must still be pending.
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(Promise.race([push, Promise.resolve("pending")])).resolves.toBe("pending");

    // Once the long deadline elapses it times out (rather than never).
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await expect(push).resolves.toMatchObject({ code: "timeout" });
  });

  it("queries and updates schedule runs through the remote API", async () => {
    const run: ScheduledTaskRun = {
      id: "6f3b1a2c-1111-4d5e-8a9b-0c1d2e3f4a5b",
      scheduleId: "d2ac39e9-14ac-4776-9279-37a1e455a5db",
      threadId: "thread-schedule-run",
      scheduledFor: "2026-07-13T15:00:00.000Z",
      trigger: "scheduled",
      attempt: 1,
      iteration: 1,
      startedAt: "2026-07-13T15:00:00.000Z",
      completedAt: "2026-07-13T15:01:00.000Z",
      status: "succeeded",
      summary: "Found one item.",
      error: null,
      result: {
        outcome: "findings",
        summary: "Found one item.",
        severity: "warning",
        unread: true,
        archivedAt: null,
        changedFiles: [],
        stopReason: null,
      },
      automationSnapshot: DEFAULT_SCHEDULE_AUTOMATION,
    };
    const requests: Array<{ pathname: string; body: unknown }> = [];
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      "lc_access_test",
      async (url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        const pathname = new URL(url).pathname;
        requests.push({ pathname, body });
        const response = pathname.endsWith("/query")
          ? { runs: [run] }
          : body.kind === "cancel"
            ? { cancelled: true }
            : { run: { ...run, result: { ...run.result!, unread: false } } };
        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await expect(client.scheduleRuns(run.scheduleId)).resolves.toEqual([run]);
    await expect(client.scheduleRunInbox({ filter: "unread", limit: 25 })).resolves.toEqual([run]);
    await expect(
      client.updateScheduleRunState({ id: run.id, unread: false }),
    ).resolves.toMatchObject({ id: run.id, result: { unread: false } });
    await expect(client.cancelScheduleRun(run.id)).resolves.toBe(true);

    expect(requests).toEqual([
      {
        pathname: "/api/schedules/runs/query",
        body: { kind: "schedule", payload: { id: run.scheduleId } },
      },
      {
        pathname: "/api/schedules/runs/query",
        body: { kind: "inbox", query: { filter: "unread", limit: 25 } },
      },
      {
        pathname: "/api/schedules/runs/command",
        body: { kind: "update-state", payload: { id: run.id, unread: false } },
      },
      {
        pathname: "/api/schedules/runs/command",
        body: { kind: "cancel", id: run.id },
      },
    ]);
  });
});
