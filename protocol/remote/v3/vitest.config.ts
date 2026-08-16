import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Focused protocol conformance runner (local / single-file workflows).
 * CI and root `pnpm run test` collect the same suite via the node project in
 * vitest.config.ts (protocol glob) so sharded runs stay valid.
 */
export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../../src", import.meta.url)) },
  },
  test: {
    cache: false,
    environment: "node",
    // Future-proof: any *.test.ts under this contract package.
    include: ["**/*.test.ts"],
  },
});
