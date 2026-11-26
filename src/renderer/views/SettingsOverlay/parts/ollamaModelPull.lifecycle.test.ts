import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import type { OllamaModelPullCompletion } from "./ollamaModelPull";

type WriteScriptMock = (
  shellId: string,
  script: string,
  locationKind: string,
  onExit: (exitCode: number | null) => void,
  onCommandComplete?: (exitCode: number) => void,
  remoteServerId?: string,
  outputHandlers?: {
    onOutput: (output: string) => void;
    onReset: () => void;
    onCommandCompletion?: (exitCode: number, source: string) => void;
  },
) => () => void;

const mocks = vi.hoisted(() => ({
  startShell: vi.fn<(payload: unknown) => Promise<void>>(),
  writeScript: vi.fn<WriteScriptMock>(),
  disposeSession: vi.fn<(shellId: string) => void>(),
  closeThread: vi.fn<(payload: { threadId: string }) => Promise<void>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ closeThread: mocks.closeThread }),
}));

vi.mock("@/renderer/utils/shellUtils", () => ({
  startShellWithCurrentSettings: mocks.startShell,
  writeScriptToShellThenExitOnSuccess: mocks.writeScript,
  disposeRoutedShellSession: mocks.disposeSession,
}));

import { startOllamaModelPull } from "./ollamaModelPull";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project",
    name: "Mac mini",
    disabled: false,
    createdAt: new Date(0).toISOString(),
    location: { kind: "posix", path: "~" },
    ...overrides,
  };
}

function startPull(onComplete = vi.fn<(completion: OllamaModelPullCompletion) => void>()) {
  return {
    onComplete,
    handle: startOllamaModelPull({
      project: project(),
      tag: "fixture-model:smoke",
      onOutput: () => {},
      onComplete,
    }),
  };
}

describe("startOllamaModelPull lifecycle", () => {
  beforeEach(() => {
    mocks.startShell.mockReset().mockResolvedValue(undefined);
    mocks.writeScript.mockReset().mockReturnValue(() => undefined);
    mocks.disposeSession.mockReset();
    mocks.closeThread.mockReset().mockResolvedValue(undefined);
  });

  it("passes the exact selected remote owner through start and watcher routing", () => {
    const remoteProject = project({
      remoteServerId: "selected-connection",
      location: { kind: "posix", path: "~", remoteServerId: "stale-owner" },
    });
    startOllamaModelPull({
      project: remoteProject,
      tag: "fixture-model:smoke",
      remoteServerId: "selected-connection",
      onOutput: () => {},
      onComplete: () => {},
    });

    expect(mocks.startShell).toHaveBeenCalledWith(
      expect.objectContaining({
        startInHome: true,
        projectLocation: expect.objectContaining({ remoteServerId: "selected-connection" }),
      }),
    );
    expect(mocks.writeScript.mock.calls[0]?.[5]).toBe("selected-connection");
  });

  it("uses PowerShell explicitly for native Windows pulls", () => {
    startOllamaModelPull({
      project: project({ location: { kind: "windows", path: "." } }),
      tag: "fixture-model:smoke",
      onOutput: () => {},
      onComplete: () => {},
    });

    expect(mocks.startShell).toHaveBeenCalledWith(
      expect.objectContaining({ windowsShellRuntime: "powershell" }),
    );
  });

  it("treats only marker completion with exit code zero as success", () => {
    const { onComplete } = startPull();
    const handlers = mocks.writeScript.mock.calls[0]?.[6]!;

    handlers.onCommandCompletion!(0, "exit");
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ status: "failed", exitCode: 0 });
  });

  it("reports legitimate shell marker completion as success", () => {
    const { onComplete } = startPull();
    const handlers = mocks.writeScript.mock.calls[0]?.[6]!;

    handlers.onCommandCompletion!(0, "marker");
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ status: "success" });
  });

  it("orders cancellation close after the owned shell start settles", async () => {
    let finishStart!: () => void;
    mocks.startShell.mockReturnValue(
      new Promise<void>((resolve) => {
        finishStart = resolve;
      }),
    );
    const { handle } = startPull();

    const cancellation = handle.cancel();
    expect(mocks.closeThread).not.toHaveBeenCalled();
    finishStart();
    await cancellation;

    expect(mocks.closeThread).toHaveBeenCalledExactlyOnceWith({ threadId: handle.shellId });
  });

  it("keeps a denied cancellation retryable instead of confirming it", async () => {
    mocks.closeThread.mockRejectedValue(new Error("host offline"));
    const { handle } = startPull();

    await expect(handle.cancel()).rejects.toThrow("host offline");
    await expect(handle.cancel()).rejects.toThrow("host offline");
    expect(mocks.closeThread).toHaveBeenCalledTimes(2);
    expect(mocks.closeThread).toHaveBeenCalledWith({ threadId: handle.shellId });
  });
});
