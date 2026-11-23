#!/usr/bin/env node
// Launcher for the shared PWA / iOS / Android mobile manual smoke host.
// Starts the deterministic WireLab mock host with loopback CORS for the PWA,
// pre-seeds the golden baseline, and opens the interactive stage controller.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(repoRoot, "tests/native-e2e/mobileSmoke/cli.ts");
const tsRegisterPath = new URL("./remote-v3-ts-register.mjs", import.meta.url).href;

const child = spawn(
  process.execPath,
  [
    "--import",
    tsRegisterPath,
    "--no-warnings=ExperimentalWarning",
    cliPath,
    ...process.argv.slice(2),
  ],
  {
    cwd: repoRoot,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
