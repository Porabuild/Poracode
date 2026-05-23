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
