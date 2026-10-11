import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import { lingui } from "@lingui/vite-plugin";
import { runtimePayloadProjectionVitePlugin } from "../../src/build/runtimePayloadProjectionVitePlugin.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root: import.meta.dirname,
  // Foundation suites import both host projection registries and renderer
  // taxonomy helpers. Keep their build-only imports on the real transforms.
  plugins: [
    runtimePayloadProjectionVitePlugin(repoRoot),
    babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }),
    lingui(),
  ],
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
