import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranscriptBuffer } from "@/shared/transcriptBuffer";
import type { SessionRuntime, ShellSessionRuntime } from "./sessionTypes";
import { ThreadSessionManager } from "./threadSessionManager";

const managersToDispose: ThreadSessionManager[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.allSettled(managersToDispose.splice(0).map((m) => m.dispose()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createManager(): ThreadSessionManager {
  const tempDir = mkdtempSync(join(tmpdir(), "poracode-term-snapshot-"));
  tempDirs.push(tempDir);
  const manager = new ThreadSessionManager({
    emit: vi.fn<() => void>(),
    isDev: false,
    logsDir: join(tempDir, "logs"),
    settingsPath: join(tempDir, "settings.json"),
    readDisableCliHookPlugin: () => false,
    adapters: new Map(),
    windowsShell: { shell: "powershell.exe", kind: "powershell", args: ["-NoLogo"] },
  });
  managersToDispose.push(manager);
  return manager;
}

function terminalAdapter(): SessionRuntime["adapter"] {
  return {
    capabilities: { presentationMode: "terminal" },
  } as SessionRuntime["adapter"];
}

function guiAdapter(): SessionRuntime["adapter"] {
  return {
    capabilities: { presentationMode: "gui" },
  } as SessionRuntime["adapter"];
}

function mockPty(): NonNullable<SessionRuntime["pty"]> {
  return { cols: 80, rows: 24, pid: 1, kill: () => {}, resize: () => {} } as never;
}

describe("ThreadSessionManager.readTerminalSnapshot", () => {
  it("reports exited when the PTY lifecycle flag is set, not mere session presence", () => {
    const manager = createManager();
    const transcript = new TranscriptBuffer(200_000);
    transcript.append("done");
    const session = {
      instanceId: "inst-exited",
      threadId: "thread-exited",
      outputLength: 4,
      outputTranscript: transcript,
      terminalSize: { cols: 80, rows: 24 },
      pty: mockPty(),
      presentationMode: "terminal" as const,
      adapter: terminalAdapter(),
      ptyExited: true,
    } as SessionRuntime;
    manager.sessions.set("thread-exited", session);

    expect(manager.readTerminalSnapshot("thread-exited")).toMatchObject({
      generation: "inst-exited",
      processState: "exited",
      toCursor: 4,
      data: "done",
    });
  });

  it("reports running only while ptyExited is unset/false", () => {
    const manager = createManager();
    const transcript = new TranscriptBuffer(200_000);
    transcript.append("live");
    const session = {
      instanceId: "inst-live",
      threadId: "thread-live",
      outputLength: 4,
      outputTranscript: transcript,
      terminalSize: { cols: 100, rows: 40 },
      pty: mockPty(),
      presentationMode: "terminal" as const,
      adapter: terminalAdapter(),
      ptyExited: false,
    } as SessionRuntime;
    manager.sessions.set("thread-live", session);

    expect(manager.readTerminalSnapshot("thread-live")).toMatchObject({
      generation: "inst-live",
      processState: "running",
    });
  });

  it("returns null for GUI/structured sessions without a PTY so SQLite fallback can run", () => {
    const manager = createManager();
    const transcript = new TranscriptBuffer(200_000);
    transcript.append("gui-noise");
    const session = {
      instanceId: "inst-gui",
      threadId: "thread-gui",
      outputLength: 9,
      outputTranscript: transcript,
      terminalSize: { cols: 80, rows: 24 },
      // GUI structured runtimes often leave both pty and ptyExited undefined.
      presentationMode: "gui" as const,
      adapter: guiAdapter(),
      structuredSession: { dispose: async () => {} },
    } as unknown as SessionRuntime;
    manager.sessions.set("thread-gui", session);

    expect(manager.readTerminalSnapshot("thread-gui")).toBeNull();
  });

  it("returns null for GUI presentation even when a PTY is present so SQLite fallback can run", () => {
    // GUI + PTY must not shadow persisted scrollback with a live empty snapshot.
    const manager = createManager();
    const transcript = new TranscriptBuffer(200_000);
    transcript.append("gui-pty-noise");
    const session = {
      instanceId: "inst-gui-pty",
      threadId: "thread-gui-pty",
      outputLength: 13,
      outputTranscript: transcript,
      terminalSize: { cols: 80, rows: 24 },
      pty: mockPty(),
      presentationMode: "gui" as const,
      adapter: guiAdapter(),
      structuredSession: { dispose: async () => {} },
      ptyExited: false,
    } as unknown as SessionRuntime;
    manager.sessions.set("thread-gui-pty", session);

    expect(manager.readTerminalSnapshot("thread-gui-pty")).toBeNull();
  });

  it("returns null for expired retained shell snapshots and deletes them", () => {
    const manager = createManager();
    const retainedMap = (
      manager as unknown as {
        exitedShellSnapshots: Map<
          string,
          {
            threadId: string;
            generation: string;
            data: string;
            fromCursor: number;
            toCursor: number;
            terminalSize: { cols: number; rows: number } | null;
            retainedAt: number;
          }
        >;
      }
    ).exitedShellSnapshots;
    retainedMap.set("shell:expired", {
      threadId: "shell:expired",
      generation: "gen-expired",
      data: "stale",
      fromCursor: 0,
      toCursor: 5,
      terminalSize: { cols: 80, rows: 24 },
      // Far older than RETAINED_SHELL_SNAPSHOT_TTL_MS (24h).
      retainedAt: Date.now() - 48 * 60 * 60 * 1000,
    });

    expect(manager.readTerminalSnapshot("shell:expired")).toBeNull();
    expect(retainedMap.has("shell:expired")).toBe(false);
  });

  it("returns null for terminal presentation without an actual PTY", () => {
    const manager = createManager();
    const session = {
      instanceId: "inst-no-pty",
      threadId: "thread-no-pty",
      outputLength: 0,
      terminalSize: { cols: 80, rows: 24 },
      presentationMode: "terminal" as const,
      adapter: terminalAdapter(),
    } as SessionRuntime;
    manager.sessions.set("thread-no-pty", session);

    expect(manager.readTerminalSnapshot("thread-no-pty")).toBeNull();
  });

  it("still serves a terminal PTY when a helper structuredSession is also present", () => {
    const manager = createManager();
    const transcript = new TranscriptBuffer(200_000);
    transcript.append("both");
    const session = {
      instanceId: "inst-hybrid",
      threadId: "thread-hybrid",
      outputLength: 4,
      outputTranscript: transcript,
      terminalSize: { cols: 80, rows: 24 },
      pty: mockPty(),
      presentationMode: "terminal" as const,
      adapter: terminalAdapter(),
      structuredSession: { dispose: async () => {} },
      ptyExited: false,
    } as unknown as SessionRuntime;
    manager.sessions.set("thread-hybrid", session);

    expect(manager.readTerminalSnapshot("thread-hybrid")).toMatchObject({
      generation: "inst-hybrid",
      processState: "running",
      data: "both",
    });
  });

  it("uses adapter.capabilities.presentationMode when session.presentationMode is unset", () => {
    const manager = createManager();
    const transcript = new TranscriptBuffer(200_000);
    transcript.append("def");
    const session = {
      instanceId: "inst-adapter",
      threadId: "thread-adapter",
      outputLength: 3,
      outputTranscript: transcript,
      terminalSize: { cols: 80, rows: 24 },
      pty: mockPty(),
      adapter: terminalAdapter(),
      ptyExited: false,
    } as SessionRuntime;
    manager.sessions.set("thread-adapter", session);

    expect(manager.readTerminalSnapshot("thread-adapter")).toMatchObject({
      generation: "inst-adapter",
      processState: "running",
    });
  });

  it("applies the same PTY lifecycle flag to shell sessions", () => {
    const manager = createManager();
    const buffer = new TranscriptBuffer(200_000);
    buffer.append("sh");
    const shell = {
      shellId: "shell:1",
      instanceId: "shell-inst",
      outputLength: 2,
      outputTranscript: buffer,
      pty: { cols: 80, rows: 24 },
      ptyExited: true,
    } as unknown as ShellSessionRuntime;
    manager.shellSessions.set("shell:1", shell);

    expect(manager.readTerminalSnapshot("shell:1")).toMatchObject({
      generation: "shell-inst",
      processState: "exited",
    });
  });
});
