import { execFile, type ChildProcess } from "node:child_process";
import { parentPort } from "node:worker_threads";

export interface GitExecWorkerRequest {
  readonly id: number;
  readonly kind: "exec";
  readonly command: string;
  readonly args: string[];
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
  readonly timeout: number;
  readonly maxBuffer: number;
  readonly input?: string;
}

export interface GitExecWorkerCancel {
  readonly id: number;
  readonly kind: "cancel";
}

export type GitExecWorkerInbound = GitExecWorkerRequest | GitExecWorkerCancel;

export type GitExecWorkerResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly stdout: string;
      readonly stderr: string;
    }
  | {
      readonly id: number;
      readonly ok: false;
      readonly message: string;
      readonly name?: string;
      readonly code?: string | number | null;
      readonly signal?: NodeJS.Signals | null;
      readonly killed?: boolean;
      readonly stdout: string;
      readonly stderr: string;
    };

const inFlightChildren = new Map<number, ChildProcess>();

function post(response: GitExecWorkerResponse): void {
  parentPort?.postMessage(response);
}

function handleExec(request: GitExecWorkerRequest): void {
  let stdinError: Error | undefined;
  let settled = false;

  const finish = (response: GitExecWorkerResponse): void => {
    if (settled) return;
    settled = true;
    inFlightChildren.delete(request.id);
    post(response);
  };

  const child = execFile(
    request.command,
    request.args,
    {
      cwd: request.cwd,
      env: request.env,
      timeout: request.timeout,
      maxBuffer: request.maxBuffer,
      windowsHide: true,
    },
    (error, stdout, stderr) => {
      const stdoutText = Buffer.isBuffer(stdout) ? stdout.toString("utf8") : String(stdout ?? "");
      const stderrText = Buffer.isBuffer(stderr) ? stderr.toString("utf8") : String(stderr ?? "");
      if (error) {
        const execError = error as Error & {
          code?: string | number | null;
          signal?: NodeJS.Signals | null;
          killed?: boolean;
        };
        finish({
          id: request.id,
          ok: false,
          message: execError.message,
          name: execError.name,
          ...(execError.code !== undefined ? { code: execError.code } : {}),
          ...(execError.signal !== undefined ? { signal: execError.signal } : {}),
          ...(execError.killed !== undefined ? { killed: execError.killed } : {}),
          stdout: stdoutText,
          stderr: stderrText,
        });
        return;
      }
      if (stdinError) {
        finish({
          id: request.id,
          ok: false,
          message: stdinError.message,
          name: stdinError.name,
          stdout: stdoutText,
          stderr: stderrText,
        });
        return;
      }
      finish({
        id: request.id,
        ok: true,
        stdout: stdoutText,
        stderr: stderrText,
      });
    },
  );

  inFlightChildren.set(request.id, child);

  if (request.input !== undefined) {
    if (!child.stdin) {
      child.kill();
      finish({
        id: request.id,
        ok: false,
        message: `Unable to write stdin for ${request.command}.`,
        stdout: "",
        stderr: "",
      });
      return;
    }
    child.stdin.once("error", (error) => {
      stdinError = error;
    });
    child.stdin.end(request.input);
  }
}

parentPort?.on("message", (message: GitExecWorkerInbound) => {
  if (!message || typeof message !== "object") return;
  if (message.kind === "cancel") {
    const child = inFlightChildren.get(message.id);
    if (child) {
      try {
        child.kill();
      } catch {
        // already exited
      }
    }
    return;
  }
  if (message.kind === "exec") {
    handleExec(message);
  }
});
