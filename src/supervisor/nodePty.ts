import { createRequire } from "node:module";
import { chmodSync, existsSync, statSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";

const require = createRequire(import.meta.url);

let spawnHelperChmodAttempted = false;

// node-pty ships a `spawn-helper` binary that posix_spawn invokes to set up
// the pty before exec. Packaged or cached installs can lose the executable bit,
// which surfaces as the opaque "posix_spawnp failed." error.
export function ensureNodePtySpawnHelperExecutable(): void {
  if (spawnHelperChmodAttempted) return;
  if (process.platform !== "darwin" && process.platform !== "linux") {
    spawnHelperChmodAttempted = true;
    return;
  }
  try {
    const ptyPkg = require.resolve("node-pty/package.json");
    const prebuildsDir = resolvePath(dirname(ptyPkg), "prebuilds");
    const candidate = resolvePath(
      prebuildsDir,
      `${process.platform}-${process.arch}`,
      "spawn-helper",
    );
    const unpackedCandidate = candidate.replace(`${"app.asar"}/`, `${"app.asar.unpacked"}/`);
    for (const path of new Set([unpackedCandidate, candidate])) {
      if (!existsSync(path)) continue;
      const stat = statSync(path);
      if ((stat.mode & 0o111) !== 0o111) {
        chmodSync(path, stat.mode | 0o111);
      }
    }
    spawnHelperChmodAttempted = true;
  } catch (err) {
    console.warn("[supervisor] failed to ensure spawn-helper +x:", err);
  }
}
