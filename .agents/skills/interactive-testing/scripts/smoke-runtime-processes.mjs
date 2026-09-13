import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { smokeRuntimeEnvironment } from "./poracode-smoke-runtime.mjs";

export function startSmokeRenderer({ repoRoot, runtime, env, port }) {
  const hmr = runtime.renderer === "vite-hmr-development";
  let args;
  if (hmr) {
    const require = createRequire(join(repoRoot, "package.json"));
    const vite = join(dirname(require.resolve("vite/package.json")), "bin", "vite.js");
    args = [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"];
  } else {
    args = [
      join(runtime.appRoot, ".agents/skills/interactive-testing/scripts/serve-smoke-renderer.mjs"),
      join(runtime.appRoot, "dist", "renderer"),
      String(port),
    ];
  }
  return spawn(process.execPath, args, {
    cwd: hmr ? repoRoot : runtime.appRoot,
    env: smokeRuntimeEnvironment(env),
    detached: process.platform !== "win32",
    windowsHide: process.platform === "win32",
    stdio: "inherit",
  });
}

export async function waitForSmokeRenderer(child, url, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error("startupTimeoutSeconds must be a positive number");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error("Managed Vite process exited before readiness");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      /* Vite can still be starting. */
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("Managed Vite process did not become ready before the startup deadline");
}
