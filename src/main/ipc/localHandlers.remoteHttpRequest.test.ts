import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalIpcHandlers } from "./localHandlers";

type FetchMock = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

function makeHandlers() {
  return createLocalIpcHandlers({
    getMainWindow: () => null,
    getBrowserPanelManager: () => null,
    getRemoteAccessServer: () => null,
    setRemoteAccessEnabled: vi.fn<(enabled: boolean) => Promise<{ status: "disabled" }>>(
      async () => ({ status: "disabled" }),
    ),
    getRemoteAccessTailscaleStatus: vi.fn<() => Promise<never>>(),
    setRemoteAccessTailscaleHttps: vi.fn<(enabled: boolean) => Promise<{ status: "disabled" }>>(
      async () => ({ status: "disabled" }),
    ),
    startTailscale: vi.fn<() => Promise<{ ok: boolean }>>(async () => ({ ok: true })),
    setRemoteAccessAdvertisedUrl: vi.fn<(url: string) => Promise<{ status: "disabled" }>>(
      async () => ({ status: "disabled" }),
    ),
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
    scheduleService: {} as never,
    prWatchService: {} as never,
  });
}

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
});
