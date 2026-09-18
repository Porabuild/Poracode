import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import babel from "@rolldown/plugin-babel";
import { lingui } from "@lingui/vite-plugin";

// Standalone config for the opt-in performance suites (`*.perf.test.ts`).
// Perf tests assert absolute latency budgets, so they must never run inside
// the sharded unit suite: sibling shard workers contend for the same cores
// and flip the budgets (the 2026-09-16 cliHookEventChain flake). The main
// vitest.config.ts excludes `**/*.perf.test.ts`; this config collects them
// and is invoked explicitly via the `test:perf:*` scripts, which CI runs as
// a dedicated uncontended job.
export default defineConfig({
  test: {
    globals: true,
    clearMocks: true,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    exclude: ["dist", "node_modules"],
    projects: [
      {
        extends: true,
        // Same Lingui macro expansion as the renderer project in
        // vitest.config.ts — renderer perf tests import macro-using modules.
        plugins: [babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }), lingui()],
        resolve: {
          alias: {
            "@": resolve(import.meta.dirname, "src"),
            "~file-icons": resolve(import.meta.dirname, "node_modules/material-icon-theme/icons"),
          },
        },
        test: {
          name: "perf-renderer",
          include: ["src/renderer/**/*.perf.test.{ts,tsx}"],
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
          name: "perf-node",
          include: ["src/**/*.perf.test.{ts,tsx}", "protocol/**/*.perf.test.ts"],
          exclude: ["src/renderer/**/*.perf.test.{ts,tsx}"],
          environment: "node",
        },
      },
    ],
  },
});
