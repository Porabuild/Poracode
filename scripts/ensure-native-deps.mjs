import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

function runNodeScript(scriptPath, env = process.env) {
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: "inherit",
    env,
  });

  if (result.status !== 0) {
    throw new Error(`Failed to run native dependency script: ${scriptPath}`);
  }
}

function hasElectronBinary(electronDir, pathFile) {
  if (!existsSync(pathFile)) return false;
  const executablePath = readFileSync(pathFile, "utf8");
  return existsSync(join(electronDir, "dist", executablePath));
}

function ensureElectronBinary() {
  const electronPackageJsonPath = require.resolve("electron/package.json");
  const electronDir = dirname(electronPackageJsonPath);
  const pathFile = join(electronDir, "path.txt");

  if (hasElectronBinary(electronDir, pathFile)) {
    return;
  }

  console.log("[lightcode] Electron binary missing; running electron/install.js");
  const installEnv = { ...process.env };
  delete installEnv.ELECTRON_SKIP_BINARY_DOWNLOAD;
  runNodeScript(join(electronDir, "install.js"), installEnv);

  if (!hasElectronBinary(electronDir, pathFile)) {
    throw new Error("[lightcode] Electron binary is unavailable after running electron/install.js");
  }
}

function ensureNodePty() {
  try {
    require("node-pty");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[lightcode] node-pty is unavailable: ${message}. If pnpm blocked native build scripts, run 'pnpm approve-builds' and reinstall.`,
      { cause: error },
    );
  }
}

function ensureBetterSqlite3() {
  try {
    require("better-sqlite3");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[lightcode] better-sqlite3 is unavailable: ${message}. If pnpm blocked native build scripts, run 'pnpm approve-builds' and reinstall.`,
      { cause: error },
    );
  }
}

try {
  ensureElectronBinary();
  ensureNodePty();
  ensureBetterSqlite3();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
