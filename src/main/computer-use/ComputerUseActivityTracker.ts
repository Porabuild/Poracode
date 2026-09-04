import type { ComputerUseActivityEvent } from "./ComputerUseMcpIngress";
import { isKeyChordToolName } from "./mcp/toolRegistry";

export type OverlayLevel = "hidden" | "badge" | "takeover";

export interface ComputerUseActivityState {
  badgeTarget?: string;
  escapeEnabled: boolean;
  level: OverlayLevel;
  threadIds: string[];
}

export interface ComputerUseActivityTrackerOptions {
  onChange(state: ComputerUseActivityState): void;
  releaseDelayMs: number;
}

interface ThreadCalls {
  background: number;
  foreground: number;
}

function releaseKey(threadId: string, delivery: "background" | "foreground"): string {
  return `${threadId}:${delivery}`;
}

/** Tracks sessions, overlapping calls, grace periods, and Escape suppression. */
export class ComputerUseActivityTracker {
  private readonly activeCalls = new Map<string, ThreadCalls>();
  private readonly activeSessions = new Set<string>();
  private readonly backgroundThreads = new Set<string>();
  private readonly foregroundThreads = new Set<string>();
  private readonly badgeTargets = new Map<string, string>();
  private escapeSuppressedCalls = 0;
  private readonly releaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly options: ComputerUseActivityTrackerOptions) {}

  setActivity(event: ComputerUseActivityEvent): void {
    if (event.kind === "session") {
      this.clearRelease(event.threadId, "background");
      if (event.active) {
        this.activeSessions.add(event.threadId);
        this.backgroundThreads.add(event.threadId);
      } else {
        this.activeSessions.delete(event.threadId);
        const calls = this.activeCalls.get(event.threadId);
        if (!calls?.background) this.backgroundThreads.delete(event.threadId);
        if (!calls?.foreground) {
          this.clearRelease(event.threadId, "foreground");
          this.foregroundThreads.delete(event.threadId);
        }
        if (!this.hasThread(event.threadId)) this.badgeTargets.delete(event.threadId);
      }
      this.notify();
      return;
    }

    const { threadId, delivery } = event;
    this.clearRelease(threadId, delivery);
    const calls = this.activeCalls.get(threadId) ?? { background: 0, foreground: 0 };
    if (event.active) {
      calls[delivery] += 1;
      this.activeCalls.set(threadId, calls);
      this.threadsFor(delivery).add(threadId);
      if (delivery === "foreground" && isKeyChordToolName(event.toolName)) {
        this.escapeSuppressedCalls += 1;
      }
      this.notify();
      return;
    }

    calls[delivery] = Math.max(0, calls[delivery] - 1);
    if (calls.background === 0 && calls.foreground === 0) this.activeCalls.delete(threadId);
    else this.activeCalls.set(threadId, calls);
    if (delivery === "foreground" && isKeyChordToolName(event.toolName)) {
      this.escapeSuppressedCalls = Math.max(0, this.escapeSuppressedCalls - 1);
    }
    if (delivery === "background" && event.target) {
      this.badgeTargets.set(threadId, event.target);
    }
    if (calls[delivery] === 0) {
      this.releaseTimers.set(
        releaseKey(threadId, delivery),
        setTimeout(() => {
          this.releaseTimers.delete(releaseKey(threadId, delivery));
          if (delivery === "background" && this.activeSessions.has(threadId)) return;
          this.threadsFor(delivery).delete(threadId);
          if (!this.hasThread(threadId)) this.badgeTargets.delete(threadId);
          this.notify();
        }, this.options.releaseDelayMs),
      );
    }
    this.notify();
  }

  getState(): ComputerUseActivityState {
    const level: OverlayLevel = this.foregroundThreads.size
      ? "takeover"
      : this.backgroundThreads.size
        ? "badge"
        : "hidden";
    const targets = [...this.badgeTargets.values()];
    const badgeTarget = targets.at(-1);
    return {
      level,
      escapeEnabled: level === "takeover" && this.escapeSuppressedCalls === 0,
      threadIds: [
        ...new Set([...this.activeSessions, ...this.backgroundThreads, ...this.foregroundThreads]),
      ],
      ...(badgeTarget ? { badgeTarget } : {}),
    };
  }

  clear(): void {
    for (const releaseTimer of this.releaseTimers.values()) clearTimeout(releaseTimer);
    this.releaseTimers.clear();
    this.activeCalls.clear();
    this.activeSessions.clear();
    this.backgroundThreads.clear();
    this.foregroundThreads.clear();
    this.badgeTargets.clear();
    this.escapeSuppressedCalls = 0;
    this.notify();
  }

  private threadsFor(delivery: "background" | "foreground"): Set<string> {
    return delivery === "foreground" ? this.foregroundThreads : this.backgroundThreads;
  }

  private clearRelease(threadId: string, delivery: "background" | "foreground"): void {
    const key = releaseKey(threadId, delivery);
    const timer = this.releaseTimers.get(key);
    if (!timer) return;
    clearTimeout(timer);
    this.releaseTimers.delete(key);
  }

  private hasThread(threadId: string): boolean {
    return (
      this.activeSessions.has(threadId) ||
      this.backgroundThreads.has(threadId) ||
      this.foregroundThreads.has(threadId)
    );
  }

  private notify(): void {
    this.options.onChange(this.getState());
  }
}
