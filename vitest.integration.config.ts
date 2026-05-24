import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Standalone config for live-CLI integration tests under `tests/integration/`.
// Kept out of the default `vitest run` glob so `pnpm test` stays fast and
// hermetic. Invoke explicitly via `pnpm test:integration:providers`.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    name: "integration",
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Each provider spins up a real CLI process, waits for session
    // discovery, then resumes. Five minutes per test gives slower providers
    // (Antigravity, OpenCode) headroom on a cold machine.
    testTimeout: 300_000,
    hookTimeout: 60_000,
    // Run sequentially — concurrent real CLIs would compete for terminal
    // resources, auth tokens, and (most importantly) provider rate limits.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
