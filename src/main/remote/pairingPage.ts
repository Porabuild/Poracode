function jsonForScript(value: string): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

/**
 * Shared skeleton for the two server-rendered dark pages in this file (the
 * pairing fallback and the forward-enter error). Both are emitted outside the
 * renderer bundle, so they carry no i18n and hand-roll their own minimal HTML.
 * The shell owns the doctype, viewport/theme meta, `Poracode` title, and the
 * `<style>`/`<body>` wrappers so that boilerplate lives in one place; each
 * caller supplies any extra `<head>` markup, its page-specific CSS, and the
 * `<body>` inner markup.
 */
function buildDarkPageShell(input: {
  readonly headExtra?: string;
  readonly css: string;
  readonly body: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#070709" />
  <title>Poracode</title>${input.headExtra ?? ""}
  <style>
${input.css}
  </style>
</head>
<body>
${input.body}
</body>
</html>
`;
}

export function buildLocalPairingPageHtml(input: { readonly httpBaseUrl: string }): string {
  const endpointJson = jsonForScript(input.httpBaseUrl);

  return buildDarkPageShell({
    headExtra: `
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" href="/app-icon.svg" />`,
    css: `    :root {
      color-scheme: dark;
      --bg: #070709;
      --panel: #0e0e14;
      --line: rgba(255, 255, 255, 0.12);
      --text: #eaf0fb;
      --muted: #9ba6be;
      --accent: #8892ef;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
    }
    button {
      font: inherit;
    }
    .app {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: calc(24px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));
    }
    main {
      width: min(100%, 520px);
      display: grid;
      gap: 16px;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 20px;
      background: var(--panel);
    }
    h1 {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.45;
    }
    .inline-code {
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.92em;
    }
    .endpoint {
      display: block;
      overflow-wrap: anywhere;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.04);
      color: var(--muted);
      font-size: 13px;
    }`,
    body: `  <div class="app">
    <main>
      <h1>Poracode</h1>
      <p>The mobile web app bundle is not available from this desktop build. Rebuild Poracode so <span class="inline-code">mobile.html</span> is included in the renderer output, then open the pairing link again.</p>
      <p>Desktop endpoint</p>
      <code class="endpoint" id="endpoint"></code>
    </main>
  </div>
  <script>
    document.getElementById("endpoint").textContent = ${endpointJson};
  </script>`,
  });
}

/** Plain error page for a failed `GET /forward/<id>/enter` (invalid/expired
 * token, or a forward that was stopped since the token was minted). Server-
 * rendered outside the renderer bundle, so — like the rest of this file — it
 * carries no i18n; the phone only lands here on a broken/expired deep link. */
export function buildForwardEnterErrorPageHtml(): string {
  return buildDarkPageShell({
    css: `    :root {
      color-scheme: dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #070709;
      color: #eaf0fb;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }
    main {
      width: min(100%, 480px);
      display: grid;
      gap: 12px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 20px;
      background: #0e0e14;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      line-height: 1.2;
    }
    p {
      margin: 0;
      color: #9ba6be;
      line-height: 1.45;
    }`,
    body: `  <main>
    <h1>Link expired</h1>
    <p>This forwarded-port link is invalid, expired, or the forward was closed on the desktop. Reopen it from the app.</p>
  </main>`,
  });
}

const LOCAL_PAIRING_MANIFEST_JSON = JSON.stringify({
  id: "/app",
  name: "Poracode",
  short_name: "Poracode",
  start_url: "/app",
  scope: "/",
  display: "standalone",
  // Matches the installed PWA's splash/status chrome to the app's dark
  // background (mobile.html theme-color).
  background_color: "#070709",
  theme_color: "#070709",
  // PNG icons are copied from public/ into the built renderer (/icons) and
  // served by tryServeBuiltMobileApp; the SVG falls back for older builds.
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    {
      src: "/icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
    { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
  ],
});

export function buildLocalPairingManifestJson(): string {
  return LOCAL_PAIRING_MANIFEST_JSON;
}

const LOCAL_PAIRING_SERVICE_WORKER_JS = `const CACHE_NAME = "poracode-remote-local-__PORACODE_LOCAL_BUILD_VERSION__";
const LEGACY_CACHE_NAME = "lightcode-remote-local-v1";
const NAVIGATION_FALLBACK_DELAY_MS = 500;
const SHELL_URLS = ["/app", "/manifest.webmanifest", "/app-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.delete(LEGACY_CACHE_NAME),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("poracode-remote-local-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
    ]).then(() => self.clients.claim()),
  );
});

function parsePushPayload(event) {
  try {
    const payload = event.data?.json();
    if (
      !payload ||
      typeof payload.title !== "string" ||
      typeof payload.body !== "string" ||
      typeof payload.threadId !== "string" ||
      typeof payload.url !== "string" ||
      !/^\\/(?!\\/)[^?#]*$/.test(payload.url)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  if (!payload) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      if (windows.some((client) => client.visibilityState === "visible")) return;
      return self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: \`poracode-thread-\${payload.threadId}\`,
        data: { url: payload.url },
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url;
  if (typeof path !== "string" || !/^\\/(?!\\/)[^?#]*$/.test(path)) return;
  const targetUrl = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/oauth/") || url.pathname === "/ws") return;
  const isAppRequest = url.pathname === "/app" || url.pathname.startsWith("/app/");
  const isPwaStaticRequest =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/poracode-ssh-runtime/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/app-icon.svg" ||
    url.pathname === "/notification.mp3";
  if (!isAppRequest && !isPwaStaticRequest) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const contentType = response.headers.get("content-type") ?? "";
            if (response.ok && contentType.startsWith("text/html")) {
              return new Response("Not found", { status: 404, statusText: "Not Found" });
            }
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
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
        await cache.put("/app", response.clone());
      }
      return response;
    });
    const cachedResponse = new Promise((resolve) => {
      setTimeout(() => {
        caches.match("/app").then(resolve);
      }, NAVIGATION_FALLBACK_DELAY_MS);
    });
    event.waitUntil(networkResponse.then(() => undefined, () => undefined));
    event.respondWith(
      Promise.race([networkResponse, cachedResponse])
        .then((response) => response || networkResponse)
        .catch(() => caches.match("/app").then((cached) => cached || Response.error())),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          const cacheKey = request.mode === "navigate" ? "/app" : request;
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/app"))),
  );
});
`;

export function buildLocalPairingServiceWorkerJs(appVersion: string): string {
  const buildVersion = appVersion.replace(/[^a-zA-Z0-9._-]/g, "-");
  return LOCAL_PAIRING_SERVICE_WORKER_JS.replace("__PORACODE_LOCAL_BUILD_VERSION__", buildVersion);
}

// Kept in sync with public/app-icon.svg (the static/standalone icon).
const LOCAL_PAIRING_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Poracode">
  <rect width="1024" height="1024" rx="232" fill="#0E0E14"/>
  <path fill-rule="evenodd" fill="#EAF0FB"
    d="M352,300 H556 A152,152 0 0 1 556,604 H472 V730 H352 Z
       M472,392 H548 A60,60 0 0 1 548,512 H472 Z"/>
  <circle cx="636" cy="694" r="46" fill="#8B7BFF"/>
</svg>
`;

export function buildLocalPairingIconSvg(): string {
  return LOCAL_PAIRING_ICON_SVG;
}
