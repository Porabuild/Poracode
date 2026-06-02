import { toast } from "@heroui/react";
import type { ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

interface StartShellPayload {
  shellId: string;
  projectLocation: ProjectLocation;
  worktreePath?: string;
}

export function startShellWithToast(payload: StartShellPayload, label: string): void {
  void readBridge()
    .startShell(payload)
    .catch((error) =>
      toast.danger(error instanceof Error ? error.message : `Unable to start ${label}.`),
    );
}

export function normalizeShellScript(script: string): string {
  return script
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"))
    .join(" && ");
}

export function writeScriptToShell(shellId: string, script: string) {
  const command = normalizeShellScript(script);
  if (!command) return;
  const unsub = readBridge().onSupervisorEvent((event) => {
    if (event.type === "thread-output" && event.threadId === shellId) {
      unsub();
      void readBridge()
        .writeTerminal({ threadId: shellId, data: command + "\r" })
        .catch((error) => {
          console.warn(
            `[shellUtils] Unable to write command to shell ${shellId}:`,
            error instanceof Error ? error.message : error,
          );
        });
    }
  });
}

/**
 * Appends a shell-correct "exit only if every command succeeded" tail to a
 * normalized command chain.
 *
 * Native Windows runs PowerShell (pwsh 7 or Windows PowerShell 5.1), where
 * `exit` is a language keyword that cannot be the right-hand operand of `&&`
 * (`<chain> && exit` errors with "exit not recognized" and does NOT exit). A
 * conditional statement (`; if ($?) { exit }`) exits on success and stays
 * interactive on failure. The cmd.exe fallback is unreachable here because
 * `powershell.exe` ships with every Windows. WSL and posix shells (and cmd)
 * treat `exit` as a command, so `&& exit` runs it only on success.
 */
export function appendExitOnSuccess(
  command: string,
  locationKind: ProjectLocation["kind"],
): string {
  return locationKind === "windows" ? `${command}; if ($?) { exit }` : `${command} && exit`;
}

/**
 * Runs a script in an already-started shell, then lets the shell exit on its
 * own once every command succeeds (see {@link appendExitOnSuccess}); on failure
 * the chain stops short of the exit and the shell stays interactive for
 * inspection. The command is re-sent on every `thread-reset` so it lands in the
 * surviving PTY when the shell respawns (e.g. a panel-driven, viewport-sized
 * respawn).
 *
 * `onExit` fires once the shell's PTY exits — success, or a manual `exit` — and
 * the listener detaches itself first. Returns a detach fn so callers can stop
 * listening if the shell is torn down before it finishes (a manual close kills
 * the PTY with `ignoreExit`, suppressing `thread-exited`), avoiding a dangling
 * subscription. Unlike {@link runShellScriptToCompletion} this keeps the shell
 * visible and never times out, so long installs are not cut short.
 */
export function writeScriptToShellThenExitOnSuccess(
  shellId: string,
  script: string,
  locationKind: ProjectLocation["kind"],
  onExit: (exitCode: number | null) => void,
): () => void {
  const command = normalizeShellScript(script);
  // Nothing meaningful to run — leave the (caller-guarded) shell untouched.
  if (!command) return () => undefined;
  const data = `${appendExitOnSuccess(command, locationKind)}\r`;

  let armed = true;
  let detached = false;
  let unsubscribe: () => void = () => undefined;
  const detach = () => {
    if (detached) return;
    detached = true;
    unsubscribe();
  };
  unsubscribe = readBridge().onSupervisorEvent((event) => {
    if (!("threadId" in event) || event.threadId !== shellId) return;
    if (event.type === "thread-reset") {
      // A fresh PTY spawned; re-send on its first output so the command runs
      // in the survivor rather than a PTY that is about to be replaced.
      armed = true;
      return;
    }
    if (event.type === "thread-output" && armed) {
      armed = false;
      void readBridge()
        .writeTerminal({ threadId: shellId, data })
        .catch((error) => {
          console.warn(
            `[shellUtils] Unable to write command to shell ${shellId}:`,
            error instanceof Error ? error.message : error,
          );
        });
      return;
    }
    if (event.type === "thread-exited") {
      detach();
      onExit(event.exitCode);
    }
  });
  return detach;
}

export async function runShellScriptToCompletion(
  shellId: string,
  projectLocation: ProjectLocation,
  script: string,
): Promise<void> {
  const command = normalizeShellScript(script);
  if (!command) return;

  await readBridge().startShell({ shellId, projectLocation });

  await new Promise<void>((resolve, reject) => {
    let started = false;
    let done = false;
    let unsubscribe: () => void = () => undefined;
    const timeout = window.setTimeout(() => {
      if (done) return;
      done = true;
      unsubscribe();
      void readBridge()
        .closeThread({ threadId: shellId })
        .catch(() => undefined);
      reject(new Error(`Timed out waiting for cleanup shell ${shellId}.`));
    }, 30_000);
    unsubscribe = readBridge().onSupervisorEvent((event) => {
      if (done || !("threadId" in event) || event.threadId !== shellId) return;
      if (event.type === "thread-output" && !started) {
        started = true;
        void readBridge()
          .writeTerminal({ threadId: shellId, data: `${command}\rexit\r` })
          .catch((error) => {
            if (done) return;
            done = true;
            window.clearTimeout(timeout);
            unsubscribe();
            reject(error);
          });
        return;
      }
      if (event.type === "thread-exited") {
        done = true;
        window.clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });
  });
}

export async function closeThreads(threadIds: readonly string[]): Promise<void> {
  const uniqueThreadIds = [...new Set(threadIds.filter(Boolean))];
  await Promise.allSettled(
    uniqueThreadIds.map((threadId) => readBridge().closeThread({ threadId })),
  );
}
