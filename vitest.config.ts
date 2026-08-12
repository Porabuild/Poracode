import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import babel from "@rolldown/plugin-babel";
import { lingui } from "@lingui/vite-plugin";

export default defineConfig({
  test: {
    globals: true,
    // Default 5s is too tight for tests that vi.resetModules() + dynamic-import
    // under heavy parallel load. Raise to 15s so import jitter doesn't flake
    // the suite; per-test timeouts can still override.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
    exclude: ["dist", "node_modules"],
    projects: [
      {
        extends: true,
        // Expand Lingui macros (Trans/t/msg/useLingui) and resolve `.po` catalog
        // imports in the renderer test bundle — the macros throw at runtime if
        // left untransformed. (No React Compiler here; it is a build-only
        // optimization and unnecessary for tests.)
        plugins: [babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }), lingui()],
        resolve: {
          alias: {
            "@": resolve(import.meta.dirname, "src"),
            "~file-icons": resolve(import.meta.dirname, "node_modules/material-icon-theme/icons"),
          },
        },
        test: {
          name: "renderer",
          include: ["src/renderer/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["./src/renderer/testSetup.ts"],
        },
      },
      {
        extends: true,
        resolve: {
          alias: {
            "@": resolve(import.meta.dirname, "src"),
          },
        },
        test: {
          name: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/renderer/**/*.test.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "packages",
          include: ["packages/*/src/**/*.test.{ts,tsx}"],
          environment: "node",
        },
      },
    ],
  },
});
