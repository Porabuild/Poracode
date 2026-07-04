// Service worker for the standalone (hosted) Poracode PWA. The desktop-served
// build ships an equivalent worker generated at runtime (see
// src/main/remote/pairingPage.ts); keep the two in sync.
//
// Strategy: network-first for same-origin GETs, caching successful responses
// and falling back to the cache (and to the app shell for navigations) when
// offline. Cross-origin requests — notably the paired desktop's /api, /oauth
// and /ws endpoints, which live on a different host — are never intercepted.
const CACHE_NAME = "poracode-pwa-v1";
const SHELL_URLS = ["/", "/app", "/manifest.webmanifest", "/app-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Only handle same-origin requests; the desktop API lives elsewhere.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          return (await caches.match("/app")) || (await caches.match("/")) || Response.error();
        }
        return Response.error();
      }),
  );
});
