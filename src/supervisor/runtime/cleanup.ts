import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Best-effort recursive remove. Swallows ENOENT and any other failure —
 * used in `finally` blocks to clean up staging dirs after install.
 */
export function safeRm(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // Ignore — staging cleanup is best-effort; OS TMP reaping handles the rest.
  }
}

/**
 * Sweep stale `node-v*` directories under a runtime root, keeping only
 * `keepDirName`. Used after a successful pinned-LTS install to keep
 * `~/.poracode/runtime/` (and its WSL UNC equivalent) from accumulating
 * ~80 MB per pinned-version bump. Failures are swallowed.
 */
export function pruneStaleRuntimeDirs(runtimeDir: string, keepDirName: string): void {
  let entries: string[];
  try {
    entries = readdirSync(runtimeDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.startsWith("node-v") || entry === keepDirName) continue;
    const target = join(runtimeDir, entry);
    try {
      if (statSync(target).isDirectory()) rmSync(target, { recursive: true, force: true });
    } catch {
      // Best-effort.
    }
  }
}
