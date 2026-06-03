import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

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
        resolve: {
          alias: {
            "@": resolve(__dirname, "src"),
            "~file-icons": resolve(__dirname, "node_modules/material-icon-theme/icons"),
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
            "@": resolve(__dirname, "src"),
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
