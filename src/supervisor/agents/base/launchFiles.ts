import { getWindowsSystemCommand, getWslCommand } from "./shellBasics";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, win32 } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";

/** Private, per-launch files. Returned paths belong to the provider's execution OS. */
export function stageLaunchFiles(
  location: ProjectLocation,
  prefix: string,
  files: Readonly<Record<string, string>>,
): { directory: string; cleanup: () => void } {
  if (!/^[a-z0-9-]+$/u.test(prefix)) throw new Error("Invalid launch directory prefix");
  const name = `poracode-${prefix}-${randomUUID()}`;
  const directory = location.kind === "wsl" ? `/tmp/${name}` : join(tmpdir(), name);
  const fsDirectory =
    location.kind === "wsl" ? toWslUncPath(location.distro, directory) : directory;
  const cleanup = () => rmSync(fsDirectory, { recursive: true, force: true });
  try {
    if (location.kind === "wsl") {
      // UNC creation ignores POSIX modes. Protect the directory inside Linux
      // before any configuration (which can contain credentials) is written.
      execFileSync(
        getWslCommand(),
        ["-d", location.distro, "--exec", "mkdir", "--mode=700", "--", directory],
        { windowsHide: true },
      );
    } else {
      mkdirSync(fsDirectory, { mode: 0o700 });
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
          [fsDirectory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`],
          { windowsHide: true },
        );
      }
    }
    for (const [relative, content] of Object.entries(files)) {
      if (
        posix.isAbsolute(relative) ||
        win32.isAbsolute(relative) ||
        relative.split(/[\\/]/u).includes("..")
      ) {
        throw new Error("Launch file must stay inside its directory");
      }
      const path = join(fsDirectory, relative);
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      writeFileSync(path, content, { encoding: "utf8", mode: 0o600 });
    }
  } catch (error) {
    cleanup();
    throw error;
  }
  return { directory, cleanup };
}
