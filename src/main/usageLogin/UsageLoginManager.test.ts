import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasUsageSecret } from "@/shared/usageSecretStore";

vi.mock("electron", () => ({ clipboard: { writeText: vi.fn<(text: string) => void>() } }));
// Only the opencode cookie config references this; the device-flow tests don't.
vi.mock("./openCodeLoginProbe", () => ({
  isOpenCodeLoginCookieLive: vi.fn<(cookieHeader: string) => Promise<boolean>>(),
}));

const { UsageLoginManager } = await import("./UsageLoginManager");

const DEVICE_CODE_URL = "/login/device/code";
const TOKEN_URL = "/login/oauth/access_token";

function makePanel() {
  return {
    createTab: vi.fn<() => Promise<{ tabId: string }>>(async () => ({ tabId: "tab-1" })),
    closeTab: vi.fn<(tabId: string) => Promise<void>>(async () => {}),
    showUsageLoginDeviceCode: vi.fn<(deviceCode: unknown) => void>(),
    clearUsageLoginDeviceCode: vi.fn<(providerId: string) => void>(),
    cancelLoginCapture: vi.fn<() => void>(),
  };
}

let cacheDir: string;
let tokenResponses: Array<Record<string, unknown>>;
let deviceExpiresIn: number;

type FakeResponse = { ok: boolean; json: () => Promise<Record<string, unknown>> };

function installFetch() {
  const fetchMock = vi.fn<(url: string) => Promise<FakeResponse>>(async (url: string) => {
    if (url.endsWith(DEVICE_CODE_URL)) {
      return {
        ok: true,
        json: async () => ({
          device_code: "dc",
          user_code: "WXYZ-1234",
          verification_uri: "https://github.com/login/device",
          interval: 5,
          expires_in: deviceExpiresIn,
        }),
      };
    }
    if (url.endsWith(TOKEN_URL)) {
      const next = tokenResponses.shift() ?? { error: "authorization_pending" };
      return { ok: true, json: async () => next };
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  cacheDir = mkdtempSync(join(tmpdir(), "lc-login-"));
  tokenResponses = [];
  deviceExpiresIn = 900;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rmSync(cacheDir, { recursive: true, force: true });
});

function newManager(panel: ReturnType<typeof makePanel>) {
  return new UsageLoginManager({ cacheDir } as never, () => panel as never);
}

describe("UsageLoginManager GitHub device flow", () => {
  it("polls past authorization_pending, stores the token, and cleans up", async () => {
    installFetch();
    tokenResponses = [{ error: "authorization_pending" }, { access_token: "gho_secret" }];
    const panel = makePanel();
    const manager = newManager(panel);

    const promise = manager.startLogin("copilot");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(hasUsageSecret(cacheDir, "copilot")).toBe(true);
    expect(panel.showUsageLoginDeviceCode).toHaveBeenCalledOnce();
    expect(panel.clearUsageLoginDeviceCode).toHaveBeenCalledWith("copilot");
    expect(panel.closeTab).toHaveBeenCalledWith("tab-1");
  });

  it("handles slow_down and still completes", async () => {
    installFetch();
    tokenResponses = [{ error: "slow_down" }, { access_token: "gho_secret" }];
    const panel = makePanel();
    const manager = newManager(panel);

    const promise = manager.startLogin("copilot");
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual({ ok: true });
    expect(hasUsageSecret(cacheDir, "copilot")).toBe(true);
  });

  it("times out when authorization never completes before expiry", async () => {
    installFetch();
    deviceExpiresIn = 10; // expires after ~10s of polling at a 5s interval
    tokenResponses = []; // always authorization_pending
    const panel = makePanel();
    const manager = newManager(panel);

    const promise = manager.startLogin("copilot");
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual({ ok: false, error: "Login timed out" });
    expect(hasUsageSecret(cacheDir, "copilot")).toBe(false);
  });
});
