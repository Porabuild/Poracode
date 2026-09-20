import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) },
  },
  test: {
    name: "native-e2e",
    cache: false,
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: true,
  },
});
