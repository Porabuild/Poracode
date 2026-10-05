import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCanonicalServiceWorker } from "./registerServiceWorker";

const runtime = vi.hoisted(() => ({ electron: false }));
vi.mock("@/renderer/clientRuntime", () => ({
  hasElectronHostBridge: () => runtime.electron,
}));

let originalUrl = "";
let performanceDescriptor: PropertyDescriptor | undefined;
let secureDescriptor: PropertyDescriptor | undefined;
const active = { postMessage: vi.fn<(message: unknown) => void>() };
const waiting = { postMessage: vi.fn<(message: unknown) => void>() };
const installing = { postMessage: vi.fn<(message: unknown) => void>() };
let registration: ServiceWorkerRegistration;
let register: ReturnType<typeof vi.fn<ServiceWorkerContainer["register"]>>;
let entries: string[] = [];

beforeEach(() => {
  originalUrl = window.location.href;
  window.history.replaceState(null, "", "/thread/thread-1?host=local#resume");
  performanceDescriptor = Object.getOwnPropertyDescriptor(performance, "getEntriesByType");
  secureDescriptor = Object.getOwnPropertyDescriptor(window, "isSecureContext");
  Object.defineProperty(performance, "getEntriesByType", {
    configurable: true,
    value: (type: string) =>
      type === "resource" ? entries.map((name) => ({ name }) as PerformanceEntry) : [],
  });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  registration = Object.assign(new EventTarget(), {
    active,
    waiting,
    installing,
  }) as unknown as ServiceWorkerRegistration;
  register = vi.fn<ServiceWorkerContainer["register"]>(async () => registration);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register, ready: Promise.resolve(registration) },
  });
  vi.stubEnv("DEV", false);
  vi.stubEnv("BASE_URL", "./");
  vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
  runtime.electron = false;
  entries = [
    window.location.origin + "/assets/entry.js",
    window.location.origin + "/assets/lazy.css",
    window.location.origin + "/thread/assets/wrong.js",
    window.location.origin + "/icons/icon.svg",
    "https://elsewhere.example/assets/entry.js",
  ];
});

afterEach(() => {
  document.head.querySelector('meta[name="poracode-build-asset-base"]')?.remove();
  document.head.querySelector("base")?.remove();
  window.history.replaceState(null, "", originalUrl);
  Reflect.deleteProperty(navigator, "serviceWorker");
  if (performanceDescriptor)
    Object.defineProperty(performance, "getEntriesByType", performanceDescriptor);
  else Reflect.deleteProperty(performance, "getEntriesByType");
  if (secureDescriptor) Object.defineProperty(window, "isSecureContext", secureDescriptor);
  else Reflect.deleteProperty(window, "isSecureContext");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function localMarker(): void {
  const marker = document.createElement("meta");
  marker.name = "poracode-build-asset-base";
  marker.content = "/";
  document.head.append(marker);
}

describe("canonical service-worker build assets", () => {
  it("notifies all worker lifecycles of actual root assets from a nested local route", async () => {
    localMarker();
    const route = window.location.href;
    registerCanonicalServiceWorker();
    await vi.waitFor(() => expect(active.postMessage).toHaveBeenCalledTimes(2));
    expect(register).toHaveBeenCalledExactlyOnceWith("/service-worker.js", { scope: "/" });
    const message = {
      type: "cache-build-assets",
      urls: entries.slice(0, 2),
    };
    for (const worker of [active, waiting, installing]) {
      expect(worker.postMessage).toHaveBeenLastCalledWith(message);
    }
    registration.dispatchEvent(new Event("updatefound"));
    expect(installing.postMessage).toHaveBeenCalledTimes(2);
    expect(installing.postMessage).toHaveBeenLastCalledWith(message);
    expect(window.location.href).toBe(route);
  });

  it("preserves an old relative build without private metadata", async () => {
    registerCanonicalServiceWorker();
    await vi.waitFor(() => expect(active.postMessage).toHaveBeenCalled());
    expect(register).toHaveBeenCalledWith("/service-worker.js", { scope: "/" });
    expect(active.postMessage).toHaveBeenLastCalledWith({
      type: "cache-build-assets",
      urls: [entries[2]],
    });
  });

  it("keeps a declared hosted subpath for worker scope and asset notification", async () => {
    localMarker();
    vi.stubEnv("BASE_URL", "/hosted/");
    entries.push(window.location.origin + "/hosted/assets/main.js");
    registerCanonicalServiceWorker();
    await vi.waitFor(() => expect(active.postMessage).toHaveBeenCalled());
    expect(register).toHaveBeenCalledExactlyOnceWith("/hosted/service-worker.js", {
      scope: "/hosted/",
    });
    expect(active.postMessage).toHaveBeenLastCalledWith({
      type: "cache-build-assets",
      urls: [entries.at(-1)],
    });
  });

  it("uses the existing document base for relative loaded-asset URLs", async () => {
    const base = document.createElement("base");
    base.href = "/hosted/";
    document.head.append(base);
    entries.push(window.location.origin + "/hosted/assets/main.js");
    registerCanonicalServiceWorker();
    await vi.waitFor(() => expect(active.postMessage).toHaveBeenCalled());
    expect(active.postMessage).toHaveBeenLastCalledWith({
      type: "cache-build-assets",
      urls: [entries.at(-1)],
    });
    expect(base.getAttribute("href")).toBe("/hosted/");
  });

  it("waits for load once and keeps registration rejection best-effort", async () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    register.mockRejectedValueOnce(new Error("offline"));
    registerCanonicalServiceWorker();
    expect(register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("load"));
    window.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    expect(active.postMessage).not.toHaveBeenCalled();
  });

  it.each(["development", "electron", "insecure", "missing-api"])("skips %s delivery", (mode) => {
    if (mode === "development") vi.stubEnv("DEV", true);
    if (mode === "electron") runtime.electron = true;
    if (mode === "insecure") {
      Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    }
    if (mode === "missing-api") Reflect.deleteProperty(navigator, "serviceWorker");
    registerCanonicalServiceWorker();
    expect(register).not.toHaveBeenCalled();
  });
});
