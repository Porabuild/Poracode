import path from "node:path";
import type { BunPlugin } from "bun";
import { createToolPresentationAdapterSource } from "../../../src/build/runtimePayloadProjectionSource.mjs";

const macroShim = path.join(import.meta.dir, "linguiMacro.ts");
const catalogShim = path.join(import.meta.dir, "i18n.ts");
const repositoryRoot = path.resolve(import.meta.dir, "../../..");

/**
 * The transcript renders through the desktop's own presentation modules
 * (`src/renderer/components/thread/ChatPane/parts/items`). Those modules build
 * labels with Lingui macros and the renderer catalog, which only a compiler or
 * the Vite pipeline can provide; this plugin points both at English shims for
 * the TUI runtime (via the preload) and its compiled builds.
 */
export const desktopPresentationPlugin: BunPlugin = {
  name: "poracode-desktop-presentation",
  setup(build) {
    // The same provider-owned pure display leaves serve PWA, host and TUI.
    build.onResolve({ filter: /^poracode:tool-presentation-adapters$/ }, () => ({
      path: "tool-presentation-adapters",
      namespace: "poracode",
    }));
    build.onLoad({ filter: /^tool-presentation-adapters$/, namespace: "poracode" }, () => ({
      contents: createToolPresentationAdapterSource(repositoryRoot).source,
      loader: "ts",
      resolveDir: repositoryRoot,
    }));
    build.onLoad({ filter: /[\\/]@lingui[\\/]core[\\/]macro[\\/][^\\/]+\.m?js$/ }, () => ({
      contents: `export * from ${JSON.stringify(macroShim)};`,
      loader: "js",
    }));
    build.onLoad({ filter: /[\\/]src[\\/]renderer[\\/]i18n[\\/]i18n\.ts$/ }, () => ({
      contents: `export * from ${JSON.stringify(catalogShim)};`,
      loader: "ts",
    }));
  },
};
