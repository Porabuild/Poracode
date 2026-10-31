import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { watchRuntime } from "./dev-runtime-watch.mjs";
import { CommandSupervisor } from "./native-dev-lib.mjs";
import { resolveDevServerPort } from "./dev-server-port.mjs";
import { sweepStaleSupervisors } from "./sweepStaleSupervisors.mjs";

// Electron-based hosts can inherit this into the development shell.
delete process.env.ELECTRON_RUN_AS_NODE;
const require = createRequire(import.meta.url);
const root = process.cwd();
const commands = new CommandSupervisor();
const env = {
  ...process.env,
  VITE_DEV_SERVER_URL:
    process.env.PORACODE_DEV_APP_URL ?? `http://127.0.0.1:${resolveDevServerPort()}`,
};
const userDataDir = process.env.PORACODE_CDP_USER_DATA_DIR?.trim();
let app;
let stoppingApp;
let runtime;
let closed = false;

function run(script, args = []) {
  return commands.run(process.execPath, [resolve(root, script), ...args], {
    cwd: root,
    env,
    label: script,
    timeoutMs: 10 * 60_000,
  });
}

async function stopApp() {
  if (stoppingApp) return stoppingApp;
  const child = app;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  stoppingApp = new Promise((done, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error("Electron did not finish its shutdown; build outputs were not replaced.")),
      15_000,
    );
    child.once("exit", () => {
      clearTimeout(timer);
      done();
    });
    child.send({ version: 1, type: "poracode-dev-quit" }, (error) => {
      if (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  });
  try {
    await stoppingApp;
  } finally {
    stoppingApp = undefined;
  }
}

async function close() {
  if (closed) return;
  closed = true;
  await commands.shutdown();
  await stopApp();
  await runtime?.close();
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.once(signal, () => {
    void close().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  });

try {
  sweepStaleSupervisors();
  await run("scripts/ensure-native-deps.mjs", ["--electron-native"]);
  await run("scripts/prepare-pty-job-owner.mjs", ["--if-supported", "--host-only"]);
  await run("scripts/prepare-computer-use-helper.mjs", ["--host-only", "--dev"]);
  if (!closed) {
    runtime = await watchRuntime({
      root,
      beforePublish: stopApp,
      onPublished: async ({ isCurrent }) => {
        await run("scripts/prepare-wsl-helpers.mjs");
        await run("scripts/prepare-agent-plugins.mjs");
        await run("scripts/wait-dev-server.mjs");
        if (!isCurrent() || closed) return;
        const child = spawn(
          require("electron"),
          [
            "--require",
            resolve(root, "scripts/dev-electron-hook.cjs"),
            ...(userDataDir ? [`--user-data-dir=${userDataDir}`] : []),
            ".",
          ],
          {
            cwd: root,
            env,
            stdio: ["inherit", "inherit", "inherit", "ipc"],
            windowsHide: process.platform === "win32",
          },
        );
        app = child;
        child.once("exit", (code, signal) => {
          if (app === child) app = undefined;
          console.log(`[dev] Electron exited (${signal ?? code}); waiting for a source change.`);
        });
        await new Promise((done, reject) => {
          child.once("spawn", done);
          child.once("error", reject);
        });
        console.log(`[dev] Electron started (pid ${child.pid}).`);
      },
    });
    if (closed) await runtime.close();
    else await runtime.ready;
  }
} catch (error) {
  if (!closed) {
    console.error(error);
    process.exitCode = 1;
    await close();
  }
}
