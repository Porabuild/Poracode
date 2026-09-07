import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserEvent } from "@/shared/ipc";

vi.mock("electron", () => ({
  session: {
    fromPartition: () => ({
      cookies: { get: async () => [], remove: async () => {} },
    }),
  },
}));

const { BrowserLoginCaptureCoordinator } = await import("./BrowserLoginCaptureCoordinator");

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function flush(n = 6): Promise<void> {
  for (let i = 0; i < n; i++) await tick();
}

interface ConfirmEvent {
  type: "usage-login-confirmation";
  request: { requestId: string; providerLabel: string };
}

function setup(opts: { cookies?: Array<{ name: string; value: string }>; tabUrl?: string }) {
  const events: BrowserEvent[] = [];
  const cookieJar = opts.cookies ?? [{ name: "auth", value: "abc" }];
  const tab = {
    isDestroyed: () => false,
    isAttached: () => true,
    loadURL: vi.fn<(url: string) => Promise<void>>(async () => {}),
    webContents: {
      getURL: () => opts.tabUrl,
      session: {
        cookies: {
          get: async () => cookieJar,
          on: vi.fn<() => void>(),
          removeListener: vi.fn<() => void>(),
        },
      },
    },
  };
  const host = {
    createTab: vi.fn<() => Promise<never>>(async () => ({ tabId: "tab-1" }) as never),
    closeTab: vi.fn<(tabId: string) => Promise<void>>(async () => {}),
    findTab: () => tab as never,
    emit: (event: BrowserEvent) => events.push(event),
    hasHostWindow: () => true,
  };
  const coordinator = new BrowserLoginCaptureCoordinator(host);
  const pendingRequestId = () =>
    (events.find((e) => e.type === "usage-login-confirmation") as ConfirmEvent | undefined)?.request
      .requestId;
  return { coordinator, host, tab, events, pendingRequestId };
}

const baseOpts = {
  loginUrl: "https://grok.com/",
  cookieUrl: "https://grok.com/",
  authCookiePattern: /^auth$/,
  timeoutMs: 60_000,
  providerLabel: "Grok",
};

describe("BrowserLoginCaptureCoordinator.captureLoginCookies", () => {
  afterEach(() => vi.restoreAllMocks());

  it("captures the cookie header and resolves on a 'use' confirmation", async () => {
    const { coordinator, host, pendingRequestId } = setup({});
    const promise = coordinator.captureLoginCookies(baseOpts);
    await flush();

    const requestId = pendingRequestId();
    expect(requestId).toBeDefined();
    coordinator.resolveUsageLoginConfirmation({ requestId: requestId!, action: "use" });

    await expect(promise).resolves.toEqual({ ok: true, cookie: "auth=abc" });
    expect(host.closeTab).toHaveBeenCalledWith("tab-1");
  });

  it("keeps polling without prompting when validateSession reports not-live", async () => {
    const { coordinator, events } = setup({});
    const validateSession = vi.fn<(cookieHeader: string) => Promise<boolean>>(async () => false);
    const promise = coordinator.captureLoginCookies({ ...baseOpts, validateSession });
    await flush();

    expect(validateSession).toHaveBeenCalledWith("auth=abc");
    expect(events.some((e) => e.type === "usage-login-confirmation")).toBe(false);

    coordinator.cancelLoginCapture();
    await expect(promise).resolves.toEqual({ ok: false, cancelled: true });
  });

  it("prompts when validateSession reports live", async () => {
    const { coordinator, pendingRequestId } = setup({});
    const validateSession = vi.fn<(cookieHeader: string) => Promise<boolean>>(async () => true);
    const promise = coordinator.captureLoginCookies({ ...baseOpts, validateSession });
    await flush();

    const requestId = pendingRequestId();
    expect(requestId).toBeDefined();
    coordinator.resolveUsageLoginConfirmation({ requestId: requestId!, action: "use" });
    await expect(promise).resolves.toEqual({ ok: true, cookie: "auth=abc" });
  });

  it("reloads and ignores the header on a 'change' confirmation", async () => {
    const { coordinator, tab, pendingRequestId } = setup({});
    const promise = coordinator.captureLoginCookies(baseOpts);
    await flush();

    coordinator.resolveUsageLoginConfirmation({ requestId: pendingRequestId()!, action: "change" });
    await flush();

    expect(tab.loadURL).toHaveBeenCalledWith(baseOpts.loginUrl);

    // The capture is still in flight; cancel to settle the promise.
    coordinator.cancelLoginCapture();
    await expect(promise).resolves.toEqual({ ok: false, cancelled: true });
  });

  it("cancels when no matching auth cookie ever appears", async () => {
    const { coordinator, events } = setup({ cookies: [{ name: "other", value: "x" }] });
    const promise = coordinator.captureLoginCookies(baseOpts);
    await flush();

    expect(events.some((e) => e.type === "usage-login-confirmation")).toBe(false);
    coordinator.cancelLoginCapture();
    await expect(promise).resolves.toEqual({ ok: false, cancelled: true });
  });
});

describe("BrowserLoginCaptureCoordinator.captureLoginCookies validateTabUrl gate", () => {
  afterEach(() => vi.restoreAllMocks());

  const tenantOpts = {
    ...baseOpts,
    authCookiePattern: /^never-matches$/,
    validateTabUrl: (url: string): boolean => {
      try {
        return (
          new URL(url).origin === "https://dash.example" &&
          !!new URL(url).searchParams.get("team_id")
        );
      } catch {
        return false;
      }
    },
  };

  it("prompts on the tab URL alone, capturing cookies no name pattern would match", async () => {
    const { coordinator, pendingRequestId } = setup({
      cookies: [{ name: "dprs", value: "session-value" }],
      tabUrl: "https://dash.example/usage/?team_id=42",
    });
    const promise = coordinator.captureLoginCookies(tenantOpts);
    await flush();

    const requestId = pendingRequestId();
    expect(requestId).toBeDefined();
    coordinator.resolveUsageLoginConfirmation({ requestId: requestId!, action: "use" });
    // The captured URL is also surfaced so callers can seal tenant ids from it.
    await expect(promise).resolves.toEqual({
      ok: true,
      cookie: "dprs=session-value",
      url: "https://dash.example/usage/?team_id=42",
    });
  });

  it("keeps polling while the tab URL has no resolved team yet", async () => {
    const { coordinator, events } = setup({
      cookies: [{ name: "dprs", value: "session-value" }],
      tabUrl: "https://dash.example/usage",
    });
    const promise = coordinator.captureLoginCookies(tenantOpts);
    await flush();

    expect(events.some((e) => e.type === "usage-login-confirmation")).toBe(false);
    coordinator.cancelLoginCapture();
    await expect(promise).resolves.toEqual({ ok: false, cancelled: true });
  });

  it("does not prompt from another origin's URL even when it carries the param", async () => {
    const { coordinator, events } = setup({
      cookies: [{ name: "dprs", value: "session-value" }],
      tabUrl: "https://auth.example/finish?team_id=42",
    });
    const promise = coordinator.captureLoginCookies(tenantOpts);
    await flush();

    expect(events.some((e) => e.type === "usage-login-confirmation")).toBe(false);
    coordinator.cancelLoginCapture();
    await expect(promise).resolves.toEqual({ ok: false, cancelled: true });
  });

  it("never prompts while the jar for the cookie URL is empty", async () => {
    const { coordinator, events } = setup({
      cookies: [],
      tabUrl: "https://dash.example/usage/?team_id=42",
    });
    const promise = coordinator.captureLoginCookies(tenantOpts);
    await flush();

    expect(events.some((e) => e.type === "usage-login-confirmation")).toBe(false);
    coordinator.cancelLoginCapture();
    await expect(promise).resolves.toEqual({ ok: false, cancelled: true });
  });
});
