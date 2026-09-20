import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { TerminalSnapshot } from "@/shared/contracts";

vi.mock("../nodePty", () => ({ ensureNodePtySpawnHelperExecutable: () => undefined }));
vi.mock("@/shared/processTree", () => ({ terminateProcessTree: () => undefined }));
vi.mock("../agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../agents/base")>()),
  primeProjectShellEnv: async () => undefined,
}));
vi.mock("node-pty", () => ({
  spawn: () => ({
    pid: process.pid,
    cols: 80,
    rows: 24,
    kill: () => undefined,
    onData: () => undefined,
    onExit: () => undefined,
    write: () => undefined,
  }),
}));

import { ThreadSessionManager } from "./threadSessionManager";

it("installs the new shell generation before snapshot reads queued by its reset", async () => {
  const parent = join(process.cwd(), "tmp", ".tmp");
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "shell-watch-order-"));
  const snapshots: Array<TerminalSnapshot | null> = [];
  const shellId = "shell:watch-order";
  const manager = new ThreadSessionManager({
    emit: (event) => {
      if (event.type === "thread-reset" && event.threadId === shellId) {
        // Remote watch installation responds asynchronously to the reset.
        // Even a microtask must see the new PTY, not a cleared-map window.
        queueMicrotask(() => snapshots.push(manager.readTerminalSnapshot(shellId)));
      }
    },
    isDev: false,
    logsDir: join(dir, "logs"),
    settingsPath: join(dir, "settings.json"),
    readDisableCliHookPlugin: () => false,
    adapters: new Map(),
    resolveWindowsShell: () => ({ shell: "cmd.exe", kind: "cmd", args: [] }),
  });
  try {
    const payload = { shellId, projectLocation: { kind: "posix" as const, path: dir } };
    await manager.startShell(payload);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ processState: "running", data: "", toCursor: 0 });
    const firstGeneration = snapshots[0]?.generation;
    expect(firstGeneration).toBeTruthy();

    await manager.startShell(payload);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toMatchObject({
      processState: "running",
      generation: manager.shellSessions.get(shellId)?.instanceId,
    });
    expect(snapshots[1]?.generation).not.toBe(firstGeneration);
  } finally {
    await manager.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
});
