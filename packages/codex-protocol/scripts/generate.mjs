import { renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const codexEntry = require.resolve("@openai/codex/bin/codex.js");

// Generate into a staging directory and swap on success, so a failed run never
// leaves the package without its committed-quality `generated/` output.
const generatedDir = resolve(packageDir, "generated");
const stagingDir = resolve(packageDir, "generated.tmp");
rmSync(stagingDir, { recursive: true, force: true });

const generateArgs = ["app-server", "generate-ts", "--experimental", "--out", "./generated.tmp"];
const result = spawnSync(process.execPath, [codexEntry, ...generateArgs], {
  cwd: packageDir,
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Cannot generate Codex protocol types: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`Codex protocol generation failed with exit code ${result.status ?? "unknown"}.`);
  process.exit(result.status ?? 1);
}

rmSync(generatedDir, { recursive: true, force: true });
renameSync(stagingDir, generatedDir);
