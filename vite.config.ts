import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { lingui } from "@lingui/vite-plugin";

const compilerPreset = reactCompilerPreset();
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

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
const lightcodeChannel = process.env.LIGHTCODE_CHANNEL === "nightly" ? "nightly" : "stable";

// Mobile-only build target (LIGHTCODE_BUILD_TARGET=mobile) produces a
// self-contained PWA bundle in dist/mobile for standalone hosting (Vercel),
// omitting the desktop renderer entry. The default build emits both entries to
// dist/renderer for the Electron app and its embedded remote-access server.
const mobileOnly = process.env.LIGHTCODE_BUILD_TARGET === "mobile";

// Dev-only: connect the renderer to the standalone React DevTools app for
// inspecting/profiling rerenders. The React DevTools *browser extension* uses
// `chrome.scripting` (Manifest V3), which Electron doesn't implement — under
// Electron the extension panels load but never find the React tree
// (facebook/react#25843). The supported alternative is the standalone
// `react-devtools` app (run via `pnpm devtools`), which serves a backend on
// :8097 that the page connects to. The hook must be installed *before* React
// loads, so we inject a classic <script> at the top of <head>; the deferred
// `main.tsx` module script runs after it. Opt-in via LIGHTCODE_REACT_DEVTOOLS=1
// (set by the `dev:devtools` script) so a normal `pnpm dev` stays noise-free
// when the standalone app isn't running.
function reactDevtoolsStandalone(): Plugin {
  return {
    name: "lightcode:react-devtools-standalone",
    apply: "serve",
    transformIndexHtml() {
      if (process.env.LIGHTCODE_REACT_DEVTOOLS !== "1") {
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
    name: "lightcode:resize-observer-loop-error-filter",
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

function mobileDevIndex(): Plugin {
  return {
    name: "lightcode:mobile-dev-index",
    apply: "serve",
    configureServer(server) {
      if (!mobileOnly) return;

      server.middlewares.use((req, _res, next) => {
        const [pathname, query] = (req.url ?? "").split("?", 2);
        if (pathname === "/" || pathname === "/index.html") {
          req.url = `/mobile.html${query ? `?${query}` : ""}`;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    resizeObserverLoopErrorFilter(),
    mobileDevIndex(),
    reactDevtoolsStandalone(),
    react(),
    // The Lingui macro must expand BEFORE the React Compiler. Babel applies
    // `plugins` ahead of `presets`, so listing the macro as a plugin (with the
    // compiler as a preset) guarantees that order within this single Babel pass.
    // We use the Babel macro (not the SWC plugin) because this project transforms
    // with Babel, sidestepping the SWC-plugin/runtime version-matching pitfalls.
    babel({ plugins: ["@lingui/babel-plugin-lingui-macro"], presets: [compilerPreset] }),
    // Compiles `.po` catalog imports into runtime message modules on the fly,
    // so we never need a separate `lingui compile` step for the app build.
    lingui(),
  ],
  base: "./",
  define: {
    ...buildPostHogEnvDefines(mode),
    __LIGHTCODE_CHANNEL__: JSON.stringify(lightcodeChannel),
    "import.meta.env.VITE_LIGHTCODE_BUILD_TARGET": JSON.stringify(
      mobileOnly ? "mobile" : "desktop",
    ),
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      "~file-icons": resolve(__dirname, "node_modules/material-icon-theme/icons"),
    },
  },
  build: {
    outDir: mobileOnly ? "dist/mobile" : "dist/renderer",
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
