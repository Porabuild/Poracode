import { defineConfig } from "tsdown";

const shared = {
  outDir: "dist/main",
  platform: "node" as const,
  format: "cjs" as const,
  target: "node24" as const,
  sourcemap: true,
  dts: false,
  deps: {
    alwaysBundle: ["electron-updater", "simple-git"],
    onlyBundle: false as const,
    neverBundle: ["electron", "node-pty", "better-sqlite3"],
  },
};

export default defineConfig([
  {
    entry: { main: "src/main/main.ts" },
    clean: true,
    ...shared,
  },
  {
    entry: { preload: "src/main/preload.ts" },
    clean: false,
    ...shared,
  },
  {
    entry: { supervisor: "src/supervisor/index.ts" },
    clean: false,
    ...shared,
  },
]);
