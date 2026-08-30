import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock, batchWslCommandsAsyncMock } = vi.hoisted(() => ({
  execFileMock:
    vi.fn<
      (
        cmd: string,
        args: string[],
        opts: object,
        cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
      ) => void
    >(),
  batchWslCommandsAsyncMock:
    vi.fn<(distro: string, commands: string[]) => Promise<{ ok: boolean; stdout: string }[]>>(),
}));

vi.mock("node:child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    opts: object,
    cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => execFileMock(cmd, args, opts, cb),
}));

vi.mock("../agents/base", () => ({
  getWslCommand: () => "wsl.exe",
  batchWslCommandsAsync: (distro: string, commands: string[]) =>
    batchWslCommandsAsyncMock(distro, commands),
}));

import {
  readAntigravityAcpCredsFromWsl,
  readClaudeCredsFromWsl,
  setWslCredentialProjectScope,
} from "./wslCredentials";

type ExecFileCallback = (err: Error | null, result: { stdout: string; stderr: string }) => void;

function distrosListed(names: string[]): void {
  execFileMock.mockImplementation(
    (_cmd: string, _args: string[], _opts: object, cb: ExecFileCallback) =>
      cb(null, { stdout: `${names.join("\n")}\n`, stderr: "" }),
  );
}

describe("wslCredentials project-scope gate", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    setWslCredentialProjectScope(undefined);
    execFileMock.mockReset();
    batchWslCommandsAsyncMock.mockReset();
  });

  it("skips all distro reads when no WSL project or session is active", async () => {
    const dispose = setWslCredentialProjectScope(() => false);
    await expect(readClaudeCredsFromWsl()).resolves.toBeUndefined();
    expect(execFileMock).not.toHaveBeenCalled();
    expect(batchWslCommandsAsyncMock).not.toHaveBeenCalled();

    dispose();
    distrosListed(["Ubuntu"]);
    batchWslCommandsAsyncMock.mockResolvedValue([{ ok: true, stdout: "token-json" }]);
    await expect(readClaudeCredsFromWsl()).resolves.toBe("token-json");
  });

  it("reads across distros and returns the first non-empty result when WSL is active", async () => {
    setWslCredentialProjectScope(() => true);
    distrosListed(["Ubuntu", "Debian"]);
    batchWslCommandsAsyncMock
      .mockResolvedValueOnce([{ ok: true, stdout: "" }])
      .mockResolvedValueOnce([{ ok: true, stdout: "  token-json  " }]);
    await expect(readClaudeCredsFromWsl()).resolves.toBe("token-json");
    expect(batchWslCommandsAsyncMock).toHaveBeenNthCalledWith(1, "Ubuntu", [
      "cat $HOME/.claude/.credentials.json 2>/dev/null",
    ]);
    expect(batchWslCommandsAsyncMock).toHaveBeenNthCalledWith(2, "Debian", [
      "cat $HOME/.claude/.credentials.json 2>/dev/null",
    ]);
  });

  it("stays unconstrained when no scope predicate is wired", async () => {
    distrosListed(["Ubuntu"]);
    batchWslCommandsAsyncMock.mockResolvedValue([{ ok: true, stdout: "token-json" }]);
    await expect(readClaudeCredsFromWsl()).resolves.toBe("token-json");
  });

  it("reads persisted Antigravity ACP credentials from a watched WSL context", async () => {
    setWslCredentialProjectScope(() => true);
    distrosListed(["Ubuntu"]);
    batchWslCommandsAsyncMock.mockResolvedValue([{ ok: true, stdout: "acp-token-json" }]);
    await expect(readAntigravityAcpCredsFromWsl()).resolves.toBe("acp-token-json");
    expect(batchWslCommandsAsyncMock).toHaveBeenCalledWith("Ubuntu", [
      "cat $HOME/.gemini/antigravity-acp/acp_token.json 2>/dev/null",
    ]);
  });
});
