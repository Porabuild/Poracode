import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";

const bridge = vi.hoisted(() => ({
  onSupervisorEvent: vi.fn<(handler: (event: SupervisorEvent) => void) => () => void>(),
  writeTerminal: vi.fn<(payload: { threadId: string; data: string }) => Promise<void>>(),
  startShell: vi.fn<(payload: unknown) => Promise<void>>(),
  closeThread: vi.fn<(payload: { threadId: string }) => Promise<void>>(),
}));

const supervisorHandlers = vi.hoisted(() => [] as Array<(event: SupervisorEvent) => void>);

vi.mock("@heroui/react", () => ({
  toast: {
    danger: vi.fn<(message: string) => void>(),
    success: vi.fn<(message: string) => void>(),
    warning: vi.fn<(message: string) => void>(),
  },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

import {
  appendExitOnSuccess,
  buildScriptWithExitOnSuccess,
  clearEagerShellStart,
  closeThreads,
  startShellWithToast,
  wasShellStartedEagerly,
  writeScriptToShell,
  writeScriptToShellThenExitOnSuccess,
} from "./shellUtils";

function emit(event: SupervisorEvent) {
  for (const handler of [...supervisorHandlers]) handler(event);
}

function lastWrite(): string {
  return bridge.writeTerminal.mock.calls.at(-1)?.[0].data ?? "";
}

describe("appendExitOnSuccess", () => {
  it("uses `&& exit` for posix shells (exit is a command)", () => {
    expect(appendExitOnSuccess("npm ci", "posix")).toBe("npm ci && exit");
  });

  it("uses `&& exit` for wsl (runs bash even on a Windows host)", () => {
    expect(appendExitOnSuccess("npm ci", "wsl")).toBe("npm ci && exit");
  });

  it("uses a conditional statement for native Windows (PowerShell `exit` is a keyword)", () => {
    expect(appendExitOnSuccess("npm ci", "windows")).toBe("npm ci; if ($?) { exit }");
  });
});

describe("buildScriptWithExitOnSuccess", () => {
  it("uses `&&` for multi-line posix scripts", () => {
    expect(buildScriptWithExitOnSuccess("npm install\nnpm run setup", "posix")).toBe(
      "npm install && npm run setup && exit",
    );
  });

  it("uses PowerShell-compatible success guards for multi-line Windows scripts", () => {
    expect(buildScriptWithExitOnSuccess("npm install\nnpm run setup", "windows")).toBe(
      "npm install; if ($?) { npm run setup; if ($?) { exit } }",
    );
  });

  it("returns an empty command for blank scripts", () => {
    expect(buildScriptWithExitOnSuccess("# nope\n\n", "windows")).toBe("");
  });
});

describe("eager shell start registry", () => {
  beforeEach(() => {
    bridge.startShell.mockReset().mockResolvedValue(undefined);
    bridge.closeThread.mockReset().mockResolvedValue(undefined);
  });

  it("marks shells started via startShellWithToast and clears them on close", async () => {
    startShellWithToast(
      { shellId: "shell:eager", projectLocation: { kind: "windows", path: "C:\\p" } },
      "dev",
    );
    expect(wasShellStartedEagerly("shell:eager")).toBe(true);
    expect(wasShellStartedEagerly("shell:other")).toBe(false);

    await closeThreads(["shell:eager"]);
    expect(wasShellStartedEagerly("shell:eager")).toBe(false);
  });

  it("clears entries via clearEagerShellStart", () => {
    startShellWithToast(
      { shellId: "shell:eager2", projectLocation: { kind: "windows", path: "C:\\p" } },
      "dev",
    );
    clearEagerShellStart("shell:eager2");
    expect(wasShellStartedEagerly("shell:eager2")).toBe(false);
  });
});

describe("writeScriptToShell", () => {
  beforeEach(() => {
    supervisorHandlers.length = 0;
    bridge.writeTerminal.mockReset().mockResolvedValue(undefined);
    bridge.onSupervisorEvent.mockReset().mockImplementation((handler) => {
      supervisorHandlers.push(handler);
      return () => {
        const index = supervisorHandlers.indexOf(handler);
        if (index >= 0) supervisorHandlers.splice(index, 1);
      };
    });
  });

  it("writes the normalized command on first output", () => {
    writeScriptToShell("shell:1", "npm install\nnpm run dev");

    emit({ type: "thread-output", threadId: "shell:1", data: "$ ", outputLength: 2 });
    emit({ type: "thread-output", threadId: "shell:1", data: "more", outputLength: 6 });

    expect(bridge.writeTerminal).toHaveBeenCalledTimes(1);
    expect(lastWrite()).toBe("npm install && npm run dev\r");
  });

  it("re-sends the command after a thread-reset (PTY respawn)", () => {
    writeScriptToShell("shell:1", "npm run dev");

    emit({ type: "thread-output", threadId: "shell:1", data: "$ ", outputLength: 2 });
    expect(bridge.writeTerminal).toHaveBeenCalledTimes(1);

    // The terminal panel's viewport-sized respawn replaces the PTY the
    // command was written to; it must land again in the survivor.
    emit({ type: "thread-reset", threadId: "shell:1" });
    emit({ type: "thread-output", threadId: "shell:1", data: "$ ", outputLength: 2 });

    expect(bridge.writeTerminal).toHaveBeenCalledTimes(2);
    expect(lastWrite()).toBe("npm run dev\r");
  });

  it("stops listening once the shell exits", () => {
    writeScriptToShell("shell:1", "npm run dev");

    emit({ type: "thread-output", threadId: "shell:1", data: "$ ", outputLength: 2 });
    emit({ type: "thread-exited", threadId: "shell:1", exitCode: 0 });

    expect(supervisorHandlers).toHaveLength(0);
  });

  it("ignores events for other shells", () => {
    writeScriptToShell("shell:1", "npm run dev");

    emit({ type: "thread-output", threadId: "shell:2", data: "$ ", outputLength: 2 });

    expect(bridge.writeTerminal).not.toHaveBeenCalled();
  });
});

describe("writeScriptToShellThenExitOnSuccess", () => {
  beforeEach(() => {
    supervisorHandlers.length = 0;
    bridge.writeTerminal.mockReset().mockResolvedValue(undefined);
    bridge.onSupervisorEvent.mockReset().mockImplementation((handler) => {
      supervisorHandlers.push(handler);
      return () => {
        const index = supervisorHandlers.indexOf(handler);
        if (index >= 0) supervisorHandlers.splice(index, 1);
      };
    });
  });

  it("writes the normalized chain with a posix exit tail on first output", () => {
    writeScriptToShellThenExitOnSuccess("shell:1", "npm install\nnpm run setup", "posix", () => {});

    emit({ type: "thread-output", threadId: "shell:1", data: "$ ", outputLength: 2 });

    expect(bridge.writeTerminal).toHaveBeenCalledTimes(1);
    expect(lastWrite()).toBe("npm install && npm run setup && exit\r");
  });

  it("writes a PowerShell conditional exit tail for native Windows shells", () => {
    writeScriptToShellThenExitOnSuccess("shell:1", "npm ci", "windows", () => {});

    emit({ type: "thread-output", threadId: "shell:1", data: "PS> ", outputLength: 4 });

    expect(lastWrite()).toBe("npm ci; if ($?) { exit }\r");
  });

  it("writes a PowerShell-compatible guarded chain for native Windows shells", () => {
    writeScriptToShellThenExitOnSuccess(
      "shell:1",
      "npm install\nnpm run setup",
      "windows",
      () => {},
    );

    emit({ type: "thread-output", threadId: "shell:1", data: "PS> ", outputLength: 4 });

    expect(lastWrite()).toBe("npm install; if ($?) { npm run setup; if ($?) { exit } }\r");
  });

  it("strips comments and blank lines before joining", () => {
    writeScriptToShellThenExitOnSuccess("shell:1", "# bootstrap\n\nnpm ci\n", "posix", () => {});

    emit({ type: "thread-output", threadId: "shell:1", data: "ready", outputLength: 5 });

    expect(lastWrite()).toBe("npm ci && exit\r");
  });

  it("only writes once per PTY, ignoring subsequent output", () => {
    writeScriptToShellThenExitOnSuccess("shell:1", "echo hi", "posix", () => {});

    emit({ type: "thread-output", threadId: "shell:1", data: "$ ", outputLength: 2 });
    emit({ type: "thread-output", threadId: "shell:1", data: "more", outputLength: 6 });

    expect(bridge.writeTerminal).toHaveBeenCalledTimes(1);
  });

  it("re-sends the command after a thread-reset (PTY respawn)", () => {
    writeScriptToShellThenExitOnSuccess("shell:1", "echo hi", "posix", () => {});

    emit({ type: "thread-output", threadId: "shell:1", data: "$ ", outputLength: 2 });
    expect(bridge.writeTerminal).toHaveBeenCalledTimes(1);

    // A viewport-sized respawn replaces the PTY; the command must land again.
    emit({ type: "thread-reset", threadId: "shell:1" });
    emit({ type: "thread-output", threadId: "shell:1", data: "$ ", outputLength: 2 });

    expect(bridge.writeTerminal).toHaveBeenCalledTimes(2);
    expect(lastWrite()).toBe("echo hi && exit\r");
  });

  it("invokes onExit with the exit code and stops listening", () => {
    const onExit = vi.fn<(exitCode: number | null) => void>();
    writeScriptToShellThenExitOnSuccess("shell:1", "echo hi", "posix", onExit);

    emit({ type: "thread-output", threadId: "shell:1", data: "$ ", outputLength: 2 });
    emit({ type: "thread-exited", threadId: "shell:1", exitCode: 0 });

    expect(onExit).toHaveBeenCalledWith(0);
    expect(supervisorHandlers).toHaveLength(0);
  });

  it("reports a failed command without closing its shell", () => {
    const onExit = vi.fn<(exitCode: number | null) => void>();
    const onCommandComplete = vi.fn<(exitCode: number) => void>();
    writeScriptToShellThenExitOnSuccess(
      "shell:1",
      "npm install\nnpm run setup",
      "posix",
      onExit,
      onCommandComplete,
    );

    emit({ type: "thread-output", threadId: "shell:1", data: "$ ", outputLength: 2 });
    const token = /poracode-shell-complete=([^:]+):/u.exec(lastWrite())?.[1];
    expect(token).toBeTruthy();
    expect(lastWrite()).toContain('if [ "$__poracode_setup_exit" -eq 0 ]; then exit; fi');

    const marker = `\u001B]777;poracode-shell-complete=${token}:1\u0007`;
    emit({ type: "thread-output", threadId: "shell:1", data: marker, outputLength: marker.length });

    expect(onCommandComplete).toHaveBeenCalledWith(1);
    expect(onExit).not.toHaveBeenCalled();
    expect(supervisorHandlers).toHaveLength(1);
  });

  it("reports command completion only once when a successful shell exits", () => {
    const onExit = vi.fn<(exitCode: number | null) => void>();
    const onCommandComplete = vi.fn<(exitCode: number) => void>();
    writeScriptToShellThenExitOnSuccess(
      "shell:1",
      "npm install",
      "windows",
      onExit,
      onCommandComplete,
    );

    emit({ type: "thread-output", threadId: "shell:1", data: "PS> ", outputLength: 4 });
    const token = /poracode-shell-complete=([^:]+):/u.exec(lastWrite())?.[1];
    const marker = `\u001B]777;poracode-shell-complete=${token}:0\u0007`;
    emit({ type: "thread-output", threadId: "shell:1", data: marker, outputLength: marker.length });
    emit({ type: "thread-exited", threadId: "shell:1", exitCode: 0 });

    expect(onCommandComplete).toHaveBeenCalledTimes(1);
    expect(onCommandComplete).toHaveBeenCalledWith(0);
    expect(onExit).toHaveBeenCalledWith(0);
    expect(supervisorHandlers).toHaveLength(0);
  });

  it("ignores events for other shells", () => {
    const onExit = vi.fn<(exitCode: number | null) => void>();
    writeScriptToShellThenExitOnSuccess("shell:1", "echo hi", "posix", onExit);

    emit({ type: "thread-output", threadId: "shell:2", data: "$ ", outputLength: 2 });
    emit({ type: "thread-exited", threadId: "shell:2", exitCode: 0 });

    expect(bridge.writeTerminal).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
  });

  it("detach() unsubscribes so no command is written afterward", () => {
    const detach = writeScriptToShellThenExitOnSuccess("shell:1", "echo hi", "posix", () => {});

    detach();
    emit({ type: "thread-output", threadId: "shell:1", data: "$ ", outputLength: 2 });

    expect(bridge.writeTerminal).not.toHaveBeenCalled();
    expect(supervisorHandlers).toHaveLength(0);
  });

  it("is a no-op for blank / comments-only scripts", () => {
    const onExit = vi.fn<(exitCode: number | null) => void>();
    const detach = writeScriptToShellThenExitOnSuccess(
      "shell:1",
      "# only a comment\n\n",
      "posix",
      onExit,
    );

    expect(bridge.onSupervisorEvent).not.toHaveBeenCalled();
    expect(() => detach()).not.toThrow();
    expect(onExit).not.toHaveBeenCalled();
  });
});
