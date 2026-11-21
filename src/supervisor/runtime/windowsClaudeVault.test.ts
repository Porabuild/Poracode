import { afterEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() =>
  vi.fn<
    (
      file: string,
      args: string[],
      options: unknown,
      callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void,
    ) => void
  >(),
);

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import {
  resetWindowsCredentialPresenceCacheForTests,
  windowsCredentialTargetExists,
} from "./windowsClaudeVault";

function succeed(stdout: string) {
  execFileMock.mockImplementation(
    (
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      callback(null, { stdout, stderr: "" });
    },
  );
}

describe("windowsCredentialTargetExists", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    resetWindowsCredentialPresenceCacheForTests();
    execFileMock.mockReset();
  });

  it("does not query Credential Manager off Windows or for an unsafe target", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    await expect(windowsCredentialTargetExists("gemini-cli-api-key/default-api-key")).resolves.toBe(
      false,
    );
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    await expect(windowsCredentialTargetExists("gemini\ncli")).resolves.toBe(false);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("treats an exact yes as present and any other result as absent", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    succeed("yes");
    await expect(windowsCredentialTargetExists("gemini-cli-api-key/default-api-key")).resolves.toBe(
      true,
    );

    resetWindowsCredentialPresenceCacheForTests();
    succeed("no");
    await expect(windowsCredentialTargetExists("gemini-cli-api-key/default-api-key")).resolves.toBe(
      false,
    );

    resetWindowsCredentialPresenceCacheForTests();
    execFileMock.mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void,
      ) => {
        callback(new Error("powershell failed"));
      },
    );
    await expect(windowsCredentialTargetExists("gemini-cli-api-key/default-api-key")).resolves.toBe(
      false,
    );
  });

  it("shares one in-flight query and reuses a confirmed result", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    execFileMock.mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, result: { stdout: string; stderr: string }) => void,
      ) => {
        void gate.then(() => callback(null, { stdout: "yes", stderr: "" }));
      },
    );

    const first = windowsCredentialTargetExists("gemini-cli-api-key/default-api-key");
    const second = windowsCredentialTargetExists("gemini-cli-api-key/default-api-key");
    release?.();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(execFileMock).toHaveBeenCalledTimes(1);

    execFileMock.mockClear();
    await expect(windowsCredentialTargetExists("gemini-cli-api-key/default-api-key")).resolves.toBe(
      true,
    );
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
