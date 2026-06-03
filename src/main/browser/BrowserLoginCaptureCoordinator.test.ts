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

function setup(opts: { cookies?: Array<{ name: string; value: string }> }) {
  const events: BrowserEvent[] = [];
  const cookieJar = opts.cookies ?? [{ name: "auth", value: "abc" }];
  const tab = {
    isDestroyed: () => false,
    isAttached: () => true,
    loadURL: vi.fn<(url: string) => Promise<void>>(async () => {}),
    webContents: {
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
