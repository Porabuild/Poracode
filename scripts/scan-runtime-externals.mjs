#!/usr/bin/env node
// Prints the list of npm packages that the production-built main-process
// bundles still require() at runtime (i.e. tsdown did not inline).
// These are the only packages the stage build needs to install.
//
// Usage: bun run build && node scripts/scan-runtime-externals.mjs

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scanRuntimeExternals } from "./runtime-externals.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const pkg of scanRuntimeExternals(repoRoot)) {
  console.log(pkg);
}
