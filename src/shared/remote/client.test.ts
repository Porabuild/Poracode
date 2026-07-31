import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient } from "./client";

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
        body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as unknown;
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

  it("reads and writes encoded project notes paths", async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const notes = {
      projectId: "project one",
      doc: { type: "doc", content: [] },
      todos: [],
      updatedAt: "2026-07-23T00:00:00.000Z",
    };
    const client = new RemoteDesktopClient(
      "https://relay.example.test/s/server-1/",
      "lc_access_test",
      async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
        });
        return new Response(JSON.stringify((init?.method ?? "GET") === "GET" ? { notes } : {}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await expect(client.projectNotes(notes.projectId)).resolves.toEqual(notes);
    await expect(client.setProjectNotes(notes)).resolves.toBeUndefined();

    expect(requests).toEqual([
      {
        url: "https://relay.example.test/s/server-1/api/projects/project%20one/notes",
        method: "GET",
        body: undefined,
      },
      {
        url: "https://relay.example.test/s/server-1/api/projects/project%20one/notes",
        method: "POST",
        body: notes,
      },
    ]);
  });

  it("reads, checks, enables, and deletes PR automation through the remote API", async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const watch = {
      projectId: "project one",
      prNumber: 42,
      headBranch: "feature/mobile",
      worktreePath: "/repo/worktree",
      watchEnabled: true,
      autoMerge: true,
      agentKind: "codex",
      config: { model: "gpt-5.6-sol", effort: "high" },
      lastCommentCursor: null,
      lastReviewCommentCursor: null,
      lastReviewCursor: null,
      lastCheckKey: null,
      activeThreadId: null,
      lastError: null,
    } as const;
    const client = new RemoteDesktopClient(
      "https://relay.example.test/s/server-1/",
      "lc_access_test",
      async (url, init) => {
        const method = init?.method ?? "GET";
        requests.push({
          url: String(url),
          method,
          body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
        });
        return new Response(JSON.stringify(method === "DELETE" ? { ok: true } : { watch }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    const input = {
      projectId: watch.projectId,
      prNumber: watch.prNumber,
      headBranch: watch.headBranch,
      worktreePath: watch.worktreePath,
      watchEnabled: true,
      autoMerge: true,
      agentKind: watch.agentKind,
      config: watch.config,
    };
    await expect(
      client.getPrWatch({ projectId: watch.projectId, prNumber: watch.prNumber }),
    ).resolves.toEqual(watch);
    await expect(
      client.checkPrWatch({ projectId: watch.projectId, prNumber: watch.prNumber }),
    ).resolves.toBeUndefined();
    await expect(client.upsertPrWatch(input)).resolves.toEqual(watch);
    await expect(
      client.deletePrWatch({ projectId: watch.projectId, prNumber: watch.prNumber }),
    ).resolves.toBeUndefined();

    expect(requests).toEqual([
      {
        url: "https://relay.example.test/s/server-1/api/pr-watches?projectId=project+one&prNumber=42",
        method: "GET",
        body: undefined,
      },
      {
        url: "https://relay.example.test/s/server-1/api/pr-watches/check",
        method: "POST",
        body: { projectId: watch.projectId, prNumber: watch.prNumber },
      },
      {
        url: "https://relay.example.test/s/server-1/api/pr-watches",
        method: "POST",
        body: input,
      },
      {
        url: "https://relay.example.test/s/server-1/api/pr-watches",
        method: "DELETE",
        body: { projectId: watch.projectId, prNumber: watch.prNumber },
      },
    ]);
  });

  it("requests a tail snapshot and encodes older runtime page cursors", async () => {
    const requestedUrls: string[] = [];
    const client = new RemoteDesktopClient(
      "https://relay.example.test/s/server-1/",
      "lc_access_test",
      async (url) => {
        requestedUrls.push(String(url));
        return new Response(JSON.stringify({ items: [], nextCursor: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await expect(
      client.threadRuntimeItemsPage({
        threadId: "thread one",
        beforePosition: 42,
        limit: 500,
        targetTimelineEntryCount: 40,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    await client.threadHistory("thread one").catch(() => undefined);
    await client
      .threadHistory("thread one", { targetTimelineEntryCount: 20 })
      .catch(() => undefined);

    expect(requestedUrls[0]).toBe(
      "https://relay.example.test/s/server-1/api/threads/thread%20one/history/items?limit=500&beforePosition=42&targetTimelineEntryCount=40",
    );
    expect(requestedUrls[1]).toBe(
      "https://relay.example.test/s/server-1/api/threads/thread%20one/history?runtimePage=1",
    );
    expect(requestedUrls[2]).toBe(
      "https://relay.example.test/s/server-1/api/threads/thread%20one/history?runtimePage=1&targetTimelineEntryCount=20",
    );
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

  it("forwards goal controls to the paired desktop", async () => {
    let requestUrl = "";
    let requestBody: unknown;
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      "lc_access_test",
      async (url, init) => {
        requestUrl = String(url);
        requestBody = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as unknown;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await client.controlThreadGoal({
      threadId: "thread-1",
      action: "edit",
      objective: "Ship edited goal",
    });

    expect(requestUrl).toBe("http://127.0.0.1:38987/api/threads/thread-1/goal");
    expect(requestBody).toEqual({ action: "edit", objective: "Ship edited goal" });
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

  it("allows WebSocket ticket requests to use the connection deadline", async () => {
    vi.useFakeTimers();
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      undefined,
      () => new Promise<Response>(() => {}),
    );

    const request = client.websocketTicket(15).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15);

    await expect(request).resolves.toMatchObject({
      code: "timeout",
      message: "Remote request timed out after 15ms.",
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
      return descriptorResponse(1, ["session:read"]);
    });

    await expect(client.environment()).resolves.toMatchObject({ desktopId: "desktop-1" });
    expect(requestedPaths).toEqual([
      "/.well-known/poracode/environment",
      "/.well-known/lightcode/environment",
    ]);
  });

  it("drops server-advertised scopes this build does not know instead of failing to parse", async () => {
    const client = new RemoteDesktopClient("http://127.0.0.1:38987/", undefined, async () =>
      descriptorResponse(1, ["session:read", "session:operate", "future:capability"]),
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
        body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
          client?: unknown;
        };
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

  it("builds authenticated local image URLs against the endpoint", () => {
    const client = new RemoteDesktopClient(
      "https://relay.example.test/s/server-1/",
      "lc_access_test",
    );

    const url = new URL(client.localImageUrl("C:\\Users\\me\\img one.png"));

    expect(url.origin).toBe("https://relay.example.test");
    expect(url.pathname).toBe("/s/server-1/api/files/image");
    expect(url.searchParams.get("path")).toBe("C:\\Users\\me\\img one.png");
    expect(url.searchParams.get("access_token")).toBe("lc_access_test");
  });

  it("returns an empty local image URL without an access token", () => {
    const client = new RemoteDesktopClient("http://127.0.0.1:38987/");

    expect(client.localImageUrl("/tmp/img.png")).toBe("");
  });

  it("uploads attachment bytes to the paired desktop", async () => {
    let requestUrl = "";
    let requestBody: Uint8Array | undefined;
    const client = new RemoteDesktopClient(
      "https://desktop.example.test",
      "lc_access_test",
      async (url, init) => {
        requestUrl = String(url);
        requestBody = init?.body instanceof Uint8Array ? init.body : undefined;
        return new Response(JSON.stringify({ path: "C:\\attachments\\photo one.png" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await expect(
      client.uploadAttachment({
        threadId: "thread/one",
        fileName: "photo one.png",
        data: new Uint8Array([1, 2, 3]),
      }),
    ).resolves.toBe("C:\\attachments\\photo one.png");

    const url = new URL(requestUrl);
    expect(url.pathname).toBe("/api/files/attachment");
    expect(url.searchParams.get("threadId")).toBe("thread/one");
    expect(url.searchParams.get("name")).toBe("photo one.png");
    expect(Array.from(requestBody!)).toEqual([1, 2, 3]);
  });
});
