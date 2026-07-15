import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { defineConfig, loadEnv, normalizePath, type Plugin } from "vite";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";

const compilerPreset = reactCompilerPreset();
const linguiPreset = linguiTransformerBabelPreset();
const CLIENT_SOURCE_RE = /[\\/]src[\\/](?:renderer|mobile)[\\/].*\.[tj]sx?(?:$|\?)/;
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const MATERIAL_ICON_DIR = resolve(__dirname, "node_modules/material-icon-theme/icons");
const MATERIAL_ICON_ASSET_PREFIX = "/assets/material-icons/";
const MANAGED_WORKTREES_GLOB = `${normalizePath(resolve(__dirname, ".poracode/worktrees"))}/**`;
const DESKTOP_OPTIMIZED_DEPS = [
  "@chenglou/pretext",
  "@dnd-kit/dom",
  "@dnd-kit/react",
  "@dnd-kit/react/sortable",
  "@git-diff-view/react",
  "@heroui/react",
  "@lingui/core",
  "@lingui/core/macro",
  "@lingui/react",
  "@lingui/react/macro",
  "@monaco-editor/react",
  "@sentry/electron/renderer",
  "@tanstack/react-virtual",
  "@tiptap/extensions",
  "@tiptap/react",
  "@tiptap/react/menus",
  "@tiptap/starter-kit",
  "@xterm/addon-clipboard",
  "@xterm/addon-fit",
  "@xterm/addon-image",
  "@xterm/addon-search",
  "@xterm/addon-unicode11",
  "@xterm/addon-webgl",
  "@xterm/xterm",
  "lucide-react",
  "qrcode",
  "react",
  "react-dom",
  "react-dom/client",
  "react-markdown",
  "react/compiler-runtime",
  "react/jsx-dev-runtime",
  "react/jsx-runtime",
  "rehype-raw",
  "remark-gfm",
  "shiki",
  "streamdown",
  "style-to-js",
  "use-sync-external-store",
  "zod",
  "zustand",
  "zustand/middleware",
  "zustand/react/shallow",
  "zustand/shallow",
] as const;

function readEnvValue(env: Record<string, string>, key: string): string {
  return (env[key] ?? process.env[key] ?? "").trim();
}

function buildPostHogEnvDefines(mode: string): Record<string, string> {
  const env = loadEnv(mode, process.cwd(), "");
  const posthogKey = readEnvValue(env, "POSTHOG_KEY");
  const posthogHost = readEnvValue(env, "POSTHOG_HOST") || DEFAULT_POSTHOG_HOST;
  const posthogEnabled = readEnvValue(env, "POSTHOG_ENABLED") || "1";
  const posthogEnableDev = readEnvValue(env, "POSTHOG_ENABLE_DEV") || "0";

  return {
    "import.meta.env.VITE_POSTHOG_ENABLE_DEV": JSON.stringify(posthogEnableDev),
    "import.meta.env.VITE_POSTHOG_ENABLED": JSON.stringify(posthogEnabled),
    "import.meta.env.VITE_POSTHOG_HOST": JSON.stringify(posthogHost),
    "import.meta.env.VITE_POSTHOG_KEY": JSON.stringify(posthogKey),
  };
}

// Inline ternary instead of importing src/shared/channel.normalizeChannel —
// keeps config loading uniform with tsdown.config.ts. Parity is pinned by
// src/shared/channel.config-parity.test.ts.
const poracodeChannel = process.env.PORACODE_CHANNEL === "nightly" ? "nightly" : "stable";

// Mobile-only build target (PORACODE_BUILD_TARGET=mobile) produces a
// self-contained PWA bundle in dist/mobile for standalone hosting (Vercel),
// omitting the desktop renderer entry. The default build emits both entries to
// dist/renderer for the Electron app and its embedded remote-access server.
const mobileOnly = process.env.PORACODE_BUILD_TARGET === "mobile";
const mobileBasePath = process.env.PORACODE_MOBILE_BASE_PATH?.trim() || "./";
const mobileOutputPath =
  mobileBasePath === "./"
    ? "dist/mobile"
    : `dist/mobile/${mobileBasePath.replace(/^\/+|\/+$/g, "")}`;

// Dev-only: connect the renderer to the standalone React DevTools app for
// inspecting/profiling rerenders. The React DevTools *browser extension* uses
// `chrome.scripting` (Manifest V3), which Electron doesn't implement — under
// Electron the extension panels load but never find the React tree
// (facebook/react#25843). The supported alternative is the standalone
// `react-devtools` app (run via `pnpm devtools`), which serves a backend on
// :8097 that the page connects to. The hook must be installed *before* React
// loads, so we inject a classic <script> at the top of <head>; the deferred
// `main.tsx` module script runs after it. Opt-in via PORACODE_REACT_DEVTOOLS=1
// (set by the `dev:devtools` script) so a normal `pnpm dev` stays noise-free
// when the standalone app isn't running.
function reactDevtoolsStandalone(): Plugin {
  return {
    name: "poracode:react-devtools-standalone",
    apply: "serve",
    transformIndexHtml() {
      if (process.env.PORACODE_REACT_DEVTOOLS !== "1") {
        return;
      }
      return [
        {
          tag: "script",
          attrs: { src: "http://localhost:8097" },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

function resizeObserverLoopErrorFilter(): Plugin {
  return {
    name: "poracode:resize-observer-loop-error-filter",
    apply: "serve",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          children: `
(function () {
  var resizeObserverLoopMessages = {
    "ResizeObserver loop completed with undelivered notifications.": true,
    "ResizeObserver loop limit exceeded": true
  };
  window.addEventListener("error", function (event) {
    var message =
      event && event.error && typeof event.error.message === "string"
        ? event.error.message
        : event && typeof event.message === "string"
          ? event.message
          : "";
    if (!resizeObserverLoopMessages[message]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
})();
          `.trim(),
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

function rendererBootstrapTiming(): Plugin {
  const watchedPaths = new Set([
    "/",
    "/src/renderer/main.tsx",
    "/src/renderer/tailwind.css",
    "/src/renderer/styles.css",
    "/src/renderer/app.tsx",
    "/src/renderer/components/providers/bootstrap.ts",
  ]);

  return {
    name: "poracode:renderer-bootstrap-timing",
    apply: "serve",
    configureServer(server) {
      const serverStartedAt = performance.now();
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?", 1)[0] ?? "";
        if (!watchedPaths.has(path)) {
          next();
          return;
        }

        const requestStartedAt = performance.now();
        const serverElapsed = Math.round(requestStartedAt - serverStartedAt);
        console.log(`[renderer-bootstrap] server +${serverElapsed}ms request started ${path}`);
        res.once("finish", () => {
          const duration = Math.round(performance.now() - requestStartedAt);
          console.log(
            `[renderer-bootstrap] server +${Math.round(performance.now() - serverStartedAt)}ms request finished ${path} status=${res.statusCode} duration=${duration}ms`,
          );
        });
        next();
      });
    },
  };
}

function mobileDevIndex(): Plugin {
  return {
    name: "poracode:mobile-dev-index",
    apply: "serve",
    configureServer(server) {
      if (!mobileOnly) return;

      server.middlewares.use((req, _res, next) => {
        const [pathname, query] = (req.url ?? "").split("?", 2);
        const acceptsHtml = req.headers.accept?.includes("text/html") ?? false;
        const isClientRoute =
          pathname === "/" ||
          pathname === "/index.html" ||
          (acceptsHtml &&
            pathname !== "/mobile.html" &&
            !pathname?.split("/").at(-1)?.includes("."));
        if (isClientRoute) {
          req.url = `/mobile.html${query ? `?${query}` : ""}`;
        }
        next();
      });
    },
  };
}

function mobileSshRuntime(): Plugin {
  return {
    name: "poracode:mobile-ssh-runtime",
    apply: "serve",
    configureServer(server) {
      if (!mobileOnly) return;
      const root = resolve(process.cwd(), "resources/mobile-ssh-runtime");
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? "").split("?", 1)[0];
        const name = pathname?.match(
          /^\/poracode-ssh-runtime\/(manifest\.json|runtime\.bin)$/,
        )?.[1];
        if (!name) return next();
        const path = resolve(root, name);
        if (!path.startsWith(root) || !existsSync(path)) return next();
        res.setHeader(
          "Content-Type",
          extname(path) === ".json" ? "application/json" : "application/octet-stream",
        );
        createReadStream(path).pipe(res);
      });
    },
  };
}

function materialIconAssets(): Plugin[] {
  return [
    {
      name: "poracode:material-icon-assets-dev",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use(MATERIAL_ICON_ASSET_PREFIX, (req, res, next) => {
          let requested: string;
          try {
            requested = decodeURIComponent((req.url ?? "").split("?", 1)[0] ?? "").replace(
              /^\/+/,
              "",
            );
          } catch {
            res.statusCode = 400;
            res.end();
            return;
          }
          if (
            !requested ||
            basename(requested) !== requested ||
            extname(requested).toLowerCase() !== ".svg"
          ) {
            res.statusCode = 404;
            res.end();
            return;
          }

          const iconPath = join(MATERIAL_ICON_DIR, requested);
          if (!existsSync(iconPath)) {
            res.statusCode = 404;
            res.end();
            return;
          }

          res.setHeader("content-type", "image/svg+xml; charset=utf-8");
          createReadStream(iconPath).on("error", next).pipe(res);
        });
      },
    },
    {
      name: "poracode:material-icon-assets-build",
      apply: "build",
      buildStart() {
        for (const entry of readdirSync(MATERIAL_ICON_DIR, { withFileTypes: true })) {
          if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".svg") continue;
          this.emitFile({
            type: "asset",
            fileName: `${MATERIAL_ICON_ASSET_PREFIX.slice(1)}${entry.name}`,
            source: readFileSync(join(MATERIAL_ICON_DIR, entry.name)),
          });
        }
      },
    },
  ];
}

export default defineConfig(({ mode }) => ({
  plugins: [
    resizeObserverLoopErrorFilter(),
    mobileSshRuntime(),
    rendererBootstrapTiming(),
    mobileDevIndex(),
    reactDevtoolsStandalone(),
    react(),
    // Babel applies presets right-to-left, so Lingui expands before the React
    // Compiler. Keeping both as filtered Rolldown presets also lets non-React,
    // non-Lingui modules bypass Babel entirely during dev startup.
    // We use the Babel macro (not the SWC plugin) because this project transforms
    // with Babel, sidestepping the SWC-plugin/runtime version-matching pitfalls.
    babel({
      include: CLIENT_SOURCE_RE,
      presets: [compilerPreset, linguiPreset],
    }),
    // Compiles `.po` catalog imports into runtime message modules on the fly,
    // so we never need a separate `lingui compile` step for the app build.
    lingui(),
    ...materialIconAssets(),
  ],
  base: mobileOnly ? mobileBasePath : "./",
  define: {
    ...buildPostHogEnvDefines(mode),
    __PORACODE_CHANNEL__: JSON.stringify(poracodeChannel),
    "import.meta.env.VITE_PORACODE_BUILD_TARGET": JSON.stringify(mobileOnly ? "mobile" : "desktop"),
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      "~file-icons": MATERIAL_ICON_DIR,
    },
  },
  optimizeDeps: mobileOnly
    ? { entries: ["mobile.html"] }
    : {
        // The full desktop graph includes intentionally deferred feature
        // chunks. Re-crawling it on every Vite restart blocks the request queue
        // even when the optimized dependency cache is already valid.
        noDiscovery: true,
        include: [...DESKTOP_OPTIMIZED_DEPS],
      },
  build: {
    outDir: mobileOnly ? mobileOutputPath : "dist/renderer",
    emptyOutDir: true,
    sourcemap: mobileOnly ? false : "hidden",
    // Filter modulePreload so the heaviest async chunks (shiki grammars,
    // @git-diff-view, xterm) are not parsed by V8 at startup. They load on
    // demand when the code path that needs them runs (first code block,
    // first git overlay open, first terminal).
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter((dep) => !/(?:^|\/)(shiki-|git-diff-|xterm-|vendor-)/.test(dep)),
    },
    rolldownOptions: {
      input: mobileOnly
        ? { mobile: resolve(__dirname, "mobile.html") }
        : {
            index: resolve(__dirname, "index.html"),
            mobile: resolve(__dirname, "mobile.html"),
          },
      output: {
        minify: {
          compress: {
            dropConsole: true,
            dropDebugger: true,
          },
        },
        codeSplitting: {
          groups: [
            {
              name: "xterm",
              test: /[\\/]node_modules[\\/]@xterm[\\/]/,
              priority: 50,
            },
            {
              name: "git-diff",
              test: /[\\/]node_modules[\\/]@git-diff-view[\\/]/,
              priority: 45,
            },
            {
              name: "monaco",
              test: /[\\/]node_modules[\\/](@monaco-editor|monaco-editor)[\\/]/,
              priority: 40,
            },
            {
              // Shiki engine + bundle-full glue, BUT not its grammars/themes.
              // shiki/bundle-full uses per-language dynamic imports
              // (`() => import("@shikijs/langs/typescript")`); leaving
              // langs/themes out of any group lets rolldown emit them as
              // separate per-language chunks, so V8 only parses the grammars
              // actually rendered.
              name: "shiki",
              test: /[\\/]node_modules[\\/](shiki[\\/]|@shikijs[\\/](?:core|engine-|types|vscode-))/,
              priority: 38,
            },
            {
              name: "ui",
              test: /[\\/]node_modules[\\/](@heroui|react-aria|@react-stately|@react-types|tailwind-merge|tailwind-variants)[\\/]/,
              priority: 35,
            },
            {
              name: "framework",
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler|zustand|zod)[\\/]/,
              priority: 30,
            },
            {
              // Catch-all for everything not handled above. Excludes
              // @shikijs/langs and @shikijs/themes so each grammar/theme
              // becomes its own auto-chunk (one per file actually used).
              name: "vendor",
              test: (id: string) =>
                /[\\/]node_modules[\\/]/.test(id) &&
                !/[\\/]@shikijs[\\/](?:langs|themes)[\\/]/.test(id),
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    forwardConsole: true,
    watch: {
      ignored: [
        MANAGED_WORKTREES_GLOB,
        "**/ios/App/App/public/**",
        "**/ios/DerivedData/**",
        "**/ios/capacitor-cordova-ios-plugins/**",
        "**/android/app/src/main/assets/public/**",
      ],
    },
    // Bind all interfaces so phones on the LAN can load the mobile PWA
    // (mobile.html) straight from the dev server with HMR; the remote access
    // server redirects /app and /pair here in dev.
    host: "0.0.0.0",
    port: 3100,
    strictPort: true,
  },
}));
