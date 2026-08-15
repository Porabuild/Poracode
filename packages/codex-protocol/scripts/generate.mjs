import { existsSync, renameSync, rmSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDir = resolve(packageDir, "../..");
const executableName = process.platform === "win32" ? "codex.CMD" : "codex";
const binDirectories = [
  resolve(packageDir, "node_modules/.bin"),
  resolve(workspaceDir, "node_modules/.bin"),
];
const codexBinDirectory = binDirectories.find((directory) =>
  existsSync(resolve(directory, executableName)),
);

if (!codexBinDirectory) {
  console.error(
    "Cannot generate Codex protocol types: the pinned @openai/codex binary is missing. Run `pnpm install` from the repository root, then try again.",
  );
  process.exit(1);
}

// Generate into a staging directory and swap on success, so a failed run never
// leaves the package without its committed-quality `generated/` output.
const generatedDir = resolve(packageDir, "generated");
const stagingDir = resolve(packageDir, "generated.tmp");
rmSync(stagingDir, { recursive: true, force: true });

const generateArgs = ["app-server", "generate-ts", "--experimental", "--out", "./generated.tmp"];
// `npm_execpath` is pnpm's own CLI entry point. With a JS install it is a
// script that must run under node; the standalone distribution is a native
// executable that must be spawned directly. When it is unavailable (script run
// outside pnpm), invoke the codex bin resolved above.
const pnpmCli = process.env.npm_execpath;
const pnpmCliIsScript = pnpmCli !== undefined && /\.[cm]?js$/i.test(pnpmCli);
const [command, args] = pnpmCli
  ? pnpmCliIsScript
    ? [process.execPath, [pnpmCli, "exec", "codex", ...generateArgs]]
    : [pnpmCli, ["exec", "codex", ...generateArgs]]
  : [resolve(codexBinDirectory, executableName), generateArgs];

const result = spawnSync(command, args, {
  cwd: packageDir,
  env: {
    ...process.env,
    PATH: `${codexBinDirectory}${delimiter}${process.env.PATH ?? ""}`,
  },
  stdio: "inherit",
  // .CMD shims cannot be spawned directly on Windows.
  shell: process.platform === "win32" && command.endsWith(".CMD"),
});

if (result.error) {
  console.error(`Cannot generate Codex protocol types: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`Codex protocol generation failed with exit code ${result.status ?? "unknown"}.`);
  process.exit(result.status ?? 1);
}

rmSync(generatedDir, { recursive: true, force: true });
renameSync(stagingDir, generatedDir);
