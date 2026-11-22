import { hasElectronHostBridge } from "@/renderer/clientRuntime";
import { getBuildAssetBase } from "../buildAssetBase";

function loadedBuildAssetUrls(buildBasePath: string): string[] {
  if (typeof performance === "undefined") return [];
  const assetPrefix = new URL(`${buildBasePath}assets/`, document.baseURI).href;
  return performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((url) => url.startsWith(assetPrefix));
}

function cacheLoadedBuildAssets(
  registration: ServiceWorkerRegistration,
  buildBasePath: string,
): void {
  const sendUrls = (urls: string[]) => {
    if (urls.length === 0) return;
    const message = { type: "cache-build-assets", urls };
    registration.active?.postMessage(message);
    registration.waiting?.postMessage(message);
    registration.installing?.postMessage(message);
  };
  const notifyAll = (worker: ServiceWorker | null | undefined) => {
    worker?.postMessage({ type: "cache-build-assets", urls: loadedBuildAssetUrls(buildBasePath) });
  };
  notifyAll(registration.active);
  notifyAll(registration.waiting);
  notifyAll(registration.installing);
  registration.addEventListener("updatefound", () => notifyAll(registration.installing));
  void navigator.serviceWorker.ready.then((ready) => notifyAll(ready.active));

  if (typeof PerformanceObserver !== "undefined") {
    const assetPrefix = new URL(`${buildBasePath}assets/`, document.baseURI).href;
    const seen = new Set<string>(loadedBuildAssetUrls(buildBasePath));
    try {
      const observer = new PerformanceObserver((list) => {
        const fresh = list
          .getEntries()
          .map((entry) => entry.name)
          .filter((url) => url.startsWith(assetPrefix) && !seen.has(url));
        if (fresh.length === 0) return;
        for (const url of fresh) seen.add(url);
        sendUrls(fresh);
      });
      observer.observe({ type: "resource", buffered: false });
    } catch {
      // Unsupported entryType in older engines; initial resource scan still ran.
    }
  }
}

/** Registers the one canonical app shell. Electron and insecure LAN origins
 * deliberately skip this: Electron owns its package lifecycle, while service
 * workers require a secure browser context. */
export function registerCanonicalServiceWorker(): void {
  if (import.meta.env.DEV || hasElectronHostBridge()) return;
  if (!("serviceWorker" in navigator) || window.isSecureContext === false) return;

  const register = () => {
    if (navigator.onLine === false) {
      window.addEventListener("online", register, { once: true });
      return;
    }
    const buildBasePath = getBuildAssetBase();
    const scriptUrl = buildBasePath.startsWith("/")
      ? `${buildBasePath}service-worker.js`
      : "/service-worker.js";
    const scope = buildBasePath.startsWith("/") ? buildBasePath : "/";
    navigator.serviceWorker
      .register(scriptUrl, { scope, updateViaCache: "none" })
      .then((registration) => cacheLoadedBuildAssets(registration, buildBasePath))
      .catch(() => {
        // Offline/install support is best-effort and must never block startup.
      });
  };

  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}
