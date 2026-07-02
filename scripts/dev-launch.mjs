// Electron-based hosts (VS Code, Poracode production build) set
// ELECTRON_RUN_AS_NODE=1 in their child processes.  If that leaks into our
// dev shell, `electron.exe` starts as plain Node and every Electron API is
// undefined.  Delete the variable before spawning electronmon.
delete process.env.ELECTRON_RUN_AS_NODE;

import { execSync } from "node:child_process";

execSync("electronmon .", {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: "http://127.0.0.1:3100",
  },
});
