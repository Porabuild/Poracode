import { getWindowsSystemCommand } from "./shellBasics";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, win32 } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { ensureWslDirectory, removeWslPath, writeWslTextFile } from "../plugin/wslStaging";
import type { Awaitable } from "./types";

const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

function assertSafeRelativePath(relative: string): void {
  if (
    posix.isAbsolute(relative) ||
    win32.isAbsolute(relative) ||
    relative.split(/[\\/]/u).includes("..")
  ) {
    throw new Error("Launch file must stay inside its directory");
  }
}

/**
 * Private, per-launch files. Returned paths belong to the provider's execution
 * OS. WSL files are written through the per-distro staging worker (bounded,
 * cancellable) so a stalled UNC share never pins the supervisor control loop;
 * native files keep the synchronous path.
 */
export async function stageLaunchFiles(
  location: ProjectLocation,
  prefix: string,
  files: Readonly<Record<string, string>>,
): Promise<{ directory: string; cleanup: () => Awaitable<void> }> {
  if (!/^[a-z0-9-]+$/u.test(prefix)) throw new Error("Invalid launch directory prefix");
  const name = `poracode-${prefix}-${randomUUID()}`;
  const directory = location.kind === "wsl" ? `/tmp/${name}` : join(tmpdir(), name);
  for (const relative of Object.keys(files)) {
    assertSafeRelativePath(relative);
  }

  if (location.kind === "wsl") {
    const distro = location.distro;
    try {
      await ensureWslDirectory(distro, directory, { mode: PRIVATE_DIR_MODE });
      for (const [relative, content] of Object.entries(files)) {
        await writeWslTextFile(distro, `${directory}/${relative}`, content, {
          mode: PRIVATE_FILE_MODE,
        });
      }
    } catch (error) {
      await removeWslPath(distro, directory);
      throw error;
    }
    return { directory, cleanup: () => removeWslPath(distro, directory) };
  }

  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  try {
    mkdirSync(directory, { mode: PRIVATE_DIR_MODE });
    if (process.platform === "win32") {
      const identity = execFileSync(
        getWindowsSystemCommand("whoami.exe"),
        ["/user", "/fo", "csv", "/nh"],
        {
          encoding: "utf8",
          windowsHide: true,
        },
      );
      const sid = identity.match(/S-1-[0-9-]+/u)?.[0];
      if (!sid) throw new Error("Could not resolve the current Windows security identity");
      execFileSync(
        getWindowsSystemCommand("icacls.exe"),
        [directory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`],
        { windowsHide: true },
      );
    }
    for (const [relative, content] of Object.entries(files)) {
      const path = join(directory, relative);
      mkdirSync(dirname(path), { recursive: true, mode: PRIVATE_DIR_MODE });
      writeFileSync(path, content, { encoding: "utf8", mode: PRIVATE_FILE_MODE });
    }
  } catch (error) {
    cleanup();
    throw error;
  }
  return { directory, cleanup };
}
