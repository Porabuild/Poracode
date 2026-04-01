import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
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
        test: {
          name: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/renderer/**/*.test.{ts,tsx}"],
          environment: "node",
        },
      },
    ],
  },
});
