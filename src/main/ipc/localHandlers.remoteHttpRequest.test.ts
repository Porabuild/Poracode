import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendDatabaseCaller, BackendServiceCaller } from "@/shared/backendHostProtocol";
import type { Thread } from "@/shared/contracts";
import { defaultSharedSettings } from "@/shared/settings";
import { createLocalIpcHandlers } from "./localHandlers";

type FetchMock = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

function makeHandlers(database?: BackendDatabaseCaller, backendServices?: BackendServiceCaller) {
  return createLocalIpcHandlers({
    getMainWindow: () => null,
    getBrowserPanelManager: () => null,
    sshConnectionManager: {
      discoverHosts: vi.fn<() => never[]>(() => []),
      connect: vi.fn<() => Promise<never>>(),
      disconnect: vi.fn<() => Promise<void>>(),
    } as never,
    requirePoracodePaths: () =>
      ({
        baseDir: "/tmp/poracode",
        dbPath: "/tmp/poracode/db.sqlite",
        logsDir: "/tmp/poracode/logs",
        terminalLogsDir: "/tmp/poracode/logs",
        attachmentsDir: "/tmp/poracode/attachments",
        worktreesDir: "/tmp/poracode/worktrees",
        cacheDir: "/tmp/poracode/cache",
        settingsPath: "/tmp/poracode/settings.json",
        keybindingsPath: "/tmp/poracode/keybindings.json",
        statusCachePath: "/tmp/poracode/status-cache.json",
      }) as never,
    updatePowerSaveBlocker: vi.fn<() => void>(),
    setRendererEventInterests: vi.fn<() => Promise<void>>(async () => {}),
    autoUpdater: {
      initialize: vi.fn<() => void>(),
      getStatus: vi.fn<() => null>(() => null),
      checkForUpdate: vi.fn<() => Promise<void>>(async () => {}),
      startUpdateDownload: vi.fn<() => Promise<void>>(async () => {}),
      installUpdate: vi.fn<() => void>(),
    },
    extractBrowserToWindow: vi.fn<() => void>(),
    injectBrowserToMain: vi.fn<() => void>(),
    requestRelaunch: vi.fn<() => void>(),
    backendServices:
      backendServices ??
      ({
        callService: vi.fn<BackendServiceCaller["callService"]>(),
      } as BackendServiceCaller),
    database:
      database ??
      ({ callDatabase: vi.fn<BackendDatabaseCaller["callDatabase"]>() } as BackendDatabaseCaller),
    revertCheckpoint: vi.fn<() => Promise<never>>(),
  });
}

describe("local settings delegation", () => {
  it("forwards settings reads, replacements and narrow edits through the backend caller", async () => {
    const reply = { fromBackend: true };
    const callService = vi.fn<() => Promise<typeof reply>>(async () => reply);
    const handlers = makeHandlers(undefined, { callService } as unknown as BackendServiceCaller);
    const entry = { agentKind: "fixture-agent", modelId: "small", fast: false };
    const commands = [
      ["setSharedSettings", defaultSharedSettings],
      ["setAgentSecretSetting", { agentKind: "fixture-agent", key: "token", value: "fixture" }],
      ["removeCrossagentRoutingOverride", { tags: ["review"] }],
      ["removeCrossagentMemoryEntry", { entry }],
      ["updateCrossagentMemoryEntryTags", { entry, tags: ["review"] }],
      ["setProfileEnvironment", { instanceId: "fixture", environment: {} }],
      ["createProfile", { driver: "fixture", id: "fixture", displayName: "Fixture" }],
    ] as const;
    await expect(handlers.getSharedSettings({})).resolves.toBe(reply);
    expect(callService).toHaveBeenCalledExactlyOnceWith("getSharedSettings", {});
    for (const [name, payload] of commands) {
      callService.mockClear();
      await expect(handlers[name](payload as never)).resolves.toBe(reply);
      expect(callService).toHaveBeenCalledExactlyOnceWith(name, payload);
    }
  });

  it("returns a backend settings rejection instead of attempting a local fallback write", async () => {
    const callService = vi.fn<() => Promise<never>>(async () => {
      throw new Error("Fixture backend stopped");
    });
    const handlers = makeHandlers(undefined, { callService } as unknown as BackendServiceCaller);
    await expect(handlers.setSharedSettings(defaultSharedSettings)).rejects.toThrow(
      "Fixture backend stopped",
    );
    expect(callService).toHaveBeenCalledOnce();
  });
});

describe("local remoteHttpRequest handler", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("forwards http requests through main-process fetch", async () => {
    const fetchMock = vi.fn<FetchMock>(async (url, init): Promise<Response> => {
      expect(String(url)).toBe("https://remote.example.test/api/snapshot");
      expect(init).toMatchObject({
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: "{}",
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("ok", {
        status: 202,
        headers: { "x-poracode": "remote" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      makeHandlers().remoteHttpRequest({
        url: "https://remote.example.test/api/snapshot",
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: "{}",
      }),
    ).resolves.toEqual({
      status: 202,
      headers: { "content-type": "text/plain;charset=UTF-8", "x-poracode": "remote" },
      body: "ok",
    });
  });

  it("forwards delete requests through main-process fetch", async () => {
    const fetchMock = vi.fn<FetchMock>(async (_url, init): Promise<Response> => {
      expect(init).toMatchObject({ method: "DELETE", body: "{}" });
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      makeHandlers().remoteHttpRequest({
        url: "https://remote.example.test/api/pr-watches",
        method: "DELETE",
        body: "{}",
      }),
    ).resolves.toMatchObject({ status: 204 });
  });

  it("preserves binary image responses when base64 is requested", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0xff, 0x80]);
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchMock>(async () => new Response(bytes)),
    );
    const result = await makeHandlers().remoteHttpRequest({
      url: "https://remote.example.test/api/files/image?path=sample.png",
      responseEncoding: "base64",
    });
    expect(new Uint8Array(Buffer.from(result.body, "base64"))).toEqual(bytes);
  });

  it("rejects non-http protocols before fetching", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      makeHandlers().remoteHttpRequest({ url: "file:///tmp/poracode.json" }),
    ).rejects.toThrow('remoteHttpRequest only supports http(s), got "file:".');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized remote responses before reading the body", async () => {
    const fetchMock = vi.fn<FetchMock>(async (): Promise<Response> => {
      return new Response("small", {
        headers: { "content-length": String(64 * 1024 * 1024 + 1) },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      makeHandlers().remoteHttpRequest({ url: "http://127.0.0.1:38987/api/snapshot" }),
    ).rejects.toThrow("response body too large");
  });

  it("aborts requests that do not complete", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<FetchMock>(
      (_url, init): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = makeHandlers().remoteHttpRequest({
      url: "http://127.0.0.1:38987/api/snapshot",
    });
    const result = Promise.resolve(request).then(
      () => "resolved",
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(result).resolves.toMatchObject({
      message: "Remote request timed out after 60000ms.",
    });
  });

  it("cancels an active request by renderer request id", async () => {
    const requestId = "f7cf6f5a-bc12-4e3a-8d91-c0a602c350f0";
    const fetchMock = vi.fn<FetchMock>(
      (_url, init): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const handlers = makeHandlers();
    const pending = handlers.remoteHttpRequest({
      url: "https://remote.example.test/api/history",
      requestId,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    await handlers.remoteHttpRequestCancel({ requestId });

    await expect(pending).rejects.toThrow("Remote request cancelled.");
  });

  it("routes a thread write only through the backend database owner", async () => {
    const callDatabase = vi.fn<() => Promise<void>>(async () => {});
    const database = { callDatabase } as unknown as BackendDatabaseCaller;
    const thread: Thread = {
      id: "thread-1",
      projectId: "project-1",
      title: "Thread",
      agentKind: "codex",
      config: { model: "gpt-5" },
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "terminal",
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    };

    await makeHandlers(database).dbUpsertThread(thread);
    expect(callDatabase).toHaveBeenCalledExactlyOnceWith("dbUpsertThread", thread);
  });
});
