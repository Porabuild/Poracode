#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import {
  removeSmokeRuntime,
  smokeElectronLaunch,
  verifyReusableSmokeRuntime,
} from "./poracode-smoke-runtime.mjs";
import { startSmokeRenderer, waitForSmokeRenderer } from "./smoke-runtime-processes.mjs";
import { stopOwnedProcess as stopProcess } from "./smoke-owned-process.mjs";
import {
  acquireDebugLaunchLock,
  assertSessionRootOutsideRepo,
  inspectDebugSessionHealth,
  isProcessRunning,
  listDebugSessions,
  readDebugSession,
  resolveSessionFile,
  resolveSmokeRoot,
  writeDebugSession,
} from "./poracode-debug-session.mjs";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(scriptDir, "../../../../");
const args = parseArgs(process.argv.slice(2));
const scope = String(args.scope ?? "changed");
const mode = String(args.mode ?? "mock");
// Slow cold transforms need a larger launch allowance without loosening scenario checks.
const startupTimeoutSeconds = Number(args.startupTimeoutSeconds ?? 180);
const launchOnly = args["launch-only"] === true;
const runKind = launchOnly ? "debug" : "automated";
const sessionToken = randomUUID();
const root = resolve(
  String(args.root ?? join(resolveSmokeRoot(), `${runKind}-${Date.now()}-${process.pid}`)),
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
const cdpScript = join(repoRoot, ".agents/skills/interactive-testing/scripts/poracode-cdp.mjs");
const sessionFile = resolveSessionFile(root);

let appProcess;
let rendererProcess;
let buildProcess;
let runtime;
let integrationProcess;
let sessionManifest;
let stopping = false;
let stopRequested = false;
let failureMessage;
let releaseLaunchLock;
let releaseRootLock;
let stopRequestPoll;
const stopRequestFile = join(root, "stop-request.json");
let resolveStopRequest;
const stopRequest = new Promise((done) => {
  resolveStopRequest = done;
});

function requestStop() {
  if (stopRequested) return;
  stopRequested = true;
  stopping = true;
  process.exitCode = 0;
  resolveStopRequest();
  for (const child of [integrationProcess, appProcess, rendererProcess, buildProcess]) {
    void stopProcess(child).catch(() => {
      // The verified teardown in finally reports any process that remains.
    });
  }
}

process.on("SIGINT", requestStop);
process.on("SIGTERM", requestStop);

try {
  if (mode !== "mock" && mode !== "real") {
    throw new Error(`--mode must be mock or real, got: ${mode}`);
  }
  assertSessionRootOutsideRepo(root, repoRoot);
  sessionLaunch: {
    if (launchOnly && args.new !== true) {
      releaseLaunchLock = await acquireDebugLaunchLock(repoRoot);
      const activeSessions = (await listDebugSessions({ repoRoot, purpose: "debug" })).filter(
        (session) => session.active,
      );
      if (activeSessions.length > 1) {
        throw new Error(
          `multiple debug sessions are already active; choose one with --session: ${activeSessions.map((session) => session.sessionFile).join(", ")}`,
        );
      }
      if (activeSessions.length === 1) {
        const existing = activeSessions[0];
        if (existing.mode !== mode) {
          throw new Error(
            `active debug session mode is ${existing.mode}, but this launch requested ${mode}; stop ${existing.sessionFile} before switching isolation modes`,
          );
        }
        const health = await inspectDebugSessionHealth(existing);
        if (health.status === "unhealthy") {
          throw new Error(
            `active debug session is not healthy and will not be reused: ${existing.sessionFile}. ${health.detail}. Stop its owning terminal before relaunching`,
          );
        }
        if (health.status === "ready")
          await verifyReusableSmokeRuntime(existing.runtime, {
            root: existing.root,
            repoRoot,
            rendererViteHMR: args.rendererViteHMR === true,
          });
        console.log(
          `Debug session already ${health.status}; no second app was launched: ${existing.sessionFile}`,
        );
        if (health.status === "starting") {
          console.log("Wait for READY in the owning terminal; do not attach or launch again.");
        } else {
          console.log(
            `Drive it now: node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs info --session "${existing.sessionFile}"`,
          );
        }
        break sessionLaunch;
      }
    }
    releaseRootLock = await acquireDebugLaunchLock(root);
    try {
      const prior = await readDebugSession(sessionFile);
      if (["starting", "ready"].includes(prior.state) && isProcessRunning(prior.ownerPid)) {
        throw new Error(`Session root is already owned by active PID ${prior.ownerPid}: ${root}`);
      }
    } catch (error) {
      if (error.cause?.code !== "ENOENT") throw error;
    }
    if (args["reuse-fixture"] === true) {
      await Promise.all([access(join(projectDir, ".git")), access(join(dataDir, "state.sqlite"))]);
    } else {
      await createFixture();
    }
    if (stopRequested) break sessionLaunch;
    // Each run gets its own dev-server and CDP ports so isolated apps from
    // multiple worktrees can run side by side. Explicit --port/--vitePort values
    // are honored (and verified free); everything else is allocated by the OS.
    const { cdpPort: port, vitePort } = await resolvePorts();
    const appUrl = `http://127.0.0.1:${vitePort}/?poracodeDebugSession=${sessionToken}`;
    await writePortsFile(port, vitePort, appUrl);
    sessionManifest = {
      id: basename(root),
      token: sessionToken,
      purpose: launchOnly ? "debug" : "smoke",
      state: "starting",
      repoRoot,
      root,
      appUrl,
      cdpPort: port,
      devServerPort: vitePort,
      baseDir: dataDir,
      projectDir,
      outDir,
      ownerPid: process.pid,
      appPid: null,
      mode,
      startedAt: new Date().toISOString(),
    };
    await persistSession();
    await rm(stopRequestFile, { force: true });
    stopRequestPoll = setInterval(() => {
      void access(stopRequestFile).then(requestStop, () => {});
    }, 100);
    await releaseLaunchLock?.();
    releaseLaunchLock = undefined;
    console.log(
      `${launchOnly ? "Debug" : "Smoke"} ports: CDP ${port}, dev server ${vitePort}. Session: ${sessionFile}`,
    );

    // Mock mode sandboxes the OS identity (HOME/APPDATA + a mock keychain) so
    // nothing touches the real user profile. Real mode intentionally keeps the
    // real home so provider credentials that live under it (e.g. ~/.kimi-code)
    // resolve — only Poracode's own state stays isolated via PORACODE_BASE_DIR.
    //
    // PORACODE_MOCK_AGENTS additionally makes the supervisor refuse to spawn
    // any real provider CLI (thread launches, one-shots, auth flows). The
    // HOME/keychain sandbox does not extend to spawned CLIs — without this a
    // mock-mode "Launch thread" used to execute the real provider binary with
    // real credentials (2026-09-08 QA incident).
    const identityEnv =
      mode === "real"
        ? {}
        : {
            ...(process.platform === "darwin" ? { PORACODE_USE_MOCK_KEYCHAIN: "1" } : {}),
            PORACODE_MOCK_AGENTS: "1",
            HOME: homeDir,
            USERPROFILE: homeDir,
            LOCALAPPDATA: localAppDataDir,
            APPDATA: roamingAppDataDir,
            PSModuleAnalysisCachePath: join(root, "powershell", "ModuleAnalysisCache"),
          };
    console.log(
      `Preparing a session-owned development runtime (${args.rendererViteHMR === true ? "renderer Vite HMR enabled" : "frozen renderer"})…`,
    );
    if (stopRequested) break sessionLaunch;
    buildProcess = spawn(
      process.execPath,
      [
        join(scriptDir, "prepare-smoke-runtime.mjs"),
        repoRoot,
        root,
        sessionToken,
        args.rendererViteHMR === true ? "hmr" : "snapshot",
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          ...(launchOnly ? { VITE_PORACODE_SKIP_WELCOME: "1" } : {}),
          PORACODE_BUILD_TARGET: "electron",
        },
        detached: process.platform !== "win32",
        windowsHide: process.platform === "win32",
        stdio: "inherit",
      },
    );
    const buildExit = await waitForProcessExit(buildProcess);
    if (stopRequested) break sessionLaunch;
    if (buildExit !== 0) throw new Error("Isolated runtime preparation failed");
    buildProcess = undefined;
    runtime = JSON.parse(await readFile(join(root, "runtime-manifest.json"), "utf8"));
    sessionManifest.runtime = runtime;
    await persistSession();
    if (stopRequested) break sessionLaunch;
    const appEnv = {
      ...process.env,
      PORACODE_DEV_SERVER_PORT: String(vitePort),
      PORACODE_DEV_APP_URL: appUrl,
      PORACODE_CDP_PORT: String(port),
      PORACODE_BASE_DIR: dataDir,
      PORACODE_CDP_USER_DATA_DIR: join(dataDir, "userData"),
      PORACODE_SMOKE_OUT_DIR: outDir,
      PORACODE_DEV_SERVER_REQUIRE_FREE: "1",
      PORACODE_DISABLE_DEVTOOLS: "1",
      ...(launchOnly ? { VITE_PORACODE_SKIP_WELCOME: "1" } : {}),
      ...identityEnv,
    };
    rendererProcess = startSmokeRenderer({ repoRoot, runtime, env: appEnv, port: vitePort });
    sessionManifest.rendererPid = rendererProcess.pid ?? null;
    await persistSession();
    await waitForSmokeRenderer(rendererProcess, appUrl, startupTimeoutSeconds * 1000);
    if (stopRequested) break sessionLaunch;
    const launch = smokeElectronLaunch(runtime, join(dataDir, "userData"), {
      ...appEnv,
      VITE_DEV_SERVER_URL: appUrl,
    });
    appProcess = spawn(launch.command, launch.args, launch.options);
    sessionManifest.appPid = appProcess.pid ?? null;
    await persistSession();
    appProcess.on("exit", (code, signal) => {
      if (!stopping && code !== null && code !== 0 && process.exitCode === undefined) {
        console.error(
          `Poracode dev process exited with code ${code}${signal ? ` (${signal})` : ""}`,
        );
      }
    });

    await waitForManagedApp(appProcess);
    if (stopRequested) break sessionLaunch;
    sessionManifest.state = "ready";
    await persistSession();

    if (launchOnly) {
      console.log(`Debug session READY: ${sessionFile}`);
      console.log(
        `Drive it without exporting ports: node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs info --session "${sessionFile}"`,
      );
      console.log("Keep this command running. Press Ctrl-C here to stop only this session.");
      await waitForManualStop(appProcess);
    } else {
      integrationProcess = spawn(
        process.execPath,
        [
          integrationScript,
          "run",
          "--scope",
          scope,
          "--mode",
          mode,
          "--session",
          sessionFile,
          // Cold Vite transforms can take 30s+ when several worktree dev apps
          // share the machine — the exact scenario isolated ports enable.
          "--timeoutMs",
          "60000",
          "--outDir",
          outDir,
        ],
        {
          cwd: repoRoot,
          stdio: "inherit",
          detached: process.platform !== "win32",
          windowsHide: process.platform === "win32",
        },
      );
      const integrationExit = await waitForProcessExit(integrationProcess);
      if (stopRequested) break sessionLaunch;
      integrationProcess = undefined;
      process.exitCode = integrationExit;
      console.log(`Automated smoke root: ${root}`);
    }
  }
} catch (error) {
  if (!stopRequested) {
    failureMessage = error instanceof Error ? error.message : String(error);
    console.error(`${launchOnly ? "Debug launch" : "Automated smoke"} failed: ${failureMessage}`);
    process.exitCode = 1;
  }
} finally {
  stopping = true;
  if (stopRequestPoll) clearInterval(stopRequestPoll);
  await releaseLaunchLock?.();
  let teardownError;
  try {
    await stopProcess(integrationProcess);
    await stopProcess(appProcess);
    await stopProcess(rendererProcess);
    await stopProcess(buildProcess);
    if (sessionManifest) await waitForSessionPortsClosed(sessionManifest, 5_000);
    if (sessionManifest)
      await removeSmokeRuntime(
        runtime ?? { appRoot: join(root, "runtime"), ownerToken: sessionToken },
        root,
      );
  } catch (error) {
    teardownError = error instanceof Error ? error.message : String(error);
    failureMessage ??= teardownError;
    console.error(`Managed debug teardown failed: ${teardownError}`);
    process.exitCode = 1;
  }
  if (sessionManifest) {
    sessionManifest.state = failureMessage ? "failed" : "stopped";
    if (!teardownError) sessionManifest.appPid = null;
    if (!teardownError) sessionManifest.rendererPid = null;
    if (failureMessage) sessionManifest.error = failureMessage;
    await persistSession();
  }
  await releaseRootLock?.();
  process.off("SIGINT", requestStop);
  process.off("SIGTERM", requestStop);
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
    join(projectDir, "smoke-mcp-server.mjs"),
    String.raw`let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf("\n");
    if (newline < 0) break;
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    const request = JSON.parse(line);
    let result;
    if (request.method === "initialize") {
      result = {
        protocolVersion: request.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "poracode-smoke", version: "1.0.0" },
      };
    } else if (request.method === "tools/list") {
      result = {
        tools: [
          {
            name: "smoke_echo",
            description: "Return the supplied smoke-test text.",
            inputSchema: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
            },
          },
        ],
      };
    } else if (request.method === "tools/call") {
      result = {
        content: [{ type: "text", text: String(request.params?.arguments?.text ?? "") }],
      };
    }
    if (request.id !== undefined && result !== undefined) {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n");
    }
  }
});
`,
  );
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
  execFileSync("git", ["init", "-q"], { cwd: projectDir, windowsHide: true });
  execFileSync("git", ["add", "-A"], { cwd: projectDir, windowsHide: true });
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
    { cwd: projectDir, windowsHide: true },
  );
  execFileSync(
    process.execPath,
    ["--no-warnings", seedScript, "--baseDir", dataDir, "--projectDir", projectDir, "--reset"],
    { cwd: repoRoot, stdio: "inherit", windowsHide: process.platform === "win32" },
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
    if (cdpPort === vitePort) {
      throw new Error(`Electron CDP and Vite must use different ports, got ${cdpPort} for both`);
    }
    return { cdpPort, vitePort };
  } finally {
    await Promise.all(
      holds.map(
        (server) =>
          new Promise((done) => {
            server.close(done);
          }),
      ),
    );
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
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    throw new Error(`${label} port must be between 1 and 65535, got: ${portNumber}`);
  }
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

async function waitForManagedApp(child) {
  if (!Number.isFinite(startupTimeoutSeconds) || startupTimeoutSeconds <= 0) {
    throw new Error("startupTimeoutSeconds must be a positive number");
  }
  if (child.exitCode !== null) {
    throw new Error(`Poracode dev process exited before CDP became ready (exit ${child.exitCode})`);
  }
  const checker = spawn(
    process.execPath,
    [cdpScript, "wait", "--session", sessionFile, "--timeout", String(startupTimeoutSeconds)],
    {
      cwd: repoRoot,
      stdio: ["inherit", "pipe", "pipe"],
      windowsHide: process.platform === "win32",
    },
  );
  let checkerError = "";
  checker.stdout.pipe(process.stdout);
  checker.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    checkerError = `${checkerError}${chunk}`.slice(-4000);
  });
  await new Promise((done, reject) => {
    const cleanup = () => {
      checker.off("error", failedToStart);
      checker.off("exit", checked);
      child.off("exit", appExited);
    };
    const failedToStart = (error) => {
      cleanup();
      reject(error);
    };
    const checked = (code) => {
      cleanup();
      if (stopping || code === 0) done();
      else {
        const detail = checkerError.trim().replace(/^ERROR:\s*/, "");
        reject(
          new Error(
            `Poracode did not become CDP-ready (exit ${code ?? "unknown"})${detail ? `: ${detail}` : ""}`,
          ),
        );
      }
    };
    const appExited = (code, signal) => {
      cleanup();
      checker.kill();
      if (stopping) done();
      else
        reject(
          new Error(
            `Poracode dev process exited before CDP became ready (exit ${code ?? "unknown"}${signal ? `, ${signal}` : ""})`,
          ),
        );
    };
    checker.once("error", failedToStart);
    checker.once("exit", checked);
    child.once("exit", appExited);
    void stopRequest.then(() => {
      cleanup();
      checker.kill();
      done();
    });
  });
}

function waitForProcessExit(child) {
  return new Promise((done, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => done(stopping ? 0 : (code ?? 1)));
  });
}

async function waitForSessionPortsClosed(session, timeoutMs) {
  const started = Date.now();
  const ports = [session.cdpPort, session.devServerPort];
  while (Date.now() - started < timeoutMs) {
    const listening = await Promise.all(ports.map(isPortListening));
    if (listening.every((value) => !value)) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`owned ports did not close: ${ports.join(", ")}`);
}

function isPortListening(port) {
  return new Promise((done) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(250);
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    socket.once("error", () => {
      socket.destroy();
      done(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      done(false);
    });
  });
}

async function persistSession() {
  if (sessionManifest) await writeDebugSession(sessionFile, sessionManifest);
}

function waitForManualStop(child) {
  return new Promise((done, reject) => {
    const stop = () => {
      cleanup();
      done();
    };
    const exited = (code, signal) => {
      cleanup();
      if (stopping || code === 0) done();
      else
        reject(
          new Error(`Poracode dev process exited with code ${code}${signal ? ` (${signal})` : ""}`),
        );
    };
    const cleanup = () => {
      child.off("exit", exited);
    };
    child.once("exit", exited);
    void stopRequest.then(stop);
  });
}
