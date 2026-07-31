import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMock = vi.hoisted(() => ({
  getGitDiff: vi.fn<(_payload: unknown) => Promise<{ diff: string }>>(),
  getGitFileContent:
    vi.fn<(_payload: unknown) => Promise<{ oldContent: string; newContent: string }>>(),
}));
const remoteSessionMock = vi.hoisted(() => vi.fn<() => boolean>());

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: remoteSessionMock,
  readBridge: () => bridgeMock,
}));

import { loadGitDiffForDisplay } from "./gitDiffLoader";

const payload = {
  projectLocation: { kind: "posix" as const, path: "/project" },
  filePath: "src/app.ts",
  staged: false,
};

describe("loadGitDiffForDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remoteSessionMock.mockReturnValue(false);
  });

  it("loads the diff and file contents for the Electron renderer", async () => {
    bridgeMock.getGitDiff.mockResolvedValue({ diff: "@@ -1 +1 @@" });
    bridgeMock.getGitFileContent.mockResolvedValue({
      oldContent: "before",
      newContent: "after",
    });

    await expect(loadGitDiffForDisplay(payload)).resolves.toEqual({
      result: { diff: "@@ -1 +1 @@" },
      oldContent: "before",
      newContent: "after",
    });
    expect(bridgeMock.getGitFileContent).toHaveBeenCalledWith(payload);
  });

  it("skips the extra file-content request for the remote PWA", async () => {
    remoteSessionMock.mockReturnValue(true);
    bridgeMock.getGitDiff.mockResolvedValue({ diff: "@@ -1 +1 @@" });

    await expect(loadGitDiffForDisplay(payload)).resolves.toEqual({
      result: { diff: "@@ -1 +1 @@" },
      oldContent: "",
      newContent: "",
    });
    expect(bridgeMock.getGitFileContent).not.toHaveBeenCalled();
  });

  it("bounds a stalled remote diff request", async () => {
    remoteSessionMock.mockReturnValue(true);
    bridgeMock.getGitDiff.mockReturnValue(new Promise(() => undefined));

    await expect(loadGitDiffForDisplay(payload, 1)).rejects.toThrow("Timed out loading Git diff");
  });
});
