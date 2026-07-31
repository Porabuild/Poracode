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
const scope = String(args.scope ?? "changed");
const mode = String(args.mode ?? "mock");
const root = resolve(
  String(args.root ?? join(homedir(), ".poracode-smoke", `automated-${Date.now()}-${process.pid}`)),
);
const outDir = resolve(String(args.outDir ?? join(root, "artifacts")));
const dataDir = join(root, "data");
const homeDir = join(root, "home");
const localAppDataDir = join(root, "local-app-data");
const roamingAppDataDir = join(root, "roaming-app-data");
const projectDir = join(root, "project");
const integrationScript = join(
  repoRoot,
  ".agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs",
);
const seedScript = join(
  repoRoot,
  ".agents/skills/interactive-testing/scripts/seed-poracode-smoke-db.mjs",
);

let appProcess;

try {
  // Each run gets its own dev-server and CDP ports so isolated apps from
  // multiple worktrees can run side by side. Explicit --port/--vitePort values
  // are honored (and verified free); everything else is allocated by the OS.
  const { cdpPort: port, vitePort } = await resolvePorts();
  const appUrl = `http://127.0.0.1:${vitePort}/`;
  await createFixture();
  await writePortsFile(port, vitePort, appUrl);
  console.log(
    `Smoke ports: CDP ${port}, dev server ${vitePort}. For manual gates: PORACODE_CDP_PORT=${port} PORACODE_APP_URL=${appUrl}`,
  );

  // Mock mode sandboxes the OS identity (HOME/APPDATA + a mock keychain) so
  // nothing touches the real user profile. Real mode intentionally keeps the
  // real home so provider credentials that live under it (e.g. ~/.kimi-code)
  // resolve — only Poracode's own state stays isolated via PORACODE_BASE_DIR.
  const identityEnv =
    mode === "real"
      ? {}
      : {
          ...(process.platform === "darwin" ? { PORACODE_USE_MOCK_KEYCHAIN: "1" } : {}),
          HOME: homeDir,
          USERPROFILE: homeDir,
          LOCALAPPDATA: localAppDataDir,
          APPDATA: roamingAppDataDir,
          PSModuleAnalysisCachePath: join(root, "powershell", "ModuleAnalysisCache"),
        };
  const pnpm = pnpmSpawnCommand();
  appProcess = spawn(pnpm.command, pnpm.args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORACODE_DEV_SERVER_PORT: String(vitePort),
      PORACODE_CDP_PORT: String(port),
      PORACODE_BASE_DIR: dataDir,
      PORACODE_SMOKE_OUT_DIR: outDir,
      ...identityEnv,
    },
    detached: process.platform !== "win32",
    stdio: "inherit",
  });
  appProcess.on("exit", (code, signal) => {
    if (code !== null && code !== 0 && process.exitCode === undefined) {
      console.error(`Poracode dev process exited with code ${code}${signal ? ` (${signal})` : ""}`);
    }
  });

  await waitForAppTarget(port, appUrl, 120_000);
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
      "--appUrl",
      appUrl,
      // Cold Vite transforms can take 30s+ when several worktree dev apps
      // share the machine — the exact scenario isolated ports enable.
      "--timeoutMs",
      "60000",
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
  await mkdir(homeDir, { recursive: true });
  await mkdir(localAppDataDir, { recursive: true });
  await mkdir(roamingAppDataDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  const managedSkillDir = join(projectDir, ".agents", "skills", "smoke-review");
  const externalSkillDir = join(projectDir, ".claude", "skills", "smoke-external");
  const globalManagedSkillDir = join(homeDir, ".agents", "skills", "smoke-global");
  const globalExternalSkillDir = join(homeDir, ".claude", "skills", "smoke-global-external");
  await mkdir(managedSkillDir, { recursive: true });
  await mkdir(externalSkillDir, { recursive: true });
  await mkdir(globalManagedSkillDir, { recursive: true });
  await mkdir(globalExternalSkillDir, { recursive: true });
  await writeFile(join(projectDir, "README.md"), "# Poracode smoke fixture\n");
  await writeFile(join(projectDir, "hello.txt"), "fixture data\n");
  await writeFile(
    join(managedSkillDir, "SKILL.md"),
    "---\nname: smoke-review\ndescription: Deterministic managed smoke skill\n---\n\n# Smoke review\n",
  );
  await writeFile(
    join(externalSkillDir, "SKILL.md"),
    "---\nname: smoke-external\ndescription: Deterministic external smoke skill\n---\n\n# Smoke external\n",
  );
  await writeFile(
    join(globalManagedSkillDir, "SKILL.md"),
    "---\nname: smoke-global\ndescription: Deterministic global smoke skill\n---\n\n# Smoke global\n",
  );
  await writeFile(
    join(globalExternalSkillDir, "SKILL.md"),
    "---\nname: smoke-global-external\ndescription: Deterministic global external smoke skill\n---\n\n# Smoke global external\n",
  );
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
      "user.name=Poracode Smoke",
      "-c",
      "user.email=smoke@poracode.local",
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

async function resolvePorts() {
  // Hold both allocation servers open at once so the OS hands out two distinct
  // free ports; explicit values are checked against running listeners instead.
  const holds = [];
  try {
    const cdpPort = args.port
      ? await assertPortFree(Number(args.port), "Electron CDP")
      : await allocateFreePort(holds);
    const vitePort = args.vitePort
      ? await assertPortFree(Number(args.vitePort), "Vite")
      : await allocateFreePort(holds);
    return { cdpPort, vitePort };
  } finally {
    for (const server of holds) server.close();
  }
}

async function allocateFreePort(holds) {
  return await new Promise((done, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      holds.push(server);
      done(server.address().port);
    });
  });
}

async function assertPortFree(portNumber, label) {
  return await new Promise((done, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: portNumber });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error(`${label} port ${portNumber} is already in use`));
    });
    socket.once("error", () => {
      socket.destroy();
      done(portNumber);
    });
  });
}

async function writePortsFile(cdpPort, vitePort, appUrl) {
  await writeFile(
    join(root, "ports.json"),
    `${JSON.stringify({ appUrl, cdpPort, devServerPort: vitePort }, null, 2)}\n`,
  );
}

async function waitForAppTarget(portNumber, appUrl, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${portNumber}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        if (targets.some((target) => target.type === "page" && target.url === appUrl)) {
          return;
        }
      }
    } catch {
      // The dev process is still compiling or starting Electron.
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`timed out waiting for Poracode CDP target on port ${portNumber}`);
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
