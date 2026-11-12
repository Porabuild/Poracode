import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import { HostResourceAdmissionOwner } from "./hostResourceAdmission";

interface FakePtyRecord {
  pid: number;
  cols: number;
  rows: number;
  killed: boolean;
  writes: string[];
  kill: () => void;
  emitData: (chunk: string) => void;
  emitExit: (exitCode?: number | null) => void;
}

const ptyState = vi.hoisted(() => ({
  nextPid: 4_000,
  records: [] as FakePtyRecord[],
}));

vi.mock("../nodePty", () => ({ ensureNodePtySpawnHelperExecutable: () => undefined }));
vi.mock("@/shared/processTree", () => ({
  terminateProcessTree: (pid: number) => {
    ptyState.records.find((record) => record.pid === pid)?.kill();
  },
}));
vi.mock("../agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../agents/base")>()),
  primeProjectShellEnv: vi.fn<typeof import("../agents/base").primeProjectShellEnv>(
    async () => undefined,
  ),
}));

vi.mock("node-pty", () => ({
  spawn: (_file: string, _args: string[], options: { cols?: number; rows?: number }) => {
    const dataHandlers: Array<(data: string) => void> = [];
    const exitHandlers: Array<(event: { exitCode: number | null }) => void> = [];
    const record: FakePtyRecord = {
      pid: ptyState.nextPid++,
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      killed: false,
      writes: [],
      kill: () => {
        if (record.killed) return;
        record.killed = true;
        record.emitExit(0);
      },
      emitData: (chunk: string) => {
        for (const handler of [...dataHandlers]) handler(chunk);
      },
      emitExit: (exitCode = 0) => {
        for (const handler of [...exitHandlers]) handler({ exitCode });
      },
    };
    ptyState.records.push(record);
    return {
      get pid() {
        return record.pid;
      },
      get cols() {
        return record.cols;
      },
      get rows() {
        return record.rows;
      },
      resize: (cols: number, rows: number) => {
        record.cols = cols;
        record.rows = rows;
      },
      kill: () => {
        record.kill();
      },
      onData: (handler: (data: string) => void) => {
        dataHandlers.push(handler);
      },
      onExit: (handler: (event: { exitCode: number | null }) => void) => {
        exitHandlers.push(handler);
      },
      write: (data: string) => {
        record.writes.push(data);
      },
    };
  },
}));

import { ThreadSessionManager } from "./threadSessionManager";

describe("ThreadSessionManager idle shell suspension", () => {
  afterEach(() => {
    vi.useRealTimers();
    ptyState.records.length = 0;
  });

  function createTempDir() {
    const parent = join(process.cwd(), "tmp", ".tmp");
    mkdirSync(parent, { recursive: true });
    return mkdtempSync(join(parent, "shell-idle-suspend-"));
  }

  it("suspends an idle shell with no child processes, releases its slot, and wakes seamlessly on concurrent input", async () => {
    vi.useFakeTimers();
    const dir = createTempDir();
    const events: SupervisorEvent[] = [];
    const admission = new HostResourceAdmissionOwner(() => ({
      maxActiveAgentSessions: 8,
      maxActiveTerminalShells: 1,
      maxActiveGenerationHelpers: 2,
      overloadRetryAfterMs: 1_000,
    }));
    const childCheck = vi.fn<
      typeof import("./threadSession/shellIdleCheck").hasShellChildProcesses
    >(async () => false);
    const manager = new ThreadSessionManager({
      emit: (event) => events.push(event),
      isDev: false,
      logsDir: join(dir, "logs"),
      settingsPath: join(dir, "settings.json"),
      readDisableCliHookPlugin: () => false,
      adapters: new Map(),
      admission,
      shellIdleTimeoutMs: 500,
      hasShellChildProcesses: childCheck,
      resolveWindowsShell: () => ({ shell: "pwsh.exe", kind: "pwsh", args: [] }),
    });

    try {
      const shellId = "shell:dev-1";
      await manager.startShell({
        shellId,
        projectLocation: { kind: "posix", path: dir },
        initialSize: { cols: 100, rows: 32 },
      });

      expect(ptyState.records).toHaveLength(1);
      const initialPty = ptyState.records[0]!;
      initialPty.emitData("PS E:\\work> ");
      const originalGeneration = manager.shellSessions.get(shellId)?.instanceId;
      expect(originalGeneration).toBeTruthy();
      expect(admission.usage().terminalShells.active).toBe(1);

      await vi.advanceTimersByTimeAsync(550);

      expect(childCheck).toHaveBeenCalledWith(initialPty.pid, { kind: "posix", path: dir });
      expect(initialPty.killed).toBe(true);
      expect(manager.shellSessions.has(shellId)).toBe(false);
      expect(manager.suspendedShells.has(shellId)).toBe(true);
      // Host execution slot is freed while suspended, and no fake thread-exited event was emitted.
      expect(admission.usage().terminalShells.active).toBe(0);
      expect(events.some((e) => e.type === "thread-exited")).toBe(false);

      // Snapshot, scrollback, shell listing, and resize continue working seamlessly while suspended.
      await manager.resizeTerminal({ threadId: shellId, cols: 132, rows: 40 });
      expect(manager.readTerminalScrollback(shellId)).toBe("PS E:\\work> ");
      expect(manager.getTerminalShellSnapshots()).toEqual([
        {
          terminalId: shellId,
          projectLocation: { kind: "posix", path: dir },
          outputLength: "PS E:\\work> ".length,
        },
      ]);
      expect(manager.readTerminalSnapshot(shellId)).toEqual({
        generation: originalGeneration,
        fromCursor: 0,
        toCursor: "PS E:\\work> ".length,
        data: "PS E:\\work> ",
        processState: "running",
        terminalSize: { cols: 132, rows: 40 },
      });

      const resetsBeforeWake = events.filter((e) => e.type === "thread-reset").length;
      // Concurrent rapid keystrokes coalesce into a single PTY wake and preserve exact FIFO order.
      await Promise.all([
        manager.writeTerminal({ threadId: shellId, data: "e" }),
        manager.writeTerminal({ threadId: shellId, data: "c" }),
        manager.writeTerminal({ threadId: shellId, data: "h" }),
        manager.writeTerminal({ threadId: shellId, data: "o\r" }),
      ]);

      expect(ptyState.records).toHaveLength(2);
      const wokenPty = ptyState.records[1]!;
      expect(wokenPty.cols).toBe(132);
      expect(wokenPty.rows).toBe(40);
      expect(wokenPty.writes).toEqual(["e", "c", "h", "o\r"]);
      expect(events.filter((e) => e.type === "thread-reset").length).toBe(resetsBeforeWake);
      expect(manager.shellSessions.get(shellId)?.instanceId).toBe(originalGeneration);
      expect(manager.suspendedShells.has(shellId)).toBe(false);
      expect(admission.usage().terminalShells.active).toBe(1);
    } finally {
      await manager.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed when child processes exist or inspection throws, and cleans up suspended shells on close", async () => {
    vi.useFakeTimers();
    const dir = createTempDir();
    let mode: "busy" | "throw" | "idle" = "busy";
    const manager = new ThreadSessionManager({
      emit: () => undefined,
      isDev: false,
      logsDir: join(dir, "logs"),
      settingsPath: join(dir, "settings.json"),
      readDisableCliHookPlugin: () => false,
      adapters: new Map(),
      shellIdleTimeoutMs: 300,
      hasShellChildProcesses: async () => {
        if (mode === "throw") throw new Error("inspection failed");
        return mode === "busy";
      },
      resolveWindowsShell: () => ({ shell: "pwsh.exe", kind: "pwsh", args: [] }),
    });

    try {
      const shellId = "shell:dev-busy";
      await manager.startShell({
        shellId,
        projectLocation: { kind: "posix", path: dir },
      });

      await vi.advanceTimersByTimeAsync(350);
      expect(manager.shellSessions.has(shellId)).toBe(true);
      expect(manager.suspendedShells.has(shellId)).toBe(false);

      mode = "throw";
      await vi.advanceTimersByTimeAsync(350);
      expect(manager.shellSessions.has(shellId)).toBe(true);
      expect(manager.suspendedShells.has(shellId)).toBe(false);

      mode = "idle";
      await vi.advanceTimersByTimeAsync(350);
      expect(manager.shellSessions.has(shellId)).toBe(false);
      expect(manager.suspendedShells.has(shellId)).toBe(true);

      const closed = await manager.closeThreadConfirmed({ threadId: shellId });
      expect(closed.confirmed).toBe(true);
      expect(manager.suspendedShells.has(shellId)).toBe(false);
      expect(manager.readTerminalSnapshot(shellId)).toBeNull();
    } finally {
      await manager.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
