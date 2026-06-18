// react-devtools spawns its own bundled Electron.  Electron-based hosts
// (VS Code, the Lightcode app itself, Claude Code) set ELECTRON_RUN_AS_NODE=1
// in their child processes.  If that leaks into our dev shell, react-devtools'
// Electron starts as plain Node and `require("electron").app` is undefined, so
// it crashes at startup (app.js:17, "Cannot read properties of undefined").
// Delete the variable before spawning, mirroring scripts/dev-launch.mjs.
delete process.env.ELECTRON_RUN_AS_NODE;

import { execSync } from "node:child_process";

execSync("react-devtools", { stdio: "inherit" });
