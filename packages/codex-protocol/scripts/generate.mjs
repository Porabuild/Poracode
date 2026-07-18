import { existsSync, rmSync } from "node:fs";
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
const pnpmCli = process.env.npm_execpath;

if (!codexBinDirectory || !pnpmCli) {
  console.error(
    "Cannot generate Codex protocol types: the pinned @openai/codex binary or pnpm CLI is missing. Run `pnpm install` from the repository root, then try again.",
  );
  process.exit(1);
}

rmSync(resolve(packageDir, "generated"), { recursive: true, force: true });

const result = spawnSync(
  process.execPath,
  [pnpmCli, "exec", "codex", "app-server", "generate-ts", "--experimental", "--out", "./generated"],
  {
    cwd: packageDir,
    env: {
      ...process.env,
      PATH: `${codexBinDirectory}${delimiter}${process.env.PATH ?? ""}`,
    },
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(`Cannot generate Codex protocol types: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`Codex protocol generation failed with exit code ${result.status ?? "unknown"}.`);
  process.exit(result.status ?? 1);
}
