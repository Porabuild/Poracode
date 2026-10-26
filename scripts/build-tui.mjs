/**
 * `bun run tui:build` — compile the production TUI entry (`tui/src/main.ts`)
 * into one self-contained executable per target with the matching OpenTUI
 * native library embedded, and write `dist/tui/manifest.json`, the trust root
 * the CLI downloads against.
 *
 * Usage:
 *   bun scripts/build-tui.mjs [--targets win32-x64,linux-x64] [--require]
 *   bun scripts/build-tui.mjs --manifest-only [--manifest-out <path>]
 *
 * Each target's compile pins its own `@opentui/core-<target>` package via a
 * resolver redirect, so every binary embeds exactly the native library for
 * that platform (never a sibling variant, never all of them). Cross-compiling
 * therefore needs every requested platform package installed — install all
 * OpenTUI variants with bunfig `[install] supportedArchitectures`.
 *
 * Linux targets ship the glibc build (`bun-linux-*` and `@opentui/core-linux-*`
 * glibc variants). musl hosts cannot run a glibc-compiled bun runtime anyway,
 * so musl is deliberately out of scope; those users fall back to the npx
 * launcher path.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tuiRoot = join(repoRoot, "tui");
const distDir = join(repoRoot, "dist", "tui");

const TARGETS = {
  "win32-x64": { bun: "bun-windows-x64", native: "@opentui/core-win32-x64" },
  "win32-arm64": { bun: "bun-windows-arm64", native: "@opentui/core-win32-arm64" },
  "darwin-x64": { bun: "bun-darwin-x64", native: "@opentui/core-darwin-x64" },
  "darwin-arm64": { bun: "bun-darwin-arm64", native: "@opentui/core-darwin-arm64" },
  "linux-x64": { bun: "bun-linux-x64", native: "@opentui/core-linux-x64" },
  "linux-arm64": { bun: "bun-linux-arm64", native: "@opentui/core-linux-arm64" },
};

const args = process.argv.slice(2);
const flagValue = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const manifestOnly = args.includes("--manifest-only");
const requireAll = args.includes("--require");
const manifestOut = flagValue("--manifest-out");
const requested = flagValue("--targets")
  ?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const targets = requested ?? Object.keys(TARGETS);
for (const target of targets)
  if (!TARGETS[target])
    throw new Error(`Unknown TUI target "${target}". Valid: ${Object.keys(TARGETS).join(", ")}`);

const assetName = (target) => `poracode-tui-${target}${target.startsWith("win32") ? ".exe" : ""}`;
const sha256File = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const appVersion = packageJson.version;
const repository = packageJson.repository?.url ?? "https://github.com/Porabuild/Poracode";
const downloadBaseUrl = `${repository.replace(/\.git$/, "")}/releases/download`;

async function buildTarget(target) {
  const spec = TARGETS[target];
  const nativeEntry = join(tuiRoot, "node_modules", spec.native, "index.bun.js");
  if (!existsSync(nativeEntry))
    throw new Error(
      `Missing ${spec.native} in tui/node_modules. Install the platform package ` +
        `(bunfig [install] supportedArchitectures) before building ${target}.`,
    );
  const outfile = join(distDir, target, assetName(target));
  mkdirSync(dirname(outfile), { recursive: true });

  const { createSolidTransformPlugin } = await import(
    pathToFileURL(tuiRequire.resolve("@opentui/solid/bun-plugin")).href
  );
  const pluginRuntimePlugin = await makePluginRuntimePlugin();

  const nativeRedirect = {
    name: "poracode-native-target",
    setup(build) {
      // Pin every OpenTUI platform import to this target's package so the
      // compiled binary embeds exactly one matching native library.
      build.onResolve({ filter: /^@opentui\/core-(win32|darwin|linux)-/ }, () => ({
        path: nativeEntry,
      }));
    },
  };

  const result = await Bun.build({
    entrypoints: [join(tuiRoot, "src", "main.ts")],
    tsconfig: join(tuiRoot, "tsconfig.json"),
    target: "bun",
    plugins: [createSolidTransformPlugin(), pluginRuntimePlugin, nativeRedirect],
    external: ["@opencode/simulation/frontend"],
    compile: { target: spec.bun, outfile },
  });
  if (!result.success) throw new Error(result.logs.map((log) => log.message).join("\n"));
  if (!existsSync(outfile)) throw new Error(`TUI build produced no output at ${outfile}`);
  const size = statSync(outfile).size;
  console.log(`[tui:build] ${target}: ${outfile} (${(size / 1024 / 1024).toFixed(1)} MiB)`);
  return { name: assetName(target), size, sha256: sha256File(outfile) };
}

const tuiRequire = createRequire(join(tuiRoot, "package.json"));

async function makePluginRuntimePlugin() {
  const { discoverPluginRuntimeSpecifiers, pluginRuntimeLoaderCode } = await import(
    pathToFileURL(tuiRequire.resolve("@opencode/plugin/runtime-modules")).href
  );
  const entries = discoverPluginRuntimeSpecifiers();
  const source = [
    "export const resolveHostPackageRoots = () => []",
    "const modules = {",
    ...[...entries.keys()].map(
      (specifier) =>
        `  ${JSON.stringify(specifier)}: ${pluginRuntimeLoaderCode(specifier, entries)},`,
    ),
    "}",
    "export const loadRuntimeModules = () => modules",
  ].join("\n");
  return {
    name: "poracode-plugin-runtime",
    setup(build) {
      build.onLoad({ filter: /plugin[/\\]src[/\\]runtime-modules\.ts$/ }, () => ({
        contents: source,
        loader: "ts",
      }));
    },
  };
}

const assets = {};
if (!manifestOnly) {
  for (const target of targets) {
    try {
      assets[target] = await buildTarget(target);
    } catch (error) {
      if (requireAll) throw error;
      const detail =
        error instanceof Error && "logs" in error && Array.isArray(error.logs)
          ? `\n${error.logs.map((log) => `  ${log.message}`).join("\n")}`
          : "";
      console.warn(`[tui:build] skipping ${target}: ${error.message}${detail}`);
    }
  }
} else {
  for (const target of targets) {
    const file = join(distDir, target, assetName(target));
    if (!existsSync(file)) continue;
    assets[target] = {
      name: assetName(target),
      size: statSync(file).size,
      sha256: sha256File(file),
    };
  }
}

const manifest = {
  formatVersion: 1,
  appVersion,
  downloadBaseUrl,
  assets,
};
const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, "manifest.json"), manifestJson);
if (manifestOut) {
  mkdirSync(dirname(manifestOut), { recursive: true });
  writeFileSync(manifestOut, manifestJson);
}
console.log(
  `[tui:build] manifest: ${Object.keys(assets).length} asset(s) -> ${distDir}/manifest.json`,
);
