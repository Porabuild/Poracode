import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  // Respect an explicit opt-out. Unit-test CI jobs run vitest in node/jsdom and
  // never launch the Electron runtime, so the Chromium binary download is dead
  // weight there and its flakiness shouldn't fail the build. App-running flows
  // (local dev, packaging) leave this unset and still get the enforced download.
  if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
    console.log("[poracode] ELECTRON_SKIP_BINARY_DOWNLOAD set; skipping Electron binary check");
    return;
  }

  const electronPackageJsonPath = require.resolve("electron/package.json");
  const electronDir = dirname(electronPackageJsonPath);
  const pathFile = join(electronDir, "path.txt");

  if (hasElectronBinary(electronDir, pathFile)) {
    return;
  }

  const installScript = join(electronDir, "install.js");
  const distDir = join(electronDir, "dist");
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(
      `[poracode] Electron binary missing; running electron/install.js (attempt ${attempt}/${maxAttempts})`,
    );
    // We only reach this loop when the executable is absent. A flaked or partial
    // extraction can still leave dist/version + path.txt behind, which makes
    // electron/install.js consider itself "already installed" and exit without
    // re-downloading. Clear those markers so each attempt re-extracts for real.
    rmSync(distDir, { recursive: true, force: true });
    rmSync(pathFile, { force: true });

    const installEnv = { ...process.env };
    delete installEnv.ELECTRON_SKIP_BINARY_DOWNLOAD;
    if (attempt > 1) {
      // electron/install.js honors force_no_cache=true to bypass @electron/get's
      // on-disk cache, which can silently resolve to a missing/partial artifact
      // when an earlier download flaked.
      installEnv.force_no_cache = "true";
    }
    runNodeScript(installScript, installEnv);

    if (hasElectronBinary(electronDir, pathFile)) {
      return;
    }
  }

  throw new Error(
    `[poracode] Electron binary is unavailable after ${maxAttempts} attempts of electron/install.js`,
  );
}

function ensureNodePty() {
  try {
    require("node-pty");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[poracode] node-pty is unavailable: ${message}. If pnpm blocked native build scripts, run 'pnpm approve-builds' and reinstall.`,
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
      `[poracode] better-sqlite3 is unavailable: ${message}. If pnpm blocked native build scripts, run 'pnpm approve-builds' and reinstall.`,
      { cause: error },
    );
  }
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function electronNativeFingerprint() {
  const electronVersion = require("electron/package.json").version;
  const betterSqlite3Version = require("better-sqlite3/package.json").version;
  const nodePtyVersion = require("node-pty/package.json").version;
  const bindingPath = join(
    dirname(require.resolve("better-sqlite3/package.json")),
    "build",
    "Release",
    "better_sqlite3.node",
  );
  return {
    electronVersion,
    betterSqlite3Version,
    nodePtyVersion,
    platform: process.platform,
    arch: process.arch,
    bindingHash: existsSync(bindingPath) ? hashFile(bindingPath) : null,
  };
}

function fingerprintsMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateElectronNativeDependencies() {
  const electronPath = require("electron");
  const validation = spawnSync(
    electronPath,
    [
      "-e",
      "const Database=require('better-sqlite3');const db=new Database(':memory:');db.close();require('node-pty');",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    },
  );
  return validation;
}

function rebuildElectronNativeDependencies() {
  const rebuildCli = join(dirname(require.resolve("@electron/rebuild")), "cli.js");
  const result = spawnSync(process.execPath, [rebuildCli, "--only", "better-sqlite3"], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("[poracode] electron-rebuild failed for better-sqlite3");
  }
}

function ensureElectronNativeDependencies() {
  const cacheDir = join(process.cwd(), "node_modules", ".cache", "poracode");
  const cachePath = join(cacheDir, "electron-native.json");
  const fingerprint = electronNativeFingerprint();
  let cachedFingerprint;
  try {
    cachedFingerprint = JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {
    // A missing or invalid cache is repaired by the runtime validation below.
  }

  if (fingerprintsMatch(cachedFingerprint, fingerprint)) {
    console.log("[poracode] Electron native dependencies already compatible, skipping rebuild");
    return;
  }

  let validation = validateElectronNativeDependencies();
  if (validation.status !== 0) {
    console.log("[poracode] Electron native dependency check failed; rebuilding better-sqlite3");
    rebuildElectronNativeDependencies();
    validation = validateElectronNativeDependencies();
  }
  if (validation.status !== 0) {
    const detail = validation.stderr?.trim() || validation.error?.message || "unknown error";
    throw new Error(`[poracode] Electron native dependency validation failed: ${detail}`);
  }

  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(electronNativeFingerprint(), null, 2)}\n`);
}

try {
  ensureElectronBinary();
  ensureNodePty();
  ensureBetterSqlite3();
  if (process.argv.includes("--electron-native")) {
    ensureElectronNativeDependencies();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
