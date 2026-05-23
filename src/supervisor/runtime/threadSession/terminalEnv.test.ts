import { describe, expect, it, vi } from "vitest";

const spawnSyncMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());

vi.mock("node:child_process", async (importActual) => {
  const actual = await importActual<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: spawnSyncMock,
  };
});

async function loadTerminalEnv() {
  vi.resetModules();
  return import("./terminalEnv");
}

describe("resolveTerminalColorEnv", () => {
  it("falls back to xterm-256color when ghostty terminfo is unavailable", async () => {
    spawnSyncMock.mockReturnValue({ status: 1 });
    const { resolveTerminalColorEnv } = await loadTerminalEnv();

    expect(resolveTerminalColorEnv({ kind: "posix", path: "/repo" })).toEqual({
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    });
  });

  it.skipIf(process.platform === "win32")(
    "uses xterm-ghostty when the host terminfo entry is available",
    async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const { resolveTerminalColorEnv } = await loadTerminalEnv();

      expect(resolveTerminalColorEnv({ kind: "posix", path: "/repo" })).toEqual({
        TERM: "xterm-ghostty",
        COLORTERM: "truecolor",
      });
      expect(spawnSyncMock).toHaveBeenCalledWith(
        "infocmp",
        ["-x", "xterm-ghostty"],
        expect.objectContaining({ stdio: "ignore", windowsHide: true }),
      );
    },
  );

  it.skipIf(process.platform !== "win32")(
    "uses xterm-ghostty when the WSL terminfo entry is available",
    async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const { resolveTerminalColorEnv } = await loadTerminalEnv();

      expect(
        resolveTerminalColorEnv({
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
        }),
      ).toEqual({
        TERM: "xterm-ghostty",
        COLORTERM: "truecolor",
      });
      expect(spawnSyncMock).toHaveBeenCalledWith(
        expect.stringContaining("wsl"),
        ["-d", "Ubuntu", "--", "sh", "-lc", "infocmp -x xterm-ghostty >/dev/null 2>&1"],
        expect.objectContaining({ stdio: "ignore", windowsHide: true }),
      );
    },
  );
});

describe("getClaudeL2TerminalEnv", () => {
  it("spoofs iTerm for Claude when CLI hooks are not active", async () => {
    const { getClaudeL2TerminalEnv } = await loadTerminalEnv();

    expect(
      getClaudeL2TerminalEnv({
        agentKind: "claude",
        projectLocation: { kind: "windows", path: "C:\\repo" },
        disableCliHookPlugin: false,
        cliHookEnvInjected: false,
      }),
    ).toEqual({
      TERM_PROGRAM: "iTerm.app",
      TERM_PROGRAM_VERSION: "3.6.6",
    });
  });

  it("does not spoof iTerm for Claude while hooks are active", async () => {
    const { getClaudeL2TerminalEnv } = await loadTerminalEnv();

    expect(
      getClaudeL2TerminalEnv({
        agentKind: "claude",
        projectLocation: { kind: "windows", path: "C:\\repo" },
        disableCliHookPlugin: false,
        cliHookEnvInjected: true,
      }),
    ).toEqual({});
  });

  it("spoofs iTerm for Claude when hooks are injected but disabled", async () => {
    const { getClaudeL2TerminalEnv } = await loadTerminalEnv();

    expect(
      getClaudeL2TerminalEnv({
        agentKind: "claude",
        projectLocation: { kind: "windows", path: "C:\\repo" },
        disableCliHookPlugin: true,
        cliHookEnvInjected: true,
      }),
    ).toEqual({
      TERM_PROGRAM: "iTerm.app",
      TERM_PROGRAM_VERSION: "3.6.6",
    });
  });

  it("does not spoof iTerm for other agents", async () => {
    const { getClaudeL2TerminalEnv } = await loadTerminalEnv();

    expect(
      getClaudeL2TerminalEnv({
        agentKind: "codex",
        projectLocation: { kind: "windows", path: "C:\\repo" },
        disableCliHookPlugin: false,
        cliHookEnvInjected: false,
      }),
    ).toEqual({});
  });
});
