import { rmSync, symlinkSync } from "node:fs";
import { join, relative } from "node:path";

export { applyServerNativeOverlay } from "../../scripts/server-native-overlay.mjs";

/** Point `<prefix>/current` at a release directory (relative symlink). */
export function writeCurrentSymlink(prefix: string, releaseDir: string): void {
  const current = join(prefix, "current");
  rmSync(current, { force: true });
  const target = relative(prefix, releaseDir) || ".";
  symlinkSync(target, current, "dir");
}
