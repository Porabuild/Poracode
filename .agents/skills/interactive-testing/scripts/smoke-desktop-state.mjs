import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Read only console flags; no window/device inventory, input or wake assertion. */
export function readSmokeDesktopState({
  platform = process.platform,
  sessionRoot,
  exec = execFileSync,
}) {
  if (platform !== "darwin") return { required: false };
  mkdirSync(sessionRoot, { recursive: true });
  const temporary = mkdtempSync(join(sessionRoot, "desktop-state-"));
  try {
    const binary = join(temporary, "console-flags");
    exec(
      "/usr/bin/clang",
      [
        fileURLToPath(new URL("./smoke-desktop-state.c", import.meta.url)),
        "-O2",
        "-framework",
        "CoreGraphics",
        "-framework",
        "CoreFoundation",
        "-o",
        binary,
      ],
      { timeout: 15_000, maxBuffer: 8192, encoding: "utf8" },
    );
    const value = JSON.parse(
      exec(binary, [], { timeout: 3000, maxBuffer: 1024, encoding: "utf8" }),
    );
    if (
      value?.version !== 1 ||
      value.dictionaryPresent !== true ||
      ![-1, 0, 1].includes(value.locked) ||
      ![0, 1].includes(value.onConsole)
    ) {
      throw new Error("macOS console state is unavailable");
    }
    return { required: true, screenLocked: value.locked === 1 || value.onConsole === 0 };
  } catch (error) {
    throw new Error("Cannot verify macOS desktop state before interactive smoke testing", {
      cause: error,
    });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function assertSmokeDesktopUnlocked(options) {
  const state = readSmokeDesktopState(options);
  if (state.screenLocked) {
    throw new Error(
      "macOS desktop is locked; unlock it before interactive smoke testing. No app was launched.",
    );
  }
  return state;
}
