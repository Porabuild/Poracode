import { beforeEach, describe, expect, it, vi } from "vitest";
import { runGitSyncCommand, showGitActionError } from "./gitCommandRunner";

const bridgeMock = vi.hoisted(() => ({
  gitPull: vi.fn<() => Promise<void>>(),
  gitPullRebase: vi.fn<() => Promise<void>>(),
  gitPush: vi.fn<() => Promise<void>>(),
  gitSync: vi.fn<() => Promise<void>>(),
  gitSyncRebase: vi.fn<() => Promise<void>>(),
}));

const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
}));

const captureRendererExceptionMock = vi.hoisted(() => vi.fn<() => void>());

vi.mock("@heroui/react", () => ({
  toast: toastMock,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
}));

vi.mock("@/renderer/diagnostics/sentry", () => ({
  captureRendererException: captureRendererExceptionMock,
}));

const projectLocation = { kind: "posix" as const, path: "/repo" };

describe("gitCommandRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes push commands through the shared bridge payload builder", async () => {
    bridgeMock.gitPush.mockResolvedValueOnce(undefined);

    await runGitSyncCommand({
      command: "push",
      projectLocation,
      remote: "origin",
      branch: "feature/a",
      setUpstream: true,
    });

    expect(bridgeMock.gitPush).toHaveBeenCalledWith({
      projectLocation,
      remote: "origin",
      branch: "feature/a",
      setUpstream: true,
    });
  });

  it("shows shared git action errors and captures only when requested", () => {
    const error = new Error("pull failed");

    showGitActionError(error, { capture: true });

    expect(toastMock.danger).toHaveBeenCalledWith("pull failed");
    expect(captureRendererExceptionMock).toHaveBeenCalledWith(error, {
      featureArea: "git",
    });
  });
});
