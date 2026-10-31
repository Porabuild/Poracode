import { describe, expect, it, vi } from "vitest";
import { isInteractiveInvocation, resolveInteractiveStdin } from "./cliConsole";

const windowsDesktopCli = {
  platform: "win32" as const,
  stdinIsTTY: false,
  stdoutIsTTY: true,
  stdinIsCharacterDevice: () => true,
};

describe("interactive console detection", () => {
  it("inherits a terminal stdin without reopening the console", () => {
    const openConsoleInput = vi.fn<() => number>(() => 5);
    expect(
      resolveInteractiveStdin({ ...windowsDesktopCli, stdinIsTTY: true, openConsoleInput }),
    ).toBe("inherit");
    expect(openConsoleInput).not.toHaveBeenCalled();
  });

  it("reopens the Windows console input when Electron-as-Node left stdin on NUL", () => {
    expect(resolveInteractiveStdin({ ...windowsDesktopCli, openConsoleInput: () => 5 })).toBe(5);
  });

  it("keeps piped, redirected, detached and non-terminal invocations non-interactive", () => {
    const openConsoleInput = vi.fn<() => number>(() => 5);
    expect(
      resolveInteractiveStdin({
        ...windowsDesktopCli,
        stdinIsCharacterDevice: () => false,
        openConsoleInput,
      }),
    ).toBeUndefined();
    expect(
      resolveInteractiveStdin({ ...windowsDesktopCli, stdoutIsTTY: false, openConsoleInput }),
    ).toBeUndefined();
    expect(
      resolveInteractiveStdin({ ...windowsDesktopCli, platform: "linux", openConsoleInput }),
    ).toBeUndefined();
    expect(openConsoleInput).not.toHaveBeenCalled();
    expect(
      resolveInteractiveStdin({ ...windowsDesktopCli, openConsoleInput: () => undefined }),
    ).toBeUndefined();
  });

  it("routes bare launches to the TUI and releases the probe descriptor", () => {
    const closeDescriptor = vi.fn<(descriptor: number) => void>();
    expect(
      isInteractiveInvocation({ ...windowsDesktopCli, openConsoleInput: () => 5, closeDescriptor }),
    ).toBe(true);
    expect(
      isInteractiveInvocation({
        ...windowsDesktopCli,
        stdinIsCharacterDevice: () => false,
        closeDescriptor,
      }),
    ).toBe(false);
    expect(closeDescriptor).toHaveBeenCalledExactlyOnceWith(5);
  });
});
