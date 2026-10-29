import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BunPlugin } from "bun";
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin";
import {
  discoverPluginRuntimeSpecifiers,
  pluginRuntimeLoaderCode,
} from "@opencode/plugin/runtime-modules";

const poracode = process.argv[2] === "poracode";
const outfile = path.resolve(
  import.meta.dirname,
  `../../dist/${poracode ? "poracode.exe" : "poracode-tui.exe"}`,
);
await mkdir(path.dirname(outfile), { recursive: true });

const pluginRuntimeEntries = discoverPluginRuntimeSpecifiers();
const pluginRuntimeModulesSource = [
  "export const resolveHostPackageRoots = () => []",
  "const modules = {",
  ...[...pluginRuntimeEntries.keys()].map(
    (specifier) =>
      `  ${JSON.stringify(specifier)}: ${pluginRuntimeLoaderCode(specifier, pluginRuntimeEntries)},`,
  ),
  "}",
  "export const loadRuntimeModules = () => modules",
].join("\n");
const pluginRuntimePlugin: BunPlugin = {
  name: "poracode-plugin-runtime",
  setup(build) {
    build.onLoad({ filter: /plugin[/\\]src[/\\]runtime-modules\.ts$/ }, () => ({
      contents: pluginRuntimeModulesSource,
      loader: "ts",
    }));
  },
};

const result = await Bun.build({
  entrypoints: [
    poracode
      ? path.resolve(import.meta.dirname, "../main.ts")
      : path.resolve(import.meta.dirname, "opencode-server.ts"),
  ],
  tsconfig: path.resolve(import.meta.dirname, "../../tsconfig.json"),
  target: "bun",
  plugins: [createSolidTransformPlugin(), pluginRuntimePlugin],
  external: ["@opencode/simulation/frontend"],
  compile: {
    target: "bun-windows-x64",
    outfile,
  },
});

if (!result.success) throw new Error(result.logs.map((log) => log.message).join("\n"));

console.log(outfile);
