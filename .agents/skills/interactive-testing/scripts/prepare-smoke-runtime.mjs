import { prepareSmokeRuntime } from "./poracode-smoke-runtime.mjs";

const [repoRoot, root, ownerToken, rendererMode] = process.argv.slice(2);
if (!repoRoot || !root)
  throw new Error("Usage: prepare-smoke-runtime.mjs <checkout> <session-root>");
await prepareSmokeRuntime({ repoRoot, root, ownerToken, rendererViteHMR: rendererMode === "hmr" });
