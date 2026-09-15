import { rmSync } from "node:fs";
import type { ChildProcess } from "node:child_process";

export interface Disposable {
  stop(): Promise<void> | void;
}

export class ProcessCleanup {
  private readonly disposers: Array<() => Promise<void> | void> = [];
  private readonly children = new Set<ChildProcess>();
  private readonly tempDirs = new Set<string>();
  private readonly signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  private readonly shutdownTimeoutMs: number;
  private attached = false;
  private stopping = false;

  constructor(options?: { readonly shutdownTimeoutMs?: number }) {
    this.shutdownTimeoutMs = options?.shutdownTimeoutMs ?? 5_000;
  }

  add(disposer: () => Promise<void> | void): void {
    this.disposers.push(disposer);
  }

  trackChild(child: ChildProcess): void {
    this.children.add(child);
    child.once("exit", () => this.children.delete(child));
  }

  trackTempDir(dir: string): void {
    this.tempDirs.add(dir);
  }

  attachSignals(): void {
    if (this.attached) return;
    this.attached = true;
    for (const signal of this.signals) {
      process.on(signal, () => {
        void this.shutdown(signal);
      });
    }
    process.on("exit", () => {
      this.killChildren("SIGKILL");
      this.removeTempDirs();
    });
  }

  async shutdown(reason = "shutdown"): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    void reason;
    this.killChildren("SIGTERM");
    const deadline = Date.now() + this.shutdownTimeoutMs;
    while (this.children.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    this.killChildren("SIGKILL");
    for (const disposer of [...this.disposers].reverse()) {
      try {
        await disposer();
      } catch {
        // Best-effort shutdown.
      }
    }
    this.removeTempDirs();
  }

  private killChildren(signal: NodeJS.Signals): void {
    for (const child of this.children) {
      if (child.killed || child.exitCode !== null) continue;
      try {
        if (child.pid && (process.platform === "darwin" || process.platform === "linux")) {
          try {
            process.kill(-child.pid, signal);
            continue;
          } catch {
            // Fall back to the direct child.
          }
        }
        child.kill(signal);
      } catch {
        // Already gone.
      }
    }
  }

  private removeTempDirs(): void {
    for (const dir of this.tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort.
      }
    }
  }
}
