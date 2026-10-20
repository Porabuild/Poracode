import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { npmInvocation } from "./server-host-tools.mjs";

const { devDependencies } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const version = devDependencies.bun;
const prefix = join(
  process.env.RUNNER_TEMP || tmpdir(),
  "poracode-bun",
  `${process.platform}-${process.arch}`,
  version,
);
const manifestPath = join(prefix, "node_modules", "bun", "package.json");
if (!existsSync(manifestPath)) {
  const invocation = npmInvocation([
    "install",
    "--prefix",
    prefix,
    "--no-save",
    "--no-package-lock",
    "--no-audit",
    "--no-fund",
    "--ignore-scripts",
    `bun@${version}`,
  ]);
  const install = spawnSync(invocation.command, invocation.args, {
    shell: invocation.shell,
    stdio: "inherit",
  });
  if (install.error) throw install.error;
  if (install.status !== 0) process.exit(install.status ?? 1);
}
// Execute the pinned optional binary directly; npm's script policy need not allow Bun's installer.
const platform =
  process.platform === "win32"
    ? "windows"
    : process.platform === "android"
      ? "linux"
      : process.platform;
const architecture = process.arch === "arm64" ? "aarch64" : process.arch;
const suffix =
  process.platform === "android"
    ? "-android"
    : process.platform === "linux" && !process.report.getReport().header.glibcVersionRuntime
      ? "-musl"
      : "";
const require = createRequire(manifestPath);
const platformManifest = require.resolve(
  `@oven/bun-${platform}-${architecture}${suffix}/package.json`,
);
const binaryDirectory = join(platformManifest, "..", "bin");
const executable = join(binaryDirectory, process.platform === "win32" ? "bun.exe" : "bun");
if (process.env.GITHUB_PATH) appendFileSync(process.env.GITHUB_PATH, `${binaryDirectory}\n`);
const args = process.argv.slice(2);
if (args[0] === "--run") args.shift();
else if (args.length > 0)
  throw new Error("Usage: node scripts/setup-bun.mjs [--run <Bun arguments>]");
const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
const result = spawnSync(executable, args.length ? args : ["--revision"], {
  stdio: "inherit",
  env: { ...process.env, [pathKey]: `${binaryDirectory}${delimiter}${process.env[pathKey] ?? ""}` },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
