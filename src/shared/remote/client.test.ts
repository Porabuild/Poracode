import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isRemoteTransportFailure,
  isUnauthorizedRemoteError,
  RemoteClientError,
  RemoteDesktopClient,
} from "./client";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "./protocol";

describe("remote error classification", () => {
  it("separates transport failures from reachable application errors", () => {
    expect(isRemoteTransportFailure(new RemoteClientError("timed out", 0, "timeout"))).toBe(true);
    expect(isRemoteTransportFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(
      isRemoteTransportFailure(
        new Error("wrapped", { cause: new RemoteClientError("offline", 0, "offline") }),
      ),
    ).toBe(true);
    expect(isRemoteTransportFailure(new RemoteClientError("constraint", 409, "conflict"))).toBe(
      false,
    );
    expect(isRemoteTransportFailure(new RemoteClientError("server offline", 502, "relay"))).toBe(
      true,
    );
    expect(
      isRemoteTransportFailure(
        new RemoteClientError("desktop unavailable", 503, "desktop_unavailable"),
      ),
    ).toBe(false);
  });

  it("recognizes authorization failures without treating other HTTP errors as expired", () => {
    expect(isUnauthorizedRemoteError(new RemoteClientError("expired", 401, "unauthorized"))).toBe(
      true,
    );
    expect(isUnauthorizedRemoteError(new RemoteClientError("forbidden", 403, "forbidden"))).toBe(
      true,
    );
    expect(isUnauthorizedRemoteError(new RemoteClientError("conflict", 409, "conflict"))).toBe(
      false,
    );
  });
});

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

  it("reports successful and failed requests through the client lifecycle hooks", async () => {
    const onRequestSuccess = vi.fn<() => void>();
    const onRequestError = vi.fn<(error: unknown) => void>();
    const successClient = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      "lc_access_test",
      async () =>
        new Response(
          JSON.stringify({ ticket: "lc_ws_test", expiresAt: "2099-01-01T00:00:00.000Z" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      { onRequestSuccess, onRequestError },
    );

    await expect(successClient.websocketTicket()).resolves.toBe("lc_ws_test");
    expect(onRequestSuccess).toHaveBeenCalledOnce();
    expect(onRequestError).not.toHaveBeenCalled();

    const transportError = new TypeError("Failed to fetch");
    const failureClient = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      "lc_access_test",
      async () => Promise.reject(transportError),
      { onRequestSuccess, onRequestError },
    );

    await expect(failureClient.websocketTicket()).rejects.toBe(transportError);
    expect(onRequestError).toHaveBeenLastCalledWith(transportError);
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

  it("checks and installs updates on the remote host", async () => {
    const requests: Array<{ url: string; method: string }> = [];
    const client = new RemoteDesktopClient(
      "https://relay.example.test/s/server-1/",
      "lc_access_test",
      async (url, init) => {
        requests.push({ url: String(url), method: init?.method ?? "GET" });
        const isInstall = String(url).endsWith("/install");
        return new Response(
          JSON.stringify(
            isInstall
              ? {}
              : { currentVersion: "1.0.0", status: { type: "downloaded", version: "1.1.0" } },
          ),
          { status: isInstall ? 202 : 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    await expect(client.checkHostUpdate()).resolves.toEqual({
      currentVersion: "1.0.0",
      status: { type: "downloaded", version: "1.1.0" },
    });
    await expect(client.installHostUpdate()).resolves.toBeUndefined();
    expect(requests).toEqual([
      { url: "https://relay.example.test/s/server-1/api/host-update/check", method: "POST" },
      { url: "https://relay.example.test/s/server-1/api/host-update/install", method: "POST" },
    ]);
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
      blockedReason: null,
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
    await expect(
      client.syncPrWatchAgent({
        projectId: watch.projectId,
        agentKind: watch.agentKind,
        config: watch.config,
      }),
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
      {
        url: "https://relay.example.test/s/server-1/api/pr-watches/agent",
        method: "POST",
        body: {
          projectId: watch.projectId,
          agentKind: watch.agentKind,
          config: watch.config,
        },
      },
    ]);
  });

  it("accepts PR automation responses from hosts that predate blocked reasons", async () => {
    const legacyWatch = {
      projectId: "project one",
      prNumber: 42,
      headBranch: "feature/mobile",
      watchEnabled: true,
      autoMerge: false,
      agentKind: "codex",
      config: { model: "gpt-5.6-sol" },
      lastCommentCursor: null,
      lastReviewCommentCursor: null,
      lastReviewCursor: null,
      lastCheckKey: null,
      activeThreadId: null,
      lastError: null,
    };
    const client = new RemoteDesktopClient(
      "https://relay.example.test/s/server-1/",
      "lc_access_test",
      async () =>
        new Response(JSON.stringify({ watch: legacyWatch }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await expect(
      client.getPrWatch({ projectId: legacyWatch.projectId, prNumber: legacyWatch.prNumber }),
    ).resolves.toEqual({ ...legacyWatch, blockedReason: null });
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

  it("forwards a preallocated thread and optimistic message id when starting remotely", async () => {
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

    await expect(
      client.startNewThread({
        threadId: "thread-preallocated",
        projectId: "project-1",
        agentKind: "codex",
        config: { model: "gpt-5" },
        prompt: "build remotely",
        presentationMode: "gui",
        userMessageItemId: "user-optimistic",
      }),
    ).resolves.toEqual({ threadId: "thread-preallocated" });

    expect(requestBody).toEqual({
      kind: "start",
      projectId: "project-1",
      agentKind: "codex",
      config: { model: "gpt-5" },
      prompt: "build remotely",
      presentationMode: "gui",
      userMessageItemId: "user-optimistic",
    });
    expect(requestUrl).toBe("http://127.0.0.1:38987/api/threads/thread-preallocated/command");
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

  it("includes initial thread interests so replay is scoped before open", () => {
    const client = new RemoteDesktopClient("https://relay.example.test/s/server-1");
    const url = new URL(
      client.websocketUrl("lc_ws_test", 42, { threadItemInterests: ["thread-1"] }),
    );

    expect(url.searchParams.get("threadItemInterests")).toBe('["thread-1"]');
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

  it("rejects a released v1 host that cannot preserve optimistic user-message ids", async () => {
    const client = new RemoteDesktopClient("http://127.0.0.1:38987/", undefined, async () =>
      descriptorResponse(1, ["session:read"]),
    );

    await expect(client.environment()).rejects.toMatchObject({
      code: "protocol_version_mismatch",
    });
    // Not a raw ZodError JSON dump.
    await expect(client.environment()).rejects.toThrow(/incompatible/i);
  });

  it("rejects a v3 host after the project-icon wire change", async () => {
    const client = new RemoteDesktopClient("http://127.0.0.1:38987/", undefined, async () =>
      descriptorResponse(3, ["session:read"]),
    );

    await expect(client.environment()).rejects.toMatchObject({
      code: "protocol_version_mismatch",
    });
  });

  it("rejects a v5 host whose paged snapshots use the old goal anchor semantics", async () => {
    const client = new RemoteDesktopClient("http://127.0.0.1:38987/", undefined, async () =>
      descriptorResponse(5, ["session:read"]),
    );

    await expect(client.environment()).rejects.toMatchObject({
      code: "protocol_version_mismatch",
    });
  });

  it("rejects a v6 host that predates provider_handoff runtime items", async () => {
    const client = new RemoteDesktopClient("http://127.0.0.1:38987/", undefined, async () =>
      descriptorResponse(6, ["session:read"]),
    );

    await expect(client.environment()).rejects.toMatchObject({
      code: "protocol_version_mismatch",
    });
  });

  it("rejects a v7 host that predates thread prompt segments", async () => {
    const client = new RemoteDesktopClient("http://127.0.0.1:38987/", undefined, async () =>
      descriptorResponse(7, ["session:read"]),
    );

    await expect(client.environment()).rejects.toMatchObject({
      code: "protocol_version_mismatch",
    });
  });

  it("forwards providerSwitch on a thread start so the host records the handoff divider", async () => {
    let startBody: unknown;
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      undefined,
      async (url, init) => {
        if (new URL(url).pathname !== "/api/threads/start") {
          return descriptorResponse(PORACODE_REMOTE_PROTOCOL_VERSION, ["session:operate"]);
        }
        startBody = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as unknown;
        return new Response(JSON.stringify({ threadId: "thread-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await client.startThread({
      threadId: "thread-1",
      projectLocation: { kind: "windows", path: "C:\\proj" },
      agentKind: "codex",
      config: { model: "gpt-5" },
      prompt: "Continue",
      presentationMode: "gui",
      providerSwitch: { fromAgentKind: "claude" },
    });

    expect(startBody).toMatchObject({
      threadId: "thread-1",
      agentKind: "codex",
      providerSwitch: { fromAgentKind: "claude" },
    });
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

  it.each(["gitPush", "waitMcpServerOauth"])(
    "gives long-running %s operations a larger timeout than ordinary requests",
    async (procedure) => {
      vi.useFakeTimers();
      const client = new RemoteDesktopClient(
        "http://127.0.0.1:38987/",
        "lc_access_test",
        () => new Promise<Response>(() => {}),
        { requestTimeoutMs: 10 },
      );

      const operation = client.callRemoteProcedure(procedure, {}).then(
        () => "resolved",
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(Promise.race([operation, Promise.resolve("pending")])).resolves.toBe("pending");

      await vi.advanceTimersByTimeAsync(5 * 60_000);
      await expect(operation).resolves.toMatchObject({ code: "timeout" });
    },
  );

  it("gives repository clones the long-running request timeout", async () => {
    vi.useFakeTimers();
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      "lc_access_test",
      () => new Promise<Response>(() => {}),
      { requestTimeoutMs: 10 },
    );

    const clone = client
      .projectCommand({
        kind: "clone",
        parentPath: "/tmp",
        name: "repo",
        source: { kind: "url", url: "https://example.test/repo.git" },
      })
      .then(
        () => "resolved",
        (error: unknown) => error,
      );
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(Promise.race([clone, Promise.resolve("pending")])).resolves.toBe("pending");

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await expect(clone).resolves.toMatchObject({ code: "timeout" });
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
