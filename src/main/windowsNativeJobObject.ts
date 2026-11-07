// Desktop job-object ownership through the bundled pty-job-owner helper: one
// verified native process per backend assignment replaces the PowerShell +
// Add-Type (csc.exe) startup that gated every launch. The helper speaks the
// closed `--pty-job-v1` line protocol from src/shared/contracts/ptyJobOwner.ts
// and holds the kill-on-close job; because the helper exits when main exits,
// the kernel kills every job member if main dies.
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { PTY_JOB_CONTROL_MAX_BYTES, ptyJobReplySchema } from "@/shared/contracts/ptyJobOwner";
import { readPtyJobOwnerArtifact } from "@/shared/ptyJobOwnerArtifact";
import { WindowsJobObjectManager, type WindowsJobObjectOwner } from "./windowsJobObject";

const ASSIGN_TIMEOUT_MS = 10_000;
const DISPOSE_GRACE_MS = 500;

interface ManagedHelper {
  readonly child: ChildProcessWithoutNullStreams;
  readonly nonce: string;
  readonly pid: number;
  carry: string;
  stderrTail: string;
  phase: "ready" | "bound" | "prepared" | "assigned";
  // Once `assign-v1` is written the backend may already be inside the helper's
  // kill-on-close job, so the helper must never be killed from then on — only
  // `close-v1` (or main's exit) may end it.
  assignmentRequested: boolean;
  settle: { resolve(): void; reject(error: Error): void } | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export class NativeWindowsJobObjectManager implements WindowsJobObjectOwner {
  private readonly helpers = new Set<ManagedHelper>();
  private readonly assignTimeoutMs: number;
  private isDisposed = false;

  constructor(
    private readonly helperPath: string,
    options: { assignTimeoutMs?: number } = {},
  ) {
    this.assignTimeoutMs = options.assignTimeoutMs ?? ASSIGN_TIMEOUT_MS;
  }

  async start(): Promise<void> {
    // Helpers are spawned per assignment; nothing to warm up.
  }

  async assignPid(pid: number): Promise<void> {
    if (process.platform !== "win32" || !Number.isInteger(pid) || pid <= 0) {
      return;
    }
    if (this.isDisposed) {
      throw new Error("Windows job object owner is disposed.");
    }

    const nonce = randomBytes(24).toString("hex");
    const env: Record<string, string> = {};
    for (const key of ["SystemRoot", "windir"]) {
      const value = process.env[key];
      if (value !== undefined) env[key] = value;
    }
    const child = spawn(this.helperPath, ["--pty-job-v1", nonce, String(process.pid)], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    const helper: ManagedHelper = {
      child,
      nonce,
      pid,
      carry: "",
      stderrTail: "",
      phase: "ready",
      assignmentRequested: false,
      settle: null,
      timer: null,
    };
    this.helpers.add(helper);

    return new Promise<void>((resolve, reject) => {
      helper.settle = { resolve, reject };
      helper.timer = setTimeout(
        () => this.fail(helper, `timed out after ${this.assignTimeoutMs}ms`),
        this.assignTimeoutMs,
      );
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => this.read(helper, chunk));
      child.stderr.on("data", (chunk) => {
        helper.stderrTail = `${helper.stderrTail}${String(chunk)}`.slice(-4000);
      });
      for (const stream of [child.stdin, child.stdout, child.stderr]) {
        stream.on("error", () => {
          if (!helper.assignmentRequested && !this.isDisposed) {
            this.fail(helper, "control pipe failed");
          }
        });
      }
      child.once("error", (error) => this.fail(helper, `helper could not start: ${error.message}`));
      child.once("exit", (code, signal) => this.exited(helper, code, signal));
    });
  }

  dispose(): void {
    this.isDisposed = true;
    for (const helper of this.helpers) {
      if (helper.timer) clearTimeout(helper.timer);
      helper.settle?.reject(new Error("Windows job object owner disposed."));
      helper.settle = null;
      const child = helper.child;
      try {
        if (!child.stdin.destroyed && !child.stdin.writableEnded) {
          child.stdin.end(`close-v1 ${helper.nonce}\n`);
        }
      } catch {
        // Ignore shutdown races.
      }
      const forceCloseTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null && !child.killed) {
          child.kill();
        }
      }, DISPOSE_GRACE_MS);
      forceCloseTimer.unref?.();
    }
    this.helpers.clear();
  }

  private read(helper: ManagedHelper, chunk: string): void {
    helper.carry += chunk;
    let newline: number;
    while ((newline = helper.carry.indexOf("\n")) !== -1) {
      if (newline >= PTY_JOB_CONTROL_MAX_BYTES) {
        helper.carry = "";
        this.fail(helper, "control frame exceeds its limit");
        return;
      }
      const line = helper.carry.slice(0, newline);
      helper.carry = helper.carry.slice(newline + 1);
      this.reply(helper, line);
      if (!this.helpers.has(helper)) return;
    }
    if (helper.carry.length >= PTY_JOB_CONTROL_MAX_BYTES) {
      helper.carry = "";
      this.fail(helper, "control frame exceeds its limit");
    }
  }

  private reply(helper: ManagedHelper, line: string): void {
    // Replies after assignment or dispose (retired-v1 and strays) are ignored.
    if (helper.settle === null) return;
    const parsed = ptyJobReplySchema.safeParse(line.split(" "));
    if (!parsed.success || parsed.data[1] !== helper.nonce) {
      this.fail(helper, "control identity or protocol differs");
      return;
    }
    const reply = parsed.data;
    switch (helper.phase) {
      case "ready":
        if (reply[0] === "ready-v1") {
          helper.phase = "bound";
          this.write(helper, `bind-v1 ${helper.nonce}`);
          return;
        }
        break;
      case "bound":
        if (reply[0] === "bound-v1") {
          helper.phase = "prepared";
          this.write(helper, `prepare-v1 ${helper.nonce} 1 ${helper.pid}`);
          return;
        }
        break;
      case "prepared":
        if (reply[0] === "prepared-v1" && reply[2] === "1" && reply[3] === String(helper.pid)) {
          helper.phase = "assigned";
          helper.assignmentRequested = true;
          this.write(helper, `assign-v1 ${helper.nonce} 1`);
          return;
        }
        break;
      case "assigned":
        if (reply[0] === "assigned-v1" && reply[2] === "1" && reply[3] === String(helper.pid)) {
          if (helper.timer) clearTimeout(helper.timer);
          const settle = helper.settle;
          helper.settle = null;
          settle.resolve();
          return;
        }
        break;
    }
    if (reply[0] === "error-v1") {
      this.fail(helper, `helper refused: ${reply[2]}`);
      return;
    }
    this.fail(helper, `unexpected control reply: ${reply[0]}`);
  }

  private write(helper: ManagedHelper, command: string): void {
    try {
      helper.child.stdin.write(`${command}\n`, (error) => {
        if (error) this.fail(helper, "control write failed");
      });
    } catch {
      this.fail(helper, "control write failed");
    }
  }

  private fail(helper: ManagedHelper, reason: string): void {
    const stderrTail = helper.stderrTail.trim();
    const error = new Error(
      `Windows job object helper failed: ${reason}.${stderrTail ? ` ${stderrTail}` : ""}`,
    );
    if (helper.assignmentRequested) {
      // The kernel may already have put the backend into the job; killing the
      // helper would kill it too. Reject the pending assignment but keep the
      // helper so dispose() still closes it — and the job — cleanly.
      if (helper.timer) clearTimeout(helper.timer);
      helper.settle?.reject(error);
      helper.settle = null;
      return;
    }
    if (!this.helpers.delete(helper)) return;
    if (helper.timer) clearTimeout(helper.timer);
    helper.settle?.reject(error);
    helper.settle = null;
    if (helper.child.exitCode === null && helper.child.signalCode === null) {
      helper.child.kill();
    }
  }

  private exited(helper: ManagedHelper, code: number | null, signal: NodeJS.Signals | null): void {
    if (!this.helpers.has(helper)) return;
    const detail =
      code !== null
        ? `exited with code ${code}`
        : signal
          ? `exited with signal ${signal}`
          : "exited unexpectedly";
    if (helper.settle !== null) {
      this.fail(helper, `helper ${detail} before assignment`);
      return;
    }
    this.helpers.delete(helper);
    if (!this.isDisposed) {
      console.error(`[poracode] Windows job object helper ${detail}.`);
    }
  }
}

export function createWindowsJobObjectOwner(
  resourceRoot: string,
  arch: string = process.arch,
): WindowsJobObjectOwner {
  if (arch === "x64" || arch === "arm64") {
    try {
      const { path } = readPtyJobOwnerArtifact(
        resourceRoot,
        arch === "arm64" ? "win32-arm64" : "win32-x64",
      );
      console.info("[poracode] Windows job object owner: bundled pty-job-owner helper");
      return new NativeWindowsJobObjectManager(path);
    } catch (error) {
      console.warn(
        "[poracode] bundled pty-job-owner helper unavailable; using the PowerShell job object helper:",
        error instanceof Error ? error.message : String(error),
      );
    }
  } else {
    console.warn(
      `[poracode] no bundled pty-job-owner helper for ${arch}; using the PowerShell job object helper`,
    );
  }
  console.info("[poracode] Windows job object owner: PowerShell helper");
  return new WindowsJobObjectManager();
}
