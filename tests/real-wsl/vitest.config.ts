import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone config for the fail-closed real-WSL qualification suite. It is
// never collected by the root unit config; run it explicitly:
//
//   pnpm exec vitest run --configLoader runner --config tests/real-wsl/vitest.config.ts
//
// The suite skips entirely unless PORACODE_WSL_LAB=1; when the flag is set,
// a missing or invalid lab manifest fails instead of skipping (see
// helpers/lab.ts). Root is the repository so the suite can import both the
// production seams (src/) and the lab manifest parsers (scripts/).
export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) },
  },
  test: {
    name: "real-wsl",
    cache: false,
    environment: "node",
    include: ["tests/real-wsl/**/*.real.test.ts"],
    exclude: ["**/node_modules/**"],
    // Real WSL operations (distro imports aside, the suite drives cold boots,
    // sshd-free file I/O over UNC, and a pinned-Node install) are minutes, not
    // milliseconds. Per-test timeouts can still override.
    testTimeout: 300_000,
    hookTimeout: 600_000,
    // One WSL host, one VM: suite files must never contend for it.
    fileParallelism: false,
  },
});
