// Service worker for the standalone (hosted) Poracode PWA. The desktop-served
// build ships an equivalent worker generated at runtime (see
// src/main/remote/pairingPage.ts); keep the two in sync.
//
// Strategy: cache-first for immutable hashed build assets, network-first for
// other same-origin GETs, and an app-shell fallback for offline navigations.
// Cross-origin requests — notably the paired desktop's /api, /oauth and /ws
// endpoints, which live on a different host — are never intercepted.
const BUILD_VERSION = "__PORACODE_BUILD_VERSION__";
const CACHE_NAME = `poracode-pwa-${BUILD_VERSION}`;
const NAVIGATION_FALLBACK_DELAY_MS = 500;
const APP_BASE_URL = new URL("./", self.location.href);
const shellUrl = (path) => new URL(path, APP_BASE_URL).pathname;
const SHELL_URLS = ["./", "app", "manifest.webmanifest", "app-icon.svg"].map(shellUrl);

function shellAssetUrls(html) {
  const urls = new Set();
  for (const match of html.matchAll(/["']([^"']*\/assets\/[^"']+)["']/g)) {
    const url = new URL(match[1], APP_BASE_URL);
    if (url.origin === self.location.origin) urls.add(`${url.pathname}${url.search}`);
  }
  return [...urls];
}

async function cacheShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
  const shell = await cache.match(shellUrl("app"));
  if (!shell) return;
  const assets = shellAssetUrls(await shell.text());
  await Promise.allSettled(assets.map((url) => cache.add(url)));
}

function validBuildAssetUrls(value) {
  if (!Array.isArray(value)) return [];
  const assetPrefix = `${APP_BASE_URL.pathname}assets/`;
  return value.slice(0, 256).flatMap((candidate) => {
    if (typeof candidate !== "string") return [];
    const url = new URL(candidate, APP_BASE_URL);
    return url.origin === self.location.origin && url.pathname.startsWith(assetPrefix)
      ? [`${url.pathname}${url.search}`]
      : [];
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("poracode-pwa-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache-build-assets") return;
  const urls = validBuildAssetUrls(event.data.urls);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.allSettled(urls.map((url) => cache.add(url)))),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Only handle same-origin requests; the desktop API lives elsewhere.
  if (url.origin !== self.location.origin) return;
  const isAppRequest = url.pathname === "/app" || url.pathname.startsWith("/app/");
  const buildRoute = APP_BASE_URL.pathname.replace(/\/$/, "");
  const isBuildRequest =
    buildRoute === "" || url.pathname === buildRoute || url.pathname.startsWith(`${buildRoute}/`);
  if (!isAppRequest && !isBuildRequest) return;

  if (url.pathname.startsWith(`${APP_BASE_URL.pathname}assets/`)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    const networkResponse = fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(shellUrl("app"), response.clone());
      }
      return response;
    });
    const cachedResponse = new Promise((resolve) => {
      setTimeout(() => {
        void caches.match(shellUrl("app")).then(resolve);
      }, NAVIGATION_FALLBACK_DELAY_MS);
    });
    event.waitUntil(
      networkResponse.then(
        () => undefined,
        () => undefined,
      ),
    );
    event.respondWith(
      Promise.race([networkResponse, cachedResponse])
        .then((response) => response || networkResponse)
        .catch(
          async () =>
            (await caches.match(shellUrl("app"))) ||
            (await caches.match(shellUrl("./"))) ||
            Response.error(),
        ),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          const cacheKey = request.mode === "navigate" ? shellUrl("app") : request;
          void caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          return (
            (await caches.match(shellUrl("app"))) ||
            (await caches.match(shellUrl("./"))) ||
            Response.error()
          );
        }
        return Response.error();
      }),
  );
});
