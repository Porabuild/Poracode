import { resolve } from "node:path";
import { defineConfig, type TestProjectInlineConfiguration } from "vitest/config";
import babel from "@rolldown/plugin-babel";
import { lingui } from "@lingui/vite-plugin";
import { runtimePayloadProjectionVitePlugin } from "./src/build/runtimePayloadProjectionVitePlugin.ts";

// Core CI shards exclude compiler fixtures in the project that collects them.
// Vitest 5 does not forward CLI --exclude to inline projects. Ordinary test
// runs and the dedicated native-contract lane retain the complete suite.
const coreShardExcludes =
  process.env.PORACODE_TEST_LANE === "core"
    ? ["src/shared/remote/contract/native/runtime.test.ts"]
    : [];

const monacoTestFiles = [
  "src/renderer/views/FileEditorOverlay/parts/FileEditorPane/parts/localMonacoEditor.test.ts",
  "src/renderer/views/FileEditorOverlay/parts/FileEditorPane/parts/monacoCompletionLifecycle.test.ts",
];

function rendererProject(
  test: TestProjectInlineConfiguration["test"],
): TestProjectInlineConfiguration {
  return {
    extends: true,
    // Expand Lingui macros and resolve .po catalogs for renderer tests.
    // React Compiler remains a build-only optimization.
    plugins: [babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }), lingui()],
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "src"),
        "~file-icons": resolve(import.meta.dirname, "node_modules/material-icon-theme/icons"),
      },
    },
    test: { environment: "jsdom", setupFiles: ["./src/renderer/testSetup.ts"], ...test },
  };
}

export default defineConfig({
  plugins: [runtimePayloadProjectionVitePlugin(import.meta.dirname)],
  test: {
    globals: true,
    // Vitest 5 defaults clearMocks to true; the repo accepts the new default
    // (mock history is cleared before each test, implementations are kept).
    clearMocks: true,
    // Leave capacity for compiler subprocesses and large JSDOM module graphs.
    maxWorkers: "50%",
    // Default 5s is too tight for tests that vi.resetModules() + dynamic-import
    // under heavy parallel load. Raise to 15s so import jitter doesn't flake
    // the suite; per-test timeouts can still override.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
    // Perf suites assert absolute latency budgets, so they never run inside
    // the sharded unit suite — sibling shard workers contend for the same
    // cores and flip the budgets. They are collected by vitest.perf.config.ts
    // and run via the `test:perf:*` scripts / the dedicated CI perf job.
    exclude: ["dist", "node_modules", "tui/**", "**/*.perf.test.ts"],
    projects: [
      rendererProject({
        name: "renderer",
        include: ["src/renderer/**/*.test.{ts,tsx}"],
        exclude: ["**/*.perf.test.ts", ...monacoTestFiles],
      }),
      rendererProject({
        name: "renderer-monaco",
        include: monacoTestFiles,
        // Keep prebundling isolated from renderer tests that mock dependency identities.
        deps: {
          optimizer: {
            client: {
              enabled: true,
              include: [
                "monaco-editor",
                "monaco-editor/languages/features/common/lspLanguageFeatures.js",
              ],
              extensions: [".css"],
              rolldownOptions: { moduleTypes: { ".css": "empty" } },
            },
          },
        },
      }),
      {
        extends: true,
        resolve: {
          alias: {
            "@": resolve(import.meta.dirname, "src"),
          },
        },
        test: {
          name: "node",
          // Protocol conformance lives under protocol/ but needs the same node
          // environment and `@` alias as src. Folded into this project so
          // `pnpm run test --shard=N/4` never shards a one-file project.
          include: ["src/**/*.test.{ts,tsx}", "protocol/**/*.test.ts"],
          // Project-level exclude replaces the inherited root exclude, so the
          // perf-suite pattern is restated here.
          exclude: ["src/renderer/**/*.test.{ts,tsx}", "**/*.perf.test.ts", ...coreShardExcludes],
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
