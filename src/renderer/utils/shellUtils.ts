import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type { ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";

interface StartShellPayload {
  shellId: string;
  projectLocation: ProjectLocation;
  worktreePath?: string;
}

/**
 * Shell ids started eagerly (outside the terminal panel) — run actions,
 * command-palette terminal commands, worktree setup shells. The panel's
 * deferred, viewport-sized spawn must skip these: re-issuing `startShell`
 * for an existing id kills the running PTY, discarding the process (and any
 * command just written into it). The surface still resizes the live PTY.
 */
const eagerlyStartedShells = new Set<string>();

export function wasShellStartedEagerly(shellId: string): boolean {
  return eagerlyStartedShells.has(shellId);
}

export function clearEagerShellStart(shellId: string): void {
  eagerlyStartedShells.delete(shellId);
}

export function startShellWithToast(payload: StartShellPayload, label: string): void {
  eagerlyStartedShells.add(payload.shellId);
  void readBridge()
    .startShell(payload)
    .catch((error) =>
      toast.danger(error instanceof Error ? error.message : i18n._(msg`Unable to start ${label}.`)),
    );
}

export function normalizeShellScript(script: string): string {
  return normalizeShellScriptLines(script).join(" && ");
}

function normalizeShellScriptLines(script: string): string[] {
  return script
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

function buildPowerShellExitOnSuccess(lines: string[]): string {
  return lines.reduceRight((tail, line) => `${line}; if ($?) { ${tail} }`, "exit");
}

function createShellCompletionToken(): string {
  return `pc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function shellCompletionMarker(token: string): string {
  return `\u001B]777;poracode-shell-complete=${token}:`;
}

function quotePosixShellArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildScriptWithCompletion(
  script: string,
  locationKind: ProjectLocation["kind"],
  token: string,
): string {
  const lines = normalizeShellScriptLines(script);
  if (lines.length === 0) return "";

  if (locationKind === "windows") {
    const succeeded = "$poracodeSetupSucceeded";
    const exitCode = "$poracodeSetupExitCode";
    const guarded = lines.reduceRight(
      (tail, line) => `${line}; if ($?) { ${tail} }`,
      `${succeeded} = $true`,
    );
    return [
      `${succeeded} = $false`,
      guarded,
      `${exitCode} = if (${succeeded}) { 0 } elseif ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { $LASTEXITCODE } else { 1 }`,
      `Write-Host "$([char]27)]777;poracode-shell-complete=${token}:${exitCode}$([char]7)" -NoNewline`,
      `if (${succeeded}) { exit }`,
    ].join("; ");
  }

  const exitCode = "__poracode_setup_exit";
  const bashCommand = [
    lines.join(" && "),
    `${exitCode}=$?`,
    `printf '\\033]777;poracode-shell-complete=${token}:%s\\007' "$${exitCode}"`,
    `exit "$${exitCode}"`,
  ].join("; ");
  // The interactive POSIX shell may be fish, whose assignment and conditional
  // syntax differs from bash. Keep completion bookkeeping in bash, then let
  // the outer shell exit only when the child reports success. On failure the
  // interactive shell remains open for inspection.
  return `command bash -c ${quotePosixShellArg(bashCommand)} && exit`;
}

export function buildScriptWithExitOnSuccess(
  script: string,
  locationKind: ProjectLocation["kind"],
): string {
  const lines = normalizeShellScriptLines(script);
  if (lines.length === 0) return "";
  if (locationKind === "windows") return buildPowerShellExitOnSuccess(lines);
  return `${lines.join(" && ")} && exit`;
}

/**
 * Writes a script into a shell once it produces output. Re-arms on
 * `thread-reset` so the command lands in the surviving PTY when the shell
 * respawns (e.g. the terminal panel's viewport-sized respawn replacing an
 * eagerly started shell); detaches once the shell exits.
 */
export function writeScriptToShell(shellId: string, script: string) {
  const command = normalizeShellScript(script);
  if (!command) return;
  let armed = true;
  const unsub = readBridge().onSupervisorEvent((event) => {
    if (!("threadId" in event) || event.threadId !== shellId) return;
    if (event.type === "thread-reset") {
      armed = true;
      return;
    }
    if (event.type === "thread-output" && armed) {
      armed = false;
      void readBridge()
        .writeTerminal({ threadId: shellId, data: command + "\r" })
        .catch((error) => {
          console.warn(
            `[shellUtils] Unable to write command to shell ${shellId}:`,
            error instanceof Error ? error.message : error,
          );
        });
      return;
    }
    if (event.type === "thread-exited") unsub();
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
 * `onExit` fires once the shell's PTY exits — success, or a manual `exit`.
 * `onCommandComplete` additionally fires when the script finishes, including
 * failures that deliberately leave the shell open for inspection. Returns a
 * detach fn so callers can stop listening if the shell is torn down before it
 * finishes (a manual close kills the PTY with `ignoreExit`, suppressing
 * `thread-exited`), avoiding a dangling subscription. Unlike
 * {@link runShellScriptToCompletion} this keeps the shell visible and never
 * times out, so long installs are not cut short.
 */
export function writeScriptToShellThenExitOnSuccess(
  shellId: string,
  script: string,
  locationKind: ProjectLocation["kind"],
  onExit: (exitCode: number | null) => void,
  onCommandComplete?: (exitCode: number) => void,
): () => void {
  const command = normalizeShellScript(script);
  // Nothing meaningful to run — leave the (caller-guarded) shell untouched.
  if (!command) return () => undefined;
  const completionToken = onCommandComplete ? createShellCompletionToken() : undefined;
  const data = `${
    completionToken
      ? buildScriptWithCompletion(script, locationKind, completionToken)
      : buildScriptWithExitOnSuccess(script, locationKind)
  }\r`;

  let armed = true;
  let detached = false;
  let commandCompleted = false;
  let outputBuffer = "";
  let unsubscribe: () => void = () => undefined;
  const reportCommandComplete = (exitCode: number) => {
    if (commandCompleted) return;
    commandCompleted = true;
    onCommandComplete?.(exitCode);
  };
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
      outputBuffer = "";
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
          reportCommandComplete(-1);
        });
      return;
    }
    if (event.type === "thread-output" && completionToken) {
      outputBuffer = `${outputBuffer}${event.data}`.slice(-1024);
      const marker = shellCompletionMarker(completionToken);
      const markerStart = outputBuffer.indexOf(marker);
      if (markerStart < 0) return;
      const match = /^(\d+)/u.exec(outputBuffer.slice(markerStart + marker.length));
      if (match) reportCommandComplete(Number(match[1]));
      return;
    }
    if (event.type === "thread-exited") {
      reportCommandComplete(event.exitCode ?? -1);
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
  for (const threadId of uniqueThreadIds) eagerlyStartedShells.delete(threadId);
  await Promise.allSettled(
    uniqueThreadIds.map((threadId) => readBridge().closeThread({ threadId })),
  );
}
