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
