// Electron-based hosts (VS Code, Poracode production build) set
// ELECTRON_RUN_AS_NODE=1 in their child processes.  If that leaks into our
// dev shell, `electron.exe` starts as plain Node and every Electron API is
// undefined.  Delete the variable before spawning electronmon.
delete process.env.ELECTRON_RUN_AS_NODE;

import { execSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolveDevServerPort } from "./dev-server-port.mjs";

const env = {
  ...process.env,
  VITE_DEV_SERVER_URL:
    process.env.PORACODE_DEV_APP_URL ?? `http://127.0.0.1:${resolveDevServerPort()}`,
};
const cdpUserDataDir = process.env.PORACODE_CDP_USER_DATA_DIR?.trim();
if (cdpUserDataDir) {
  const require = createRequire(import.meta.url);
  const electronPath = require("electron");
  const app = spawn(electronPath, [`--user-data-dir=${cdpUserDataDir}`, "."], {
    stdio: "inherit",
    windowsHide: process.platform === "win32",
    env,
  });
  const stop = () => app.kill();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const code = await new Promise((resolveExit, reject) => {
    app.once("error", reject);
    app.once("exit", (exitCode) => resolveExit(exitCode));
  });
  process.exitCode = code ?? 1;
} else {
  execSync("electronmon .", { stdio: "inherit", env });
}
