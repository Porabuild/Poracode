import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const execGitMock = vi.hoisted(() => vi.fn<() => Promise<string>>());

vi.mock("./exec", async () => {
  const actual = await vi.importActual<typeof import("./exec")>("./exec");
  return {
    ...actual,
    execGit: execGitMock,
  };
});

import { GIT_NETWORK_TIMEOUT } from "./exec";
import { GitWorktreeService } from "./worktreeService";

const location: ProjectLocation = {
  kind: "posix",
  path: "/repo",
};

describe("GitWorktreeService pull", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execGitMock.mockResolvedValue("");
  });

  it("uses an explicit merge strategy for regular pulls", async () => {
    await new GitWorktreeService().pull(location, "origin");

    expect(execGitMock).toHaveBeenCalledWith(location, ["pull", "--no-rebase", "origin"], {
      timeout: GIT_NETWORK_TIMEOUT,
    });
  });

  it("uses an explicit rebase strategy for rebase pulls", async () => {
    await new GitWorktreeService().pullRebase(location, "upstream");

    expect(execGitMock).toHaveBeenCalledWith(location, ["pull", "--rebase", "upstream"], {
      timeout: GIT_NETWORK_TIMEOUT,
    });
  });
});
