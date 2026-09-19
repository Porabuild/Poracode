import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isRemoteTransportFailure,
  isUnauthorizedRemoteError,
  RemoteClientError,
  RemoteDesktopClient,
  type RemoteFetch,
} from "./client";
import { defaultSharedSettings } from "../settings";
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

  it("normalizes settings from an older v9 host that omits follow-up behavior", async () => {
    const legacySettings = { ...defaultSharedSettings } as Record<string, unknown>;
    delete legacySettings.followUpBehavior;
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      "lc_access_test",
      async () =>
        new Response(JSON.stringify({ settings: legacySettings }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await expect(client.settings()).resolves.toMatchObject({ followUpBehavior: "steer" });
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

  it("validates complete profile stats without stripping contract fields", async () => {
    const coreStats = {
      scope: "device" as const,
      device: { id: "dev-1", label: "Test Mac", platform: "darwin" },
      generatedAt: 1,
      timezoneOffsetMinutes: 0,
      totals: {
        totalThreads: 1,
        totalPrompts: 3,
        messagesSent: 3,
        goalsSet: 0,
        longestTaskMs: 100,
        currentStreakDays: 1,
        longestStreakDays: 1,
        activeDays: 1,
      },
      promptHeatmap: { metric: "prompts" as const, windowDays: 7, cells: [], max: 0 },
      insights: {
        fastModePercent: 0,
        skillsExplored: 0,
        totalSkillsUsed: 0,
        workflowRuns: 0,
        subagentRuns: 0,
        mcpToolCalls: 0,
      },
      accounts: [{ key: "claude", label: "Claude", count: 3, percent: 100 }],
      providers: [],
      models: [],
      modes: [],
      skills: [],
      mcps: [],
      aiActions: [],
      identity: { name: "Test", handle: "test", avatarColor: "oklch(0.6 0.14 295)" },
      availableAccounts: [],
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
        body: {
          doc: notes.doc,
          todos: notes.todos,
          updatedAt: notes.updatedAt,
        },
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

  it("marks an automatic reopen explicitly without changing the legacy start shape", async () => {
    const bodies: Record<string, unknown>[] = [];
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      "lc_access_test",
      async (_url, init) => {
        bodies.push(JSON.parse(init?.body as string));
        return new Response(JSON.stringify({ threadId: "thread-1" }), { status: 200 });
      },
    );
    const input = {
      threadId: "thread-1",
      projectLocation: { kind: "posix" as const, path: "/repo" },
      agentKind: "codex" as const,
      config: { model: "test" },
      prompt: "",
    };
    await client.startThread({ ...input, ensureRunning: true });
    await client.startThread(input);
    expect(bodies[0]).toHaveProperty("ensureRunning", true);
    expect(bodies[1]).not.toHaveProperty("ensureRunning");
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

  it("uses a distinct start command id so unknown-session resume is not a receipt conflict", async () => {
    const commandIds: string[] = [];
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      "lc_access_test",
      async (_url, init) => {
        commandIds.push(init?.headers?.["x-poracode-command-id"] ?? "");
        return new Response(JSON.stringify({ ok: true, threadId: "thread-1" }), {
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
    await client.startThread({
      threadId: "thread-1",
      projectLocation: { kind: "posix", path: "/repo" },
      agentKind: "codex",
      config: { model: "gpt-5" },
      prompt: "continue",
      userMessageItemId: "user-message-1",
    });

    expect(commandIds).toEqual(["user-message-1", "thread-start-item:user-message-1"]);
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

  it("rejects a v8 host that predates pinned thread execution environments", async () => {
    const client = new RemoteDesktopClient("http://127.0.0.1:38987/", undefined, async () =>
      descriptorResponse(8, ["session:read"]),
    );

    await expect(client.environment()).rejects.toMatchObject({
      code: "protocol_version_mismatch",
    });
  });

  it("rejects a v9 host that would append content.delta.replace as a tail", async () => {
    const client = new RemoteDesktopClient("http://127.0.0.1:38987/", undefined, async () =>
      descriptorResponse(9, ["session:read"]),
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

  it("parses /api/git/call with the procedure result schema and treats void as {}", async () => {
    const payloads: unknown[] = [];
    const client = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      "lc_access_test",
      async (_url, init) => {
        payloads.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}"));
        const body = payloads.at(-1) as { procedure?: string };
        if (body.procedure === "gitPush") {
          return new Response("{}", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ result: { available: true } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await expect(client.callRemoteProcedure("ghCheckAvailable", {})).resolves.toEqual({
      available: true,
    });
    await expect(client.callRemoteProcedure("gitPush", {})).resolves.toBeUndefined();

    const nullVoid = new RemoteDesktopClient(
      "http://127.0.0.1:38987/",
      "lc_access_test",
      async () =>
        new Response(JSON.stringify({ result: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(nullVoid.callRemoteProcedure("gitPush", {})).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("rejects non-allowlisted remote procedures before making a request", async () => {
    const fetch = vi.fn<RemoteFetch>();
    const client = new RemoteDesktopClient("http://127.0.0.1:38987/", "lc_access_test", fetch);

    await expect(client.callRemoteProcedure("notAProcedure", {})).rejects.toMatchObject({
      status: 403,
      code: "git_procedure_not_allowed",
    });
    expect(fetch).not.toHaveBeenCalled();
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

  it("builds ticketed local image URLs against the endpoint (no bearer in any URL)", async () => {
    const mintRequests: Array<{ url: string; authorization: string | undefined }> = [];
    const client = new RemoteDesktopClient(
      "https://relay.example.test/s/server-1/",
      "lc_access_test",
      async (url, init) => {
        mintRequests.push({
          url: String(url),
          authorization: (init?.headers as Record<string, string> | undefined)?.authorization,
        });
        return new Response(
          JSON.stringify({ ticket: "lc_img_relay", expiresAt: "2099-01-01T00:00:30.000Z" }),
          { status: 200 },
        );
      },
    );

    // Gate 6 item 4.6 (S6): the mint is asynchronous while the render-path
    // consumer is synchronous, so the first resolution carries NO credential
    // at all (the caller falls back to the unrenderable original URL).
    expect(client.localImageUrl("C:\\Users\\me\\img one.png")).toBe("");
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The mint itself rode the Authorization header, never a URL credential.
    expect(mintRequests).toHaveLength(1);
    expect(new URL(mintRequests[0]!.url).pathname).toBe("/s/server-1/api/files/image-ticket");
    expect(mintRequests[0]!.authorization).toBe("Bearer lc_access_test");

    const url = new URL(client.localImageUrl("C:\\Users\\me\\img one.png"));
    expect(url.origin).toBe("https://relay.example.test");
    expect(url.pathname).toBe("/s/server-1/api/files/image");
    expect(url.searchParams.get("path")).toBe("C:\\Users\\me\\img one.png");
    expect(url.searchParams.get("ticket")).toBe("lc_img_relay");
    expect(url.toString()).not.toContain("access_token");
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

describe("RemoteDesktopClient ETag revalidation cache", () => {
  const endpoint = "http://127.0.0.1:38987/";
  // Minimal body that satisfies remoteShellSnapshotSchema.
  const snapshotBody = {
    snapshotSeq: 1,
    projects: [],
    threads: [],
    runtimeSummariesByThread: {},
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  function jsonResponse(status: number, bodyText: string, headers: Record<string, string> = {}) {
    // 304 responses must carry no body per the fetch spec.
    return new Response(status === 304 || status === 204 ? null : bodyText, {
      status,
      headers,
    });
  }

  it("stores an ETag on a full GET and replays the cached body on a matching 304", async () => {
    const responses = [
      jsonResponse(200, JSON.stringify(snapshotBody), { etag: 'W/"abc"' }),
      jsonResponse(304, ""),
    ];
    const fetch = vi.fn<RemoteFetch>(() => Promise.resolve(responses.shift()!));
    const client = new RemoteDesktopClient(endpoint, "lc_access_test", fetch);

    const first = await client.snapshot();
    expect(first).toMatchObject({ snapshotSeq: 1 });

    const second = await client.snapshot();
    expect(second).toMatchObject({ snapshotSeq: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [, secondInit] = vi.mocked(fetch).mock.calls[1]!;
    const secondHeaders = (secondInit ? secondInit.headers : {}) as Record<string, string>;
    expect(secondHeaders["if-none-match"]).toBe('W/"abc"');
  });

  it("does not cache non-GET requests or responses without an ETag", async () => {
    const fetch = vi.fn<RemoteFetch>(() =>
      Promise.resolve(jsonResponse(200, JSON.stringify(snapshotBody))),
    );
    const client = new RemoteDesktopClient(endpoint, "lc_access_test", fetch);
    await client.snapshot();
    await client.snapshot();
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers["if-none-match"]).toBeUndefined();
    }
  });

  it("still fails loudly on a bare 304 with no cached entry", async () => {
    const fetch = vi.fn<RemoteFetch>(() => Promise.resolve(jsonResponse(304, "")));
    const client = new RemoteDesktopClient(endpoint, "lc_access_test", fetch);
    await expect(client.snapshot()).rejects.toMatchObject({ code: "not_modified" });
  });
});

describe("RemoteDesktopClient bounded snapshot thread list", () => {
  const endpoint = "http://127.0.0.1:38987/";
  const PAGE_LIMIT = 2;

  function threadRow(id: string) {
    return {
      id,
      projectId: "project-1",
      title: `Thread ${id}`,
      agentKind: "claude",
      config: { model: "sonnet" },
      status: "idle",
      attention: "none",
      archived: false,
      done: false,
      starred: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  function jsonResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status });
  }

  /** Fake host: bounds /api/snapshot and serves /api/threads continuations. */
  function pagingHostFetch(allThreadIds: string[]) {
    const calls: string[] = [];
    const fetch = vi.fn<RemoteFetch>((url) => {
      const request = new URL(String(url));
      calls.push(`${request.pathname}${request.search}`);
      if (request.pathname === "/api/snapshot") {
        const raw = request.searchParams.get("threadLimit");
        const limit = raw === null ? allThreadIds.length : Number(raw);
        const page = allThreadIds.slice(0, limit);
        return Promise.resolve(
          jsonResponse(200, {
            snapshotSeq: 7,
            projects: [],
            threads: page.map(threadRow),
            ...(page.length < allThreadIds.length
              ? { threadsNextCursor: `cursor:${page.length}` }
              : {}),
            runtimeSummariesByThread: Object.fromEntries(page.map((id) => [id, { itemCount: 2 }])),
            gitSummariesByThread: Object.fromEntries(
              page.map((id) => [
                id,
                {
                  isRepo: true,
                  branch: "main",
                  totalInsertions: 0,
                  totalDeletions: 0,
                  ahead: 0,
                  behind: 0,
                  pr: null,
                },
              ]),
            ),
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
        );
      }
      if (request.pathname === "/api/threads") {
        const start = Number(request.searchParams.get("cursor")!.split(":")[1]);
        const limit = Number(request.searchParams.get("limit"));
        const page = allThreadIds.slice(start, start + limit);
        return Promise.resolve(
          jsonResponse(200, {
            threads: page.map(threadRow),
            runtimeSummariesByThread: Object.fromEntries(page.map((id) => [id, { itemCount: 2 }])),
            gitSummariesByThread: Object.fromEntries(
              page.map((id) => [
                id,
                {
                  isRepo: true,
                  branch: "main",
                  totalInsertions: 0,
                  totalDeletions: 0,
                  ahead: 0,
                  behind: 0,
                  pr: null,
                },
              ]),
            ),
            nextCursor: start + limit < allThreadIds.length ? `cursor:${start + limit}` : null,
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    return { fetch, calls };
  }

  it("assembles a complete snapshot from the bounded head plus continuation pages", async () => {
    const ids = Array.from({ length: 5 }, (_, index) => `thread-${index}`);
    const { fetch, calls } = pagingHostFetch(ids);
    const client = new RemoteDesktopClient(endpoint, "lc_access_test", fetch);

    const snapshot = await client.snapshot({ threadListPageLimit: PAGE_LIMIT });
    expect(snapshot.threads.map((thread) => thread.id)).toEqual(ids);
    // The assembled snapshot is complete: no dangling cursor for callers.
    expect(snapshot.threadsNextCursor).toBeNull();
    expect(Object.keys(snapshot.runtimeSummariesByThread).sort()).toEqual(ids);
    expect(Object.keys(snapshot.gitSummariesByThread ?? {}).sort()).toEqual(ids);
    expect(calls[0]).toBe("/api/snapshot?threadLimit=2");
    expect(calls.slice(1)).toEqual([
      "/api/threads?limit=2&cursor=cursor%3A2",
      "/api/threads?limit=2&cursor=cursor%3A4",
    ]);
  });

  it("accepts a legacy host that ignores the limit and returns the full list", async () => {
    const ids = ["thread-0", "thread-1"];
    const { fetch, calls } = pagingHostFetch(ids);
    // A legacy host never sends threadsNextCursor even when threadLimit is set.
    const originalFetch = fetch;
    // (pagingHostFetch only adds a cursor when the list is longer than the page,
    // so a fitting list already behaves like a legacy host.)
    const client = new RemoteDesktopClient(endpoint, "lc_access_test", originalFetch);
    const snapshot = await client.snapshot({ threadListPageLimit: 10 });
    expect(snapshot.threads.map((thread) => thread.id)).toEqual(ids);
    // A legacy host sends no cursor field at all; absent means complete.
    expect(snapshot.threadsNextCursor ?? null).toBeNull();
    expect(calls).toEqual(["/api/snapshot?threadLimit=10"]);
  });

  it("keeps the unbounded request path untouched without options", async () => {
    const ids = ["thread-0"];
    const { fetch, calls } = pagingHostFetch(ids);
    const client = new RemoteDesktopClient(endpoint, "lc_access_test", fetch);
    const snapshot = await client.snapshot();
    expect(snapshot.threads).toHaveLength(1);
    expect(calls).toEqual(["/api/snapshot"]);
  });

  it("refuses a host that repeats a cursor instead of looping forever", async () => {
    const fetch = vi.fn<RemoteFetch>((url) => {
      const request = new URL(String(url));
      if (request.pathname === "/api/snapshot") {
        return Promise.resolve(
          jsonResponse(200, {
            snapshotSeq: 7,
            projects: [],
            threads: [threadRow("thread-0")],
            threadsNextCursor: "cursor:1",
            runtimeSummariesByThread: {},
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          threads: [threadRow("thread-1")],
          runtimeSummariesByThread: {},
          nextCursor: "cursor:1",
        }),
      );
    });
    const client = new RemoteDesktopClient(endpoint, "lc_access_test", fetch);
    await expect(client.snapshot({ threadListPageLimit: 1 })).rejects.toMatchObject({
      code: "thread_list_cursor_loop",
    });
  });
});

describe("RemoteDesktopClient image ticket flow", () => {
  const endpoint = "http://127.0.0.1:38987/";
  const PATH = "/Users/host/pictures/cat.png";
  const TICKET = "lc_img_testticket";

  function jsonResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status });
  }

  function flushMint(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function searchParamsOf(url: string): URLSearchParams {
    return new URL(url).searchParams;
  }

  it("mints a ticket and serves subsequent image URLs from it without the bearer token", async () => {
    const mints: string[] = [];
    const fetch = vi.fn<RemoteFetch>((url, init) => {
      const request = new URL(String(url));
      if (request.pathname === "/api/files/image-ticket" && init?.method === "POST") {
        mints.push(String(url));
        return Promise.resolve(
          jsonResponse(200, { ticket: TICKET, expiresAt: "2026-01-01T00:00:30.000Z" }),
        );
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    const client = new RemoteDesktopClient(endpoint, "lc_access_test", fetch);

    // First resolution happens while the mint is in flight: NO credential in
    // the URL at all (Gate 6 item 4.6 removed the bearer-in-URL fallback).
    const first = client.localImageUrl(PATH);
    expect(first).toBe("");
    await flushMint();
    const minted = vi.mocked(fetch).mock.calls[0];
    expect(String(minted?.[0])).toContain("/api/files/image-ticket");
    const mintInit = minted?.[1];
    const headers = (mintInit?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toContain("Bearer lc_access_test");

    // Subsequent resolutions carry the one-time ticket, never the bearer token.
    const second = client.localImageUrl(PATH);
    expect(searchParamsOf(second).get("ticket")).toBe(TICKET);
    expect(searchParamsOf(second).get("access_token")).toBeNull();
    expect(second).not.toContain("access_token");
    expect(mints).toHaveLength(1);
  });

  it("latches off tickets when an older host has no mint route and serves no image URL", async () => {
    let mintCalls = 0;
    const fetch = vi.fn<RemoteFetch>((url) => {
      if (new URL(String(url)).pathname === "/api/files/image-ticket") {
        mintCalls += 1;
        return Promise.resolve(jsonResponse(404, {}));
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    const client = new RemoteDesktopClient(endpoint, "lc_access_test", fetch);

    expect(client.localImageUrl(PATH)).toBe("");
    await flushMint();
    expect(mintCalls).toBe(1);

    // The 404 latch means no further mint attempts. There is no credential an
    // <img> tag could legally carry on such a host: every URL stays empty
    // (callers fall back to the original, unrenderable URL).
    for (let index = 0; index < 3; index += 1) {
      expect(client.localImageUrl(PATH)).toBe("");
    }
    await flushMint();
    expect(mintCalls).toBe(1);
  });

  it("re-mints after the ticket window has passed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      let mints = 0;
      const fetch = vi.fn<RemoteFetch>((url, init) => {
        if (
          new URL(String(url)).pathname === "/api/files/image-ticket" &&
          init?.method === "POST"
        ) {
          mints += 1;
          return Promise.resolve(
            jsonResponse(200, { ticket: TICKET, expiresAt: "2026-01-01T00:00:30.000Z" }),
          );
        }
        return Promise.resolve(jsonResponse(404, {}));
      });
      const client = new RemoteDesktopClient(endpoint, "lc_access_test", fetch);

      expect(client.localImageUrl(PATH)).toBe("");
      await vi.advanceTimersByTimeAsync(0);
      expect(client.localImageUrl(PATH).includes("ticket=")).toBe(true);

      // Past the mint window: the cached ticket is no longer reused.
      vi.advanceTimersByTime(31_000);
      const expired = client.localImageUrl(PATH);
      expect(expired).toBe("");
      await vi.advanceTimersByTimeAsync(0);
      expect(mints).toBe(2);
      expect(client.localImageUrl(PATH).includes("ticket=")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

/** `requestJson` is the unit under test but stays private; drive it through
 * a structural cast instead of widening the public client surface. */
function requestJsonVia(client: RemoteDesktopClient, path: string): Promise<unknown> {
  return (client as unknown as { requestJson(path: string): Promise<unknown> }).requestJson(path);
}

describe("RemoteDesktopClient token lifecycle (Gate 6 item 4.6)", () => {
  const endpoint = "http://127.0.0.1:38987/";

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  function lifecycle(
    refreshToken: string | undefined,
    refreshed: (tokens: { accessToken: string; refreshToken?: string }) => void,
  ) {
    return {
      refreshToken: () => refreshToken,
      onTokensRefreshed: refreshed,
    };
  }

  it("transparently refreshes once on a 401 and retries with the new access token", async () => {
    const calls: Array<{ path: string; authorization: string | undefined }> = [];
    let rotated = false;
    const refreshBodies: Array<{ grantType: string; refreshToken: string }> = [];
    const fetch = vi.fn<RemoteFetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      const authorization = (init?.headers as Record<string, string> | undefined)?.authorization;
      calls.push({ path, authorization });
      if (path === "/oauth/token") {
        const body = JSON.parse(String(init?.body)) as { grantType: string; refreshToken: string };
        refreshBodies.push(body);
        rotated = true;
        return jsonResponse(200, {
          accessToken: "lc_access_new",
          tokenType: "Bearer",
          expiresAt: "2099-01-02T00:00:00.000Z",
          scopes: ["session:read"],
          refreshToken: "lc_refresh_new",
          refreshTokenExpiresAt: "2099-02-01T00:00:00.000Z",
        });
      }
      if (!rotated) {
        return jsonResponse(401, {
          error: { message: "Invalid access token.", code: "invalid_access_token" },
        });
      }
      return jsonResponse(200, { ok: true });
    });
    const onTokensRefreshed =
      vi.fn<(tokens: { accessToken: string; refreshToken?: string }) => void>();
    const client = new RemoteDesktopClient(endpoint, "lc_access_stale", fetch, {
      tokenLifecycle: lifecycle("lc_refresh_old", onTokensRefreshed),
    });

    await expect(requestJsonVia(client, "/api/snapshot")).resolves.toEqual({ ok: true });
    // 401, refresh, retry — exactly once.
    expect(calls.map((call) => call.path)).toEqual([
      "/api/snapshot",
      "/oauth/token",
      "/api/snapshot",
    ]);
    expect(refreshBodies).toEqual([{ grantType: "refresh_token", refreshToken: "lc_refresh_old" }]);
    expect(calls[2]?.authorization).toBe("Bearer lc_access_new");
    expect(onTokensRefreshed).toHaveBeenCalledExactlyOnceWith({
      accessToken: "lc_access_new",
      refreshToken: "lc_refresh_new",
      refreshTokenExpiresAt: "2099-02-01T00:00:00.000Z",
    });
  });

  it("does not retry again when the post-refresh retry is also unauthorized", async () => {
    let tokenCalls = 0;
    const fetch = vi.fn<RemoteFetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/oauth/token") {
        tokenCalls += 1;
        return jsonResponse(200, {
          accessToken: `lc_access_new_${tokenCalls}`,
          tokenType: "Bearer",
          expiresAt: "2099-01-02T00:00:00.000Z",
          scopes: ["session:read"],
          refreshToken: "lc_refresh_new",
        });
      }
      return jsonResponse(401, {
        error: { message: "Invalid access token.", code: "invalid_access_token" },
      });
    });
    const client = new RemoteDesktopClient(endpoint, "lc_access_stale", fetch, {
      tokenLifecycle: lifecycle("lc_refresh_old", () => {}),
    });

    await expect(requestJsonVia(client, "/api/snapshot")).rejects.toMatchObject({
      status: 401,
      code: "invalid_access_token",
    });
    expect(tokenCalls).toBe(1);
  });

  it("surfaces the original authorization error when the refresh itself fails", async () => {
    const fetch = vi.fn<RemoteFetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/oauth/token") {
        return jsonResponse(401, {
          error: { message: "Invalid refresh token.", code: "invalid_refresh_token" },
        });
      }
      return jsonResponse(401, {
        error: { message: "Invalid access token.", code: "invalid_access_token" },
      });
    });
    const client = new RemoteDesktopClient(endpoint, "lc_access_stale", fetch, {
      tokenLifecycle: lifecycle("lc_refresh_dead", () => {}),
    });

    // The caller keeps seeing a clean 401, never a grant-endpoint failure.
    await expect(requestJsonVia(client, "/api/snapshot")).rejects.toMatchObject({
      status: 401,
      code: "invalid_access_token",
    });
  });

  it("does not attempt a refresh without a lifecycle or stored refresh token", async () => {
    const fetch = vi.fn<RemoteFetch>(async () =>
      jsonResponse(401, {
        error: { message: "Invalid access token.", code: "invalid_access_token" },
      }),
    );
    const onTokensRefreshed = vi.fn<(tokens: { accessToken: string }) => void>();
    const client = new RemoteDesktopClient(endpoint, "lc_access_stale", fetch, {
      tokenLifecycle: lifecycle(undefined, onTokensRefreshed),
    });

    await expect(requestJsonVia(client, "/api/snapshot")).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(onTokensRefreshed).not.toHaveBeenCalled();
  });
});

describe("RemoteDesktopClient certificate fingerprint pinning (Gate 6 item 4.2)", () => {
  const endpoint = "https://127.0.0.1:38987/";
  const SERVER_FINGERPRINT = "a".repeat(64);
  const IMPOSTER_FINGERPRINT = "b".repeat(64);

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  it("adopts the probed certificate as the pin on first pair and notifies persistence", async () => {
    const fetch = vi.fn<RemoteFetch>(async () =>
      jsonResponse(200, {
        accessToken: "lc_access_test",
        tokenType: "Bearer",
        expiresAt: "2099-01-01T00:00:00.000Z",
        scopes: ["session:read"],
        refreshToken: "lc_refresh_test",
        refreshTokenExpiresAt: "2099-02-01T00:00:00.000Z",
      }),
    );
    const onCertFingerprintValidated = vi.fn<(fingerprint: string) => void>();
    const client = new RemoteDesktopClient(endpoint, undefined, fetch, {
      certFingerprintProbe: () => Promise.resolve(SERVER_FINGERPRINT),
      onCertFingerprintValidated,
    });

    await expect(
      client.exchangePairingCredential({ credential: "lc_pair_test", scopes: ["session:read"] }),
    ).resolves.toMatchObject({ accessToken: "lc_access_test" });
    expect(onCertFingerprintValidated).toHaveBeenCalledExactlyOnceWith(SERVER_FINGERPRINT);
  });

  it("refuses a pairing whose QR fingerprint contradicts the server certificate before spending the credential", async () => {
    const fetch = vi.fn<RemoteFetch>(async () => jsonResponse(200, {}));
    const client = new RemoteDesktopClient(endpoint, undefined, fetch, {
      certFingerprintProbe: () => Promise.resolve(IMPOSTER_FINGERPRINT),
    });

    await expect(
      client.exchangePairingCredential({
        credential: "lc_pair_test",
        scopes: ["session:read"],
        certFingerprint: SERVER_FINGERPRINT,
      }),
    ).rejects.toMatchObject({ code: "certificate_fingerprint_mismatch" });
    // The one-time credential was never sent.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses every request once the pinned certificate stops matching", async () => {
    const fetch = vi.fn<RemoteFetch>(async () => jsonResponse(200, { ok: true }));
    const client = new RemoteDesktopClient(endpoint, "lc_access_test", fetch, {
      certFingerprint: SERVER_FINGERPRINT,
      certFingerprintProbe: () => Promise.resolve(IMPOSTER_FINGERPRINT),
    });

    await expect(requestJsonVia(client, "/api/snapshot")).rejects.toMatchObject({
      code: "certificate_fingerprint_mismatch",
    });
    // Refusal happens before credentials leave the client.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps working when the pin matches the probed certificate", async () => {
    const fetch = vi.fn<RemoteFetch>(async () => jsonResponse(200, { ok: true }));
    const client = new RemoteDesktopClient(endpoint, "lc_access_test", fetch, {
      certFingerprint: SERVER_FINGERPRINT,
      certFingerprintProbe: () => Promise.resolve(SERVER_FINGERPRINT),
    });

    await expect(requestJsonVia(client, "/api/snapshot")).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("treats an unprovable transport as pass-through (browser fetch posture)", async () => {
    const fetch = vi.fn<RemoteFetch>(async () => jsonResponse(200, { ok: true }));
    const client = new RemoteDesktopClient(endpoint, "lc_access_test", fetch, {
      certFingerprint: SERVER_FINGERPRINT,
    });

    // No probe transport: the platform's TLS chain validation owns trust, the
    // pin rides along as data for the record.
    await expect(requestJsonVia(client, "/api/snapshot")).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
