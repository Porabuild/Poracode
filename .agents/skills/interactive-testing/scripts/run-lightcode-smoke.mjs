#!/usr/bin/env node

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(scriptDir, "../../../../");
const args = parseArgs(process.argv.slice(2));
const port = Number(args.port ?? 9222);
const scope = String(args.scope ?? "changed");
const mode = String(args.mode ?? "mock");
const root = resolve(
  String(args.root ?? join(homedir(), ".lightcode-smoke", `automated-${Date.now()}`)),
);
const outDir = resolve(String(args.outDir ?? join(root, "artifacts")));
const dataDir = join(root, "data");
const projectDir = join(root, "project");
const integrationScript = join(
  repoRoot,
  ".agents/skills/interactive-testing/scripts/lightcode-integration-smoke.mjs",
);
const seedScript = join(
  repoRoot,
  ".agents/skills/interactive-testing/scripts/seed-lightcode-smoke-db.mjs",
);

let appProcess;

try {
  await assertPortFree(3100, "Vite");
  await assertPortFree(port, "Electron CDP");
  await createFixture();

  const pnpm = pnpmSpawnCommand();
  appProcess = spawn(pnpm.command, pnpm.args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      LIGHTCODE_CDP_PORT: String(port),
      LIGHTCODE_BASE_DIR: dataDir,
      LIGHTCODE_SMOKE_OUT_DIR: outDir,
    },
    detached: process.platform !== "win32",
    stdio: "inherit",
  });
  appProcess.on("exit", (code, signal) => {
    if (code !== null && code !== 0 && process.exitCode === undefined) {
      console.error(
        `Lightcode dev process exited with code ${code}${signal ? ` (${signal})` : ""}`,
      );
    }
  });

  await waitForAppTarget(port, 120_000);
  const result = spawnSync(
    process.execPath,
    [
      integrationScript,
      "run",
      "--scope",
      scope,
      "--mode",
      mode,
      "--port",
      String(port),
      "--timeoutMs",
      "30000",
      "--outDir",
      outDir,
    ],
    { cwd: repoRoot, encoding: "utf8", stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
  console.log(`Automated smoke root: ${root}`);
} catch (error) {
  console.error(
    `Automated smoke failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await stopProcess(appProcess);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function pnpmSpawnCommand() {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm run dev"],
    };
  }
  return { command: "pnpm", args: ["run", "dev"] };
}

async function createFixture() {
  await mkdir(projectDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(projectDir, "README.md"), "# Lightcode smoke fixture\n");
  await writeFile(join(projectDir, "hello.txt"), "fixture data\n");
  await writeFile(
    join(projectDir, ".mcp.json"),
    `${JSON.stringify(
      {
        mcpServers: {
          smoke_external: { command: "node", args: ["smoke-mcp-server.mjs"] },
        },
      },
      null,
      2,
    )}\n`,
  );
  execFileSync("git", ["init", "-q"], { cwd: projectDir });
  execFileSync("git", ["add", "-A"], { cwd: projectDir });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Lightcode Smoke",
      "-c",
      "user.email=smoke@lightcode.local",
      "commit",
      "-qm",
      "initial fixture",
    ],
    { cwd: projectDir },
  );
  execFileSync(
    process.execPath,
    ["--no-warnings", seedScript, "--baseDir", dataDir, "--projectDir", projectDir, "--reset"],
    { cwd: repoRoot, stdio: "inherit" },
  );
}

async function assertPortFree(portNumber, label) {
  await new Promise((done, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: portNumber });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error(`${label} port ${portNumber} is already in use`));
    });
    socket.once("error", () => {
      socket.destroy();
      done();
    });
  });
}

async function waitForAppTarget(portNumber, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${portNumber}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        if (
          targets.some(
            (target) => target.type === "page" && target.url === "http://127.0.0.1:3100/",
          )
        ) {
          return;
        }
      }
    } catch {
      // The dev process is still compiling or starting Electron.
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`timed out waiting for Lightcode CDP target on port ${portNumber}`);
}

async function stopProcess(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  if (child.exitCode !== null) return;
  sendSignal(child, "SIGINT");
  await new Promise((done) => {
    const timer = setTimeout(() => {
      sendSignal(child, "SIGTERM");
      done();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      done();
    });
  });
}

function sendSignal(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}
