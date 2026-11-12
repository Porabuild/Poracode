import { execFile, type ExecFileException } from "node:child_process";
import type { ProjectLocation, TerminalSnapshot } from "@/shared/contracts";
import type { TranscriptBuffer } from "@/shared/transcriptBuffer";
import { RETAINED_SHELL_SNAPSHOT_MAX_CHARS } from "../retainedShellSnapshots";

/** Default idle timeout before an interactive dev shell PTY with zero child processes suspends. */
export const DEFAULT_SHELL_IDLE_SUSPEND_MS = 5 * 60_000;

const WIN32_CHILD_CHECK_TIMEOUT_MS = 3_000;
const POSIX_CHILD_CHECK_TIMEOUT_MS = 2_000;

export interface SuspendedShellSession {
  instanceId: string;
  shellId: string;
  projectLocation: ProjectLocation;
  outputLength: number;
  outputTranscript: TranscriptBuffer;
  cols: number;
  rows: number;
  worktreePath?: string;
  windowsShellRuntime?: "preferred" | "powershell";
  startInHome?: boolean;
}

export function snapshotFromSuspendedShell(shell: SuspendedShellSession): TerminalSnapshot {
  const data = shell.outputTranscript.readTail(RETAINED_SHELL_SNAPSHOT_MAX_CHARS);
  const toCursor = shell.outputLength;
  return {
    generation: shell.instanceId,
    fromCursor: Math.max(0, toCursor - data.length),
    toCursor,
    data,
    processState: "running",
    terminalSize:
      Number.isInteger(shell.cols) &&
      Number.isInteger(shell.rows) &&
      shell.cols >= 1 &&
      shell.rows >= 1
        ? { cols: shell.cols, rows: shell.rows }
        : null,
  };
}

/**
 * Returns `true` if `pid` has any live child processes OR if the check cannot
 * prove it is idle (fail-closed so active builds/servers/REPLs are never killed).
 */
export function hasShellChildProcesses(pid: number, location: ProjectLocation): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 0) {
    return Promise.resolve(true);
  }
  // WSL shells run inside the Linux distro behind `wsl.exe`; never suspend them
  // based on Windows-side parent PID inspection.
  if (location.kind === "wsl") {
    return Promise.resolve(true);
  }

  if (process.platform === "win32" && location.kind === "windows") {
    return new Promise<boolean>((resolve) => {
      execFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `@(Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}').Count`,
        ],
        { windowsHide: true, timeout: WIN32_CHILD_CHECK_TIMEOUT_MS },
        (error, stdout) => {
          if (error) {
            resolve(true);
            return;
          }
          const parsed = Number.parseInt(stdout.trim(), 10);
          if (!Number.isInteger(parsed) || parsed < 0) {
            resolve(true);
            return;
          }
          resolve(parsed > 0);
        },
      );
    });
  }

  return new Promise<boolean>((resolve) => {
    execFile(
      "pgrep",
      ["-P", String(pid)],
      { timeout: POSIX_CHILD_CHECK_TIMEOUT_MS },
      (error: ExecFileException | null, stdout) => {
        if (!error) {
          resolve(stdout.trim().length > 0);
          return;
        }
        if ((error.code === 1 || error.code === "1") && stdout.trim().length === 0) {
          resolve(false);
          return;
        }
        resolve(true);
      },
    );
  });
}
