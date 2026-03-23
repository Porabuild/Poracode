import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    main: "src/main/main.ts",
    preload: "src/main/preload.ts",
    supervisor: "src/supervisor/index.ts",
  },
  outDir: "dist/main",
  platform: "node",
  format: "cjs",
  target: "node24",
  sourcemap: true,
  clean: true,
  dts: false,
  deps: {
    neverBundle: ["electron", "node-pty"],
  },
});
