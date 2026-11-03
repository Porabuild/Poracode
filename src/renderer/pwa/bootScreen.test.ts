import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const html = readFileSync(resolve(import.meta.dirname, "../../../index.html"), "utf8");
const source = html
  .match(/<script id="poracode-pwa-boot">([\s\S]*?)<\/script>/)![1]!
  .replace(
    "__PORACODE_BOOT_MESSAGES__",
    JSON.stringify({
      en: ["Loading…", "Checking for updates…", "Failed to load", "Reload"],
      de: ["Laden…", "Suche nach Updates…", "Laden fehlgeschlagen", "Neu laden"],
    }),
  )
  .replace("__PORACODE_BOOT_WORKER_ENABLED__", "true");

function boot(
  url = "https://app.example/thread/1?host=test#resume",
  electron = false,
  offline = false,
) {
  document.body.innerHTML =
    '<div id="root"></div>' + html.match(/<div id="poracode-boot"[\s\S]*?<\/div>/)![0];
  document.head.innerHTML =
    '<meta name="poracode-build-version" content="current"><link rel="manifest" href="/manifest.webmanifest">';
  const target = Object.assign(new EventTarget(), {
    isSecureContext: true,
    poracodeHost: electron,
  });
  const update = vi.fn<() => Promise<void>>(async () => undefined);
  const registration = Object.assign(new EventTarget(), {
    update,
    active: null as { postMessage(message: unknown): void } | null,
    waiting: null as { postMessage(message: unknown): void } | null,
    installing: null as EventTarget | null,
  });
  const serviceWorker = Object.assign(new EventTarget(), {
    register: vi.fn<() => Promise<typeof registration>>(async () => registration),
    getRegistration: vi.fn<() => Promise<typeof registration | undefined>>(async () =>
      offline ? undefined : registration,
    ),
  });
  if (offline) serviceWorker.register.mockRejectedValueOnce(new Error("offline"));
  const replace = vi.fn<(url: string) => void>();
  const location = Object.assign(new URL(url), { replace });
  const replaceState = vi.fn<History["replaceState"]>();
  const browserNavigator = { language: "en-US", onLine: true, serviceWorker };
  runInNewContext(source, {
    window: target,
    document,
    navigator: browserNavigator,
    location,
    localStorage,
    sessionStorage,
    history: { state: null, replaceState },
    URL,
    URLSearchParams,
    MutationObserver,
    Date,
    setTimeout,
    clearTimeout,
  });
  const screen = document.getElementById("poracode-boot")!;
  return {
    target,
    update,
    serviceWorker,
    registration,
    browserNavigator,
    replace,
    replaceState,
    screen,
    root: document.getElementById("root")!,
    status: document.getElementById("poracode-boot-status")!,
    retry: document.getElementById("poracode-boot-retry")!,
    failImport() {
      const event = new Event("unhandledrejection", { cancelable: true });
      Object.assign(event, { reason: new TypeError("Importing a module script failed.") });
      target.dispatchEvent(event);
      return event;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000 });
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("document-level PWA boot recovery", () => {
  it("paints an accessible loader before modules load and hides it once the app mounts", async () => {
    const fixture = boot();
    expect(fixture.screen.hidden).toBe(false);
    expect(fixture.screen.getAttribute("aria-busy")).toBe("true");
    expect(fixture.status.textContent).toBe("Loading…");
    fixture.root.append(document.createElement("main"));
    await Promise.resolve();
    expect(fixture.screen.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(fixture.replace).not.toHaveBeenCalled();
    expect(fixture.screen.hidden).toBe(true);
  });

  it("recovers a missing static entry before any renderer handlers can install", async () => {
    const fixture = boot();
    const entry = document.createElement("script");
    entry.src = "/assets/entry-removed.js";
    const event = new Event("error");
    Object.defineProperty(event, "target", { value: entry });
    fixture.target.dispatchEvent(event);
    expect(fixture.status.textContent).toBe("Checking for updates…");
    await vi.advanceTimersByTimeAsync(8000);
    expect(fixture.replace).toHaveBeenCalledExactlyOnceWith(
      "https://app.example/thread/1?host=test&__poracode_reload=1008000#resume",
    );
  });

  it("bounds Safari import recovery across reloads and provides a manual retry", async () => {
    const first = boot();
    expect(first.failImport().defaultPrevented).toBe(true);
    await vi.advanceTimersByTimeAsync(8000);
    const second = boot(first.replace.mock.calls[0]![0]);
    second.failImport();
    expect(second.status.textContent).toBe("Failed to load");
    expect(second.retry.hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(8000);
    expect(second.replace).not.toHaveBeenCalled();
    second.retry.click();
    expect(second.status.textContent).toBe("Checking for updates…");
    await vi.advanceTimersByTimeAsync(8000);
    expect(second.replace).toHaveBeenCalledOnce();
  });

  it("keeps the reload bound when WebKit denies browser storage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const fixture = boot("https://app.example/?__poracode_reload=999000");
    fixture.failImport();
    expect(fixture.status.textContent).toBe("Failed to load");
    await vi.advanceTimersByTimeAsync(8000);
    expect(fixture.replace).not.toHaveBeenCalled();
  });

  it("offers retry after a hung startup without repeatedly reloading an offline app", async () => {
    const fixture = boot();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fixture.status.textContent).toBe("Failed to load");
    expect(fixture.retry.hidden).toBe(false);
    expect(fixture.replace).not.toHaveBeenCalled();
  });

  it("uses the saved Lingui locale even if catalog modules cannot be fetched", () => {
    localStorage.setItem("poracode-shared-settings", JSON.stringify({ locale: "de" }));
    const fixture = boot();
    expect(fixture.status.textContent).toBe("Laden…");
    expect(fixture.retry.textContent).toBe("Neu laden");
  });

  it("starts with the browser locale when the persisted locale is malformed", () => {
    localStorage.setItem("poracode-shared-settings", JSON.stringify({ locale: 42 }));
    const fixture = boot();
    expect(fixture.status.textContent).toBe("Loading…");
    expect(fixture.screen.hidden).toBe(false);
  });

  it("checks for an update when a suspended iOS document is shown again", async () => {
    const fixture = boot();
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.update).toHaveBeenCalledOnce();
    fixture.target.dispatchEvent(new Event("pageshow"));
    expect(fixture.update).toHaveBeenCalledTimes(2);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fixture.update).toHaveBeenCalledTimes(3);
  });

  it("skips update fetches while offline and checks again when connectivity returns", async () => {
    const fixture = boot();
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.update).toHaveBeenCalledOnce();
    fixture.browserNavigator.onLine = false;
    fixture.target.dispatchEvent(new Event("pageshow"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fixture.update).toHaveBeenCalledOnce();
    fixture.browserNavigator.onLine = true;
    fixture.target.dispatchEvent(new Event("online"));
    expect(fixture.update).toHaveBeenCalledTimes(2);
  });

  it("retries registration on reconnect after the initial offline attempt fails", async () => {
    const fixture = boot(undefined, false, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.serviceWorker.register).toHaveBeenCalledOnce();
    fixture.target.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.serviceWorker.register).toHaveBeenCalledTimes(2);
    expect(fixture.update).toHaveBeenCalledOnce();
  });

  it("activates a waiting update when installation finishes after the initial update check", async () => {
    const fixture = boot();
    await vi.advanceTimersByTimeAsync(0);
    const installing = new EventTarget();
    fixture.registration.installing = installing;
    fixture.registration.dispatchEvent(new Event("updatefound"));
    const postMessage = vi.fn<(message: unknown) => void>();
    fixture.registration.waiting = { postMessage };
    installing.dispatchEvent(new Event("statechange"));
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: "activate-build" });
  });

  it("activates an already-waiting update when a suspended page resumes", async () => {
    const fixture = boot();
    await vi.advanceTimersByTimeAsync(0);
    const postMessage = vi.fn<(message: unknown) => void>();
    fixture.registration.waiting = { postMessage };
    fixture.target.dispatchEvent(new Event("pageshow"));
    expect(postMessage).toHaveBeenCalledWith({ type: "activate-build" });
  });

  it("checks the active worker's build after resume even if the worker has no new update", async () => {
    const fixture = boot();
    await vi.advanceTimersByTimeAsync(0);
    const postMessage = vi.fn<(message: unknown) => void>();
    fixture.registration.active = { postMessage };
    fixture.target.dispatchEvent(new Event("pageshow"));
    await vi.advanceTimersByTimeAsync(0);
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({
      type: "check-build",
      version: "current",
    });
  });

  it("reports its build to a newly activated worker and shows progress for a different build", () => {
    const fixture = boot();
    const reply = vi.fn<(message: unknown) => void>();
    fixture.serviceWorker.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "poracode-build-activated", version: "next" },
        ports: [{ postMessage: reply } as unknown as MessagePort],
      }),
    );
    expect(reply).toHaveBeenCalledExactlyOnceWith({ version: "current" });
    expect(fixture.status.textContent).toBe("Checking for updates…");
  });

  it("leaves Electron's package lifecycle alone", () => {
    const fixture = boot(undefined, true);
    expect(fixture.screen.hidden).toBe(true);
    expect(fixture.serviceWorker.register).not.toHaveBeenCalled();
  });
});
