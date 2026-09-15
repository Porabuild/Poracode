function loadedBuildAssetUrls(buildBasePath: string): string[] {
  if (typeof performance === "undefined") return [];
  const assetPrefix = new URL(`${buildBasePath}assets/`, window.location.href).href;
  return performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((url) => url.startsWith(assetPrefix));
}

function cacheLoadedBuildAssets(
  registration: ServiceWorkerRegistration,
  buildBasePath: string,
): void {
  const notify = (worker: ServiceWorker | null | undefined) => {
    worker?.postMessage({ type: "cache-build-assets", urls: loadedBuildAssetUrls(buildBasePath) });
  };
  notify(registration.active);
  notify(registration.waiting);
  notify(registration.installing);
  registration.addEventListener("updatefound", () => notify(registration.installing));
  void navigator.serviceWorker.ready.then((ready) => notify(ready.active));
}

/** Registers the one canonical app shell. Electron and insecure LAN origins
 * deliberately skip this: Electron owns its package lifecycle, while service
 * workers require a secure browser context. */
export function registerCanonicalServiceWorker(): void {
  if (import.meta.env.DEV || window.poracodeHost) return;
  if (!("serviceWorker" in navigator) || window.isSecureContext === false) return;

  const register = () => {
    const buildBasePath = import.meta.env.BASE_URL;
    const scriptUrl = buildBasePath.startsWith("/")
      ? `${buildBasePath}service-worker.js`
      : "/service-worker.js";
    const scope = buildBasePath.startsWith("/") ? buildBasePath : "/";
    navigator.serviceWorker
      .register(scriptUrl, { scope })
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
