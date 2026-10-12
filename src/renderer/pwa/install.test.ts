// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

function beforeInstallPromptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const prompt = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };
  Object.defineProperties(event, {
    prompt: { value: prompt },
    userChoice: { value: Promise.resolve({ outcome }) },
  });
  return { event, prompt };
}

async function loadPwaInstall() {
  vi.resetModules();
  return import("./install");
}

describe("pwaInstall", () => {
  afterEach(() => {
    window.dispatchEvent(new Event("appinstalled"));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("captures the browser install prompt and replays it once", async () => {
    const pwaInstall = await loadPwaInstall();
    expect(pwaInstall.canInstall()).toBe(false);

    const { event, prompt } = beforeInstallPromptEvent("accepted");
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(pwaInstall.canInstall()).toBe(true);
    await expect(pwaInstall.promptInstall()).resolves.toBe(true);
    expect(prompt).toHaveBeenCalledOnce();
    expect(pwaInstall.canInstall()).toBe(false);
    await expect(pwaInstall.promptInstall()).resolves.toBe(false);
  });

  it("clears a captured install prompt after the app is installed", async () => {
    const pwaInstall = await loadPwaInstall();

    window.dispatchEvent(beforeInstallPromptEvent().event);
    expect(pwaInstall.canInstall()).toBe(true);

    window.dispatchEvent(new Event("appinstalled"));

    expect(pwaInstall.canInstall()).toBe(false);
  });

  it("detects the standalone display context", async () => {
    const pwaInstall = await loadPwaInstall();
    Object.defineProperty(window.navigator, "standalone", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn<(query: string) => Pick<MediaQueryList, "matches">>((query) => ({
        matches: query === "(display-mode: standalone)",
      })),
    });

    expect(pwaInstall.isStandaloneDisplay()).toBe(true);
    expect(pwaInstall.isIosInstallBrowser()).toBe(false);
  });
});
