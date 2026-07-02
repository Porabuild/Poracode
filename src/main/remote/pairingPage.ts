function jsonForScript(value: string): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function buildLocalPairingPageHtml(input: { readonly httpBaseUrl: string }): string {
  const endpointJson = jsonForScript(input.httpBaseUrl);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#070709" />
  <title>Poracode</title>
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" href="/app-icon.svg" />
  <style>
    :root {
      color-scheme: dark;
      --bg: #070709;
      --panel: #0e0e14;
      --line: rgba(255, 255, 255, 0.12);
      --text: #eaf0fb;
      --muted: #9ba6be;
      --accent: #8b7bff;
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
    }
  </style>
</head>
<body>
  <div class="app">
    <main>
      <h1>Poracode</h1>
      <p>The mobile web app bundle is not available from this desktop build. Rebuild Poracode so <span class="inline-code">mobile.html</span> is included in the renderer output, then open the pairing link again.</p>
      <p>Desktop endpoint</p>
      <code class="endpoint" id="endpoint"></code>
    </main>
  </div>
  <script>
    document.getElementById("endpoint").textContent = ${endpointJson};
  </script>
</body>
</html>
`;
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

const LOCAL_PAIRING_SERVICE_WORKER_JS = `const CACHE_NAME = "poracode-remote-local-v1";
const SHELL_URLS = ["/app", "/manifest.webmanifest", "/app-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/oauth/") || url.pathname === "/ws") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/app"))),
  );
});
`;

export function buildLocalPairingServiceWorkerJs(): string {
  return LOCAL_PAIRING_SERVICE_WORKER_JS;
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
