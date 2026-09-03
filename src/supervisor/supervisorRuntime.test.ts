import { describe, expect, it, vi } from "vitest";
import type { SessionRuntime } from "./runtime/sessionTypes";
import { SupervisorRuntime } from "./supervisorRuntime";

describe("SupervisorRuntime worktree removal preparation", () => {
  it("closes a WSL-backed thread by its logical Windows project path", async () => {
    const closeThread = vi.fn<(payload: { threadId: string }) => Promise<void>>(
      async () => undefined,
    );
    const runtime = Object.create(SupervisorRuntime.prototype) as unknown as {
      sessions: Map<string, SessionRuntime>;
      shellSessions: Map<string, never>;
      threadSessionManager: { closeThread: typeof closeThread };
      prepareWorktreeRemovals(paths: readonly string[]): Promise<void>;
    };
    runtime.sessions = new Map([
      [
        "thread-1",
        {
          logicalProjectLocation: { kind: "windows", path: "C:\\work\\project" },
          projectLocation: {
            kind: "wsl",
            distro: "Ubuntu",
            linuxPath: "/mnt/c/work/project",
            uncPath: "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\work\\project",
          },
        } as SessionRuntime,
      ],
    ]);
    runtime.shellSessions = new Map<string, never>();
    runtime.threadSessionManager = { closeThread };

    await runtime.prepareWorktreeRemovals(["C:\\work\\project"]);

    expect(closeThread).toHaveBeenCalledWith({ threadId: "thread-1" });
  });
});
