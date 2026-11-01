import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Worker } from "node:worker_threads";
import { defineConfig, loadEnv, type Plugin, type Rollup } from "vite";
import react from "@vitejs/plugin-react";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

const linguiPreset = linguiTransformerBabelPreset();
const CLIENT_SOURCE_RE = /[\\/]src[\\/]renderer[\\/].*\.[tj]sx?(?:$|\?)/;
const REACT_PLUGIN_EXCLUDE_RE = [/[\\/]node_modules[\\/]/, /[?&]worker(?:_file)?(?:&|$)/];
// Lingui macro worker threads. Dev keeps two: more slowed the Electron runtime
// build and main-process boot that start alongside the dev server. Four measured
// fastest for a production build (13.4 s -> 9.1 s; six was slower).
const DEV_LINGUI_WORKERS = Math.max(1, Math.min(2, availableParallelism() - 1));
const BUILD_LINGUI_WORKERS = Math.max(1, Math.min(4, availableParallelism() - 1));
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const MATERIAL_ICON_DIR = resolve(import.meta.dirname, "node_modules/material-icon-theme/icons");
const MATERIAL_ICON_ASSET_PREFIX = "/assets/material-icons/";
// Vite's chokidar watcher opens one native fs.watch per file and directory, and
// its initial scan runs on the dev server's main thread while the first page
// loads. Watching the whole checkout (agent worktrees, Android/iOS build output,
// dist, docs, tooling caches) took tens of seconds on Windows. Watch only the
// top-level directories the client graph imports from, plus root files such as
// index.html, configs and .env files, and skip tests, which no client imports.
// Paths outside the root (linked packages) are still added on demand by Vite.
const CLIENT_WATCH_ROOTS = new Set(["src", "packages", "build", "resources", "public"]);
const TEST_FILE_RE = /\.test\.[cm]?[jt]sx?$/;

function isUnwatchedClientPath(path: string): boolean {
  const relativePath = relative(import.meta.dirname, path);
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  )
    return false;
  const [topLevel, ...rest] = relativePath.split(sep);
  return rest.length > 0 && (!CLIENT_WATCH_ROOTS.has(topLevel!) || TEST_FILE_RE.test(relativePath));
}
const CLIENT_OPTIMIZED_DEPS = [
  "@chenglou/pretext",
  "@dnd-kit/dom",
  "@dnd-kit/react",
  "@dnd-kit/react/sortable",
  "@git-diff-view/react",
  "@heroui/react",
  "@legendapp/list/react",
  "@lingui/core",
  "@lingui/core/macro",
  "@lingui/react",
  "@lingui/react/macro",
  "@monaco-editor/react",
  // Without this, `noDiscovery` leaves it unbundled in dev, so it imports its
  // own copy of React and every AnimatedNumber throws an invalid-hook-call.
  "@number-flow/react",
  "@sentry/electron/renderer",
  "@tanstack/react-virtual",
  "@tiptap/extensions",
  "@tiptap/react",
  "@tiptap/react/menus",
  "@tiptap/starter-kit",
  "@xterm/addon-clipboard",
  "@xterm/addon-fit",
  "@xterm/addon-image",
  "@xterm/addon-program-status",
  "@xterm/addon-search",
  "@xterm/addon-unicode11",
  "@xterm/addon-webgl",
  "@xterm/xterm",
  "cron-parser",
  "lucide-react",
  "qrcode",
  "react",
  "react-dom",
  "react-dom/client",
  // Deferred settings/devices import these roots directly. Optimizing only
  // I18nProvider leaves their nested CommonJS dependencies raw in dev.
  "react-aria",
  "react-aria-components",
  "react-aria-components/I18nProvider",
  "react/compiler-runtime",
  "react/jsx-dev-runtime",
  "react/jsx-runtime",
  "rehype-katex",
  "rehype-raw",
  "remark-gfm",
  "remark-math-extended",
  "remark-parse",
  "streamdown",
  "style-to-js",
  "use-sync-external-store",
  "use-sync-external-store/shim",
  // zustand/react/shallow (useShallow) imports this shim; the web entry
  // served by the default dev server crashes without it (noDiscovery skips it).
  "use-sync-external-store/shim/with-selector",
  "unified",
  "zod",
  "zustand",
  "zustand/middleware",
  "zustand/react/shallow",
  "zustand/shallow",
  // Web-host-only deps. The default dev server can also serve the browser app and
  // noDiscovery skips anything not listed. Keep in sync with the browser graph;
  // compare against a one-off discovery-enabled cache when dependencies change.
  "@chenglou/pretext",
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

// Keep in sync with scripts/dev-server-port.mjs: smoke runs and parallel
// worktrees override the dev-server port so isolated apps can run side by side.
const devServerPort = Number.parseInt(process.env.PORACODE_DEV_SERVER_PORT ?? "", 10) || 3100;

// The hosted/native-web build emits the same canonical index entry as Electron
// into dist/web. There is no second application graph.
const extensionOnly = process.env.PORACODE_BUILD_TARGET === "extension";
const webOnly = extensionOnly || process.env.PORACODE_BUILD_TARGET === "web";
const vercelAnalyticsEnabled =
  webOnly && ["preview", "production"].includes(process.env.VERCEL_ENV ?? "");
const webBasePath = process.env.PORACODE_WEB_BASE_PATH?.trim() || "./";
const webOutputPath =
  webBasePath === "./" ? "dist/web" : `dist/web/${webBasePath.replace(/^\/+|\/+$/g, "")}`;
const rendererSourcemap =
  !webOnly &&
  process.env.PORACODE_SOURCEMAPS !== "0" &&
  (Boolean(process.env.CI) || process.env.PORACODE_SOURCEMAPS === "1")
    ? ("hidden" as const)
    : false;

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

// The Lingui macro Babel transform @rolldown/plugin-babel would apply with the
// preset, run in worker threads. Babel is single-threaded: on the main thread it
// was about a third of the dev server's warmup (which also answers the window's
// module requests) and half of a production renderer build. Output is identical.
function linguiMacroWorkers(size: number): Plugin {
  type Reply = {
    id: number;
    code: string | null;
    map: Rollup.SourceMapInput;
    error?: BabelWorkerError;
  };
  type BabelWorkerError = { message: string; loc?: unknown; pos?: number; code?: string };
  type Pending = { resolve: (reply: Reply) => void; reject: (error: Error) => void };
  // The preset's own filter: only files that import a Lingui macro.
  const macroImport = linguiPreset.rolldown.filter?.code;
  const workerUrl = resolve(import.meta.dirname, "scripts/vite-lingui-macro-worker.mjs");
  const workers: { worker: Worker; pending: Map<number, Pending> }[] = [];
  let nextId = 0;
  let closed = false;

  const spawn = (index: number) => {
    const pending = new Map<number, Pending>();
    const worker = new Worker(workerUrl);
    worker.unref();
    worker.on("message", (reply: Reply) => {
      pending.get(reply.id)?.resolve(reply);
      pending.delete(reply.id);
    });
    let failure: Error | undefined;
    worker.on("error", (error: Error) => {
      failure = error;
    });
    worker.on("exit", () => {
      const error = failure ?? new Error("Lingui macro worker exited.");
      for (const task of pending.values()) task.reject(error);
      if (!closed) spawn(index);
    });
    workers[index] = { worker, pending };
  };
  const run = (code: string, filename: string) => {
    if (workers.length === 0) for (let index = 0; index < size; index++) spawn(index);
    const slot = workers.reduce((least, next) =>
      next.pending.size < least.pending.size ? next : least,
    );
    const id = nextId++;
    return new Promise<Reply>((resolveReply, reject) => {
      slot.pending.set(id, { resolve: resolveReply, reject });
      slot.worker.postMessage({ id, code, filename });
    });
  };

  return {
    name: "poracode:lingui-macro-workers",
    enforce: "pre",
    transform: {
      filter: { id: CLIENT_SOURCE_RE, ...(macroImport ? { code: macroImport } : {}) },
      async handler(code, id) {
        const reply = await run(code, id);
        if (reply.error) {
          this.error({
            message: `[BabelError] ${reply.error.message}`,
            ...(reply.error.pos === undefined ? {} : { pos: reply.error.pos }),
            ...(reply.error.code ? { pluginCode: reply.error.code } : {}),
          });
        }
        return reply.code === null ? null : { code: reply.code, map: reply.map };
      },
    },
    closeBundle() {
      closed = true;
      for (const { worker } of workers.splice(0)) void worker.terminate();
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

function webDevIndex(): Plugin {
  return {
    name: "poracode:web-dev-index",
    apply: "serve",
    configureServer(server) {
      if (!webOnly) return;

      server.middlewares.use((req, _res, next) => {
        const [pathname, query] = (req.url ?? "").split("?", 2);
        const acceptsHtml = req.headers.accept?.includes("text/html") ?? false;
        const isClientRoute =
          pathname === "/" ||
          pathname === "/index.html" ||
          (acceptsHtml &&
            pathname !== "/index.html" &&
            !pathname?.split("/").at(-1)?.includes("."));
        if (isClientRoute) {
          req.url = `/index.html${query ? `?${query}` : ""}`;
        }
        next();
      });
    },
  };
}

function webSshRuntime(): Plugin {
  return {
    name: "poracode:web-ssh-runtime",
    apply: "serve",
    configureServer(server) {
      if (!webOnly) return;
      const root = resolve(process.cwd(), "resources/web-ssh-runtime");
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

export default defineConfig(({ command, mode }) => ({
  plugins: [
    tailwindcss(),
    resizeObserverLoopErrorFilter(),
    webSshRuntime(),
    rendererBootstrapTiming(),
    webDevIndex(),
    reactDevtoolsStandalone(),
    // Lingui must expand macros before React Compiler analyzes the component.
    // The macro plugin is forced into the pre phase so it runs before the
    // native Oxc React Compiler transform inside react().
    // We use the Babel macro (not the SWC plugin) because this project transforms
    // with Babel, sidestepping the SWC-plugin/runtime version-matching pitfalls.
    linguiMacroWorkers(command === "serve" ? DEV_LINGUI_WORKERS : BUILD_LINGUI_WORKERS),
    react({
      compiler: true,
      include: CLIENT_SOURCE_RE,
      exclude: REACT_PLUGIN_EXCLUDE_RE,
    }),
    // Compiles `.po` catalog imports into runtime message modules on the fly,
    // so we never need a separate `lingui compile` step for the app build.
    lingui(),
    ...materialIconAssets(),
  ],
  base: webOnly ? webBasePath : "./",
  define: {
    ...buildPostHogEnvDefines(mode),
    __PORACODE_CHANNEL__: JSON.stringify(poracodeChannel),
    "import.meta.env.VITE_PORACODE_BUILD_TARGET": JSON.stringify(
      extensionOnly ? "extension" : webOnly ? "web" : "desktop",
    ),
    "import.meta.env.VITE_VERCEL_ANALYTICS_ENABLED": JSON.stringify(vercelAnalyticsEnabled),
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      "~file-icons": MATERIAL_ICON_DIR,
    },
  },
  // The default dev server and the hosted/native-web target run side by side
  // in the dev:ios/dev:android flows and during
  // local PWA verification. With one shared cacheDir their dep-optimizer states
  // invalidate each other on every start, producing "504 Outdated Optimize Dep"
  // for whichever server optimized first. Give each target its own cache.
  cacheDir: webOnly ? "node_modules/.vite-web" : "node_modules/.vite",
  css: {
    // Tailwind's first-party Vite plugin handles app CSS. Keep the root
    // PostCSS config available to the standalone Next.js website without
    // running Tailwind twice in Vite.
    postcss: { plugins: [] },
  },
  optimizeDeps: {
    // Both clients include intentionally deferred feature chunks. Re-crawling
    // either graph on every Vite restart blocks the request queue even when
    // the optimized dependency cache is already valid.
    noDiscovery: true,
    include: [...CLIENT_OPTIMIZED_DEPS],
  },
  build: {
    outDir: extensionOnly ? "dist/extension-client" : webOnly ? webOutputPath : "dist/renderer",
    emptyOutDir: true,
    reportCompressedSize: false,
    // Source maps dominate local build memory. The Sentry job keeps them;
    // other release jobs opt out with PORACODE_SOURCEMAPS=0.
    sourcemap: rendererSourcemap,
    // Filter modulePreload so the heaviest async chunks (shiki grammars,
    // @git-diff-view, xterm) are not parsed by V8 at startup. They load on
    // demand when the code path that needs them runs (first code block,
    // first git overlay open, first terminal).
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter((dep) => !/(?:^|\/)(shiki-|git-diff-|xterm-|vendor-)/.test(dep)),
    },
    rolldownOptions: {
      input: { index: resolve(import.meta.dirname, "index.html") },
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
              // Keep the shared preload helper out of recursively grouped
              // features so importing it does not load those features too.
              name: "preload-helper",
              test: /vite[\\/]preload-helper/,
              priority: 110,
            },
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
              // Keep shared dependencies in their own chunks so the lazy
              // local editor runtime cannot become a chat startup dependency.
              includeDependenciesRecursively: false,
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
              test: /[\\/]node_modules[\\/](shiki[\\/]|@shikijs[\\/](?:core|engine-|primitive|types|vscode-))/,
              // Markdown also uses Shiki's HTML utilities. Keep those shared
              // dependencies outside the highlighter chunk.
              includeDependenciesRecursively: false,
              priority: 38,
            },
            {
              name: "ui",
              test: /[\\/]node_modules[\\/](@heroui|react-aria|@react-stately|@react-types|tailwind-merge|tailwind-variants)[\\/]/,
              priority: 35,
            },
            {
              name: "framework",
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler|use-sync-external-store|zustand|zod)[\\/]/,
              priority: 100,
            },
            {
              name: "notes-editor",
              test: /[\\/]node_modules[\\/](@tiptap[\\/]|prosemirror-|orderedmap[\\/]|rope-sequence[\\/]|w3c-keyname[\\/])/,
              priority: 25,
            },
            {
              name: "mobile-vendor",
              test: /[\\/]node_modules[\\/]jsqr[\\/]/,
              priority: 20,
            },
            {
              // Catch-all for everything not handled above. Excludes
              // @shikijs/langs and @shikijs/themes so each grammar/theme
              // becomes its own auto-chunk (one per file actually used), and
              // jsqr so the QR decoder's fallback engine stays lazy — only
              // browsers without `BarcodeDetector` (iOS Safari) ever fetch it,
              // and only once they open the pairing scanner.
              name: "vendor",
              test: (id: string) =>
                /[\\/]node_modules[\\/]/.test(id) &&
                !/[\\/]@shikijs[\\/](?:langs|themes)[\\/]/.test(id) &&
                !/[\\/]node_modules[\\/]jsqr[\\/]/.test(id),
              priority: 10,
            },
          ].filter((group) => !webOnly || group.name === "ui" || group.name === "framework"),
        },
      },
    },
  },
  server: {
    forwardConsole: true,
    watch: {
      ignored: [isUnwatchedClientPath],
    },
    // Transform the startup graph as soon as the server listens, so it is ready
    // when the Electron window (which waits for the runtime build) or a browser
    // first loads. main.tsx and its startup modules are dynamic imports, which
    // warmup does not follow from bootstrap.ts.
    warmup: {
      clientFiles: [
        "./src/renderer/bootstrap.ts",
        "./src/renderer/main.tsx",
        "./src/renderer/app.tsx",
        "./src/renderer/components/providers/bootstrap.ts",
      ],
    },
    // Bind all interfaces so phones on the LAN can load the canonical app
    // straight from the dev server with HMR.
    host: "0.0.0.0",
    port: devServerPort,
    strictPort: true,
  },
}));
