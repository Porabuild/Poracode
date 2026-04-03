import { homedir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { gitMock, readWslCommandOutputAsync, simpleGitMock } = vi.hoisted(() => ({
  gitMock: {
    checkIsRepo: vi.fn(),
    checkout: vi.fn(),
    clean: vi.fn(),
    diffSummary: vi.fn(),
    getRemotes: vi.fn(),
    status: vi.fn(),
  },
  readWslCommandOutputAsync: vi.fn(),
  simpleGitMock: vi.fn(),
}));

vi.mock("./agents/base", () => ({
  readWslCommandOutputAsync,
}));

vi.mock("simple-git", () => ({
  simpleGit: simpleGitMock,
}));

import { computeDefaultWorktreePath, GitService } from "./git";

describe("computeDefaultWorktreePath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    simpleGitMock.mockReturnValue(gitMock);
  });

  it.skipIf(process.platform !== "win32")(
    "stores Windows worktrees under the user home .lightcode root",
    async () => {
      const path = await computeDefaultWorktreePath(
        {
          kind: "windows",
          path: "C:\\Users\\demo\\work\\lightcode",
        },
        "feature/x",
      );

      expect(path).toMatch(
        new RegExp(
          `^${join(homedir(), ".lightcode", "worktrees").replace(/\\/g, "\\\\")}\\\\lightcode-[a-f0-9]{8}\\\\feature-x$`,
        ),
      );
    },
  );

  it.skipIf(process.platform !== "win32")(
    "separates same-named repos by hashing the canonical project path",
    async () => {
      const first = await computeDefaultWorktreePath(
        {
          kind: "windows",
          path: "C:\\Users\\demo\\work\\lightcode",
        },
        "feature/x",
      );
      const second = await computeDefaultWorktreePath(
        {
          kind: "windows",
          path: "D:\\src\\lightcode",
        },
        "feature/x",
      );

      expect(first).not.toBe(second);
      expect(first).toContain(`${join(".lightcode", "worktrees")}\\lightcode-`);
      expect(second).toContain(`${join(".lightcode", "worktrees")}\\lightcode-`);
    },
  );

  it("stores WSL worktrees under the distro home .lightcode root", async () => {
    readWslCommandOutputAsync.mockResolvedValue({
      ok: true,
      stdout: "/home/demo",
      stderr: "",
    });

    const path = await computeDefaultWorktreePath(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/demo/work/lightcode",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\lightcode",
      },
      "feature/x",
    );

    expect(path).toMatch(/^\/home\/demo\/.lightcode\/worktrees\/lightcode-[a-f0-9]{8}\/feature-x$/);
    expect(readWslCommandOutputAsync).toHaveBeenCalledWith("Ubuntu", "sh", [
      "-lc",
      'printf %s "$HOME"',
    ]);
  });

  it("fails when the WSL home directory cannot be resolved", async () => {
    readWslCommandOutputAsync.mockResolvedValue({
      ok: false,
      stdout: "",
      stderr: "lookup failed",
    });

    await expect(
      computeDefaultWorktreePath(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/work/lightcode",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\work\\lightcode",
        },
        "feature/x",
      ),
    ).rejects.toThrow('Unable to resolve home directory for WSL distro "Ubuntu".');
  });
});

describe("GitService.revert", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\lightcode",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    simpleGitMock.mockReturnValue(gitMock);
  });

  it("checks out tracked files", async () => {
    gitMock.status.mockResolvedValue({
      files: [{ path: "README.md", working_dir: "M" }],
    });

    await new GitService().revert(location, "README.md");

    expect(gitMock.checkout).toHaveBeenCalledWith(["--", "README.md"]);
    expect(gitMock.clean).not.toHaveBeenCalled();
  });

  it("cleans untracked files instead of checking them out", async () => {
    gitMock.status.mockResolvedValue({
      files: [{ path: "README.md", working_dir: "?" }],
    });

    await new GitService().revert(location, "README.md");

    expect(gitMock.clean).toHaveBeenCalledWith("f", ["--", "README.md"]);
    expect(gitMock.checkout).not.toHaveBeenCalled();
  });

  it("reverts unstaged renames by removing the new path and restoring the old one", async () => {
    gitMock.status.mockResolvedValue({
      files: [{ path: "docs/new-name.md", from: "docs/old-name.md", working_dir: "R" }],
    });

    await new GitService().revert(location, "docs/new-name.md");

    expect(gitMock.clean).toHaveBeenCalledWith("f", ["--", "docs/new-name.md"]);
    expect(gitMock.checkout).toHaveBeenCalledWith(["--", "docs/old-name.md"]);
  });
});

describe("GitService.getStatus", () => {
  const location = {
    kind: "windows" as const,
    path: "C:\\Users\\demo\\work\\lightcode",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    simpleGitMock.mockReturnValue(gitMock);
    gitMock.checkIsRepo.mockResolvedValue(true);
    gitMock.getRemotes.mockResolvedValue([]);
    gitMock.diffSummary.mockResolvedValue({ files: [] });
  });

  it("normalizes Windows-style git paths before returning status", async () => {
    gitMock.status.mockResolvedValue({
      current: "feature/worktree",
      tracking: null,
      ahead: 0,
      behind: 0,
      files: [
        { path: "src\\staged.ts", index: "M", working_dir: " " },
        {
          path: "docs\\renamed-new.md",
          from: "docs\\renamed-old.md",
          index: " ",
          working_dir: "R",
        },
      ],
    });

    const result = await new GitService().getStatus(location);

    expect(result.staged[0]?.path).toBe("src/staged.ts");
    expect(result.unstaged[0]?.path).toBe("docs/renamed-new.md");
    expect(result.unstaged[0]?.oldPath).toBe("docs/renamed-old.md");
  });
});
