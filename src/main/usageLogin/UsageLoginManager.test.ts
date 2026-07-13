import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allUsageProviderDescriptors } from "@poracode/agents-usage";
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
    captureLoginCookies: vi.fn<(opts: unknown) => Promise<{ ok: boolean; cookie?: string }>>(
      async () => ({
        ok: true,
        cookie: "sso=abc",
      }),
    ),
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

describe("UsageLoginManager provider catalog", () => {
  it("keeps every login config backed by a canonical usage descriptor", () => {
    const manager = newManager(makePanel());
    const descriptorIds = new Set(allUsageProviderDescriptors().map((descriptor) => descriptor.id));

    expect(Object.keys(manager.getLoginState().stored).every((id) => descriptorIds.has(id))).toBe(
      true,
    );
  });
});

describe("UsageLoginManager cookie flow", () => {
  it("captures Grok cookies without a live usage probe gate", async () => {
    const panel = makePanel();
    const manager = newManager(panel);

    await expect(manager.startLogin("grok")).resolves.toEqual({ ok: true });

    expect(panel.captureLoginCookies).toHaveBeenCalledWith(
      expect.objectContaining({
        loginUrl: "https://grok.com/",
        cookieUrl: "https://grok.com/",
        authCookiePattern: /^sso(?:-rw)?$/i,
        providerLabel: "Grok",
      }),
    );
    expect(panel.captureLoginCookies.mock.calls[0]?.[0]).not.toHaveProperty("validateSession");
    expect(hasUsageSecret(cacheDir, "grok")).toBe(true);
  });
});

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

describe("UsageLoginManager API-key flow", () => {
  it("seals a pasted key and reports it stored", async () => {
    const manager = newManager(makePanel());
    await expect(manager.submitApiKey("zai", "  zai-secret  ")).resolves.toEqual({ ok: true });
    expect(hasUsageSecret(cacheDir, "zai")).toBe(true);
  });

  it("rejects an empty key without storing anything", async () => {
    const manager = newManager(makePanel());
    await expect(manager.submitApiKey("zai", "   ")).resolves.toMatchObject({ ok: false });
    expect(hasUsageSecret(cacheDir, "zai")).toBe(false);
  });

  it("rejects submitApiKey for a non-api-key provider", async () => {
    const manager = newManager(makePanel());
    await expect(manager.submitApiKey("grok", "x")).resolves.toMatchObject({ ok: false });
    expect(hasUsageSecret(cacheDir, "grok")).toBe(false);
  });

  it("startLogin on an api-key provider returns a guard error, no browser step", async () => {
    const panel = makePanel();
    const manager = newManager(panel);
    const result = await manager.startLogin("zai");
    expect(result.ok).toBe(false);
    expect(panel.captureLoginCookies).not.toHaveBeenCalled();
    expect(hasUsageSecret(cacheDir, "zai")).toBe(false);
  });

  it("clears a stored api-key secret on sign-out", async () => {
    const manager = newManager(makePanel());
    await manager.submitApiKey("zai", "zai-secret");
    expect(hasUsageSecret(cacheDir, "zai")).toBe(true);
    await expect(manager.clearLogin("zai")).resolves.toEqual({ ok: true });
    expect(hasUsageSecret(cacheDir, "zai")).toBe(false);
  });
});
