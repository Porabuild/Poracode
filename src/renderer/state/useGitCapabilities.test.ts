import { beforeEach, describe, expect, it } from "vitest";
import { useGitStore } from "./gitStore";
import type { GitStatusResult } from "../../shared/contracts";

// For non-hook testing, access store state directly
function getProjectCaps(projectId: string) {
  const status = useGitStore.getState().statuses[projectId];
  return deriveCaps(status);
}

function getWorktreeCaps(worktreePath: string | undefined, projectId: string) {
  const state = useGitStore.getState();
  const status =
    (worktreePath ? state.worktreeStatuses[worktreePath] : undefined) ?? state.statuses[projectId];
  return deriveCaps(status);
}

function deriveCaps(status: GitStatusResult | undefined) {
  if (!status) {
    return {
      isRepo: false,
      hasRemote: false,
      isGitHub: false,
      remoteOwner: "",
      remoteRepo: "",
      hasBranch: false,
      isPushed: false,
    };
  }
  const ri = status.remoteInfo;
  return {
    isRepo: status.isRepo,
    hasRemote: status.hasRemote,
    isGitHub: ri?.platform === "github",
    remoteOwner: ri?.owner ?? "",
    remoteRepo: ri?.repo ?? "",
    hasBranch: Boolean(status.branch),
    isPushed: Boolean(status.tracking) && status.ahead === 0,
  };
}

const baseStatus: GitStatusResult = {
  isRepo: true,
  branch: "main",
  tracking: "origin/main",
  hasRemote: true,
  remoteInfo: {
    url: "https://github.com/owner/repo.git",
    platform: "github",
    owner: "owner",
    repo: "repo",
  },
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  totalInsertions: 0,
  totalDeletions: 0,
};

describe("useGitCapabilities (unit)", () => {
  beforeEach(() => {
    useGitStore.setState({
      statuses: {},
      worktreeStatuses: {},
      worktrees: {},
      branches: {},
      ghAvailable: {},
      prData: {},
    });
  });

  it("returns all false when no status exists", () => {
    const caps = getProjectCaps("unknown");
    expect(caps.isRepo).toBe(false);
    expect(caps.isGitHub).toBe(false);
    expect(caps.isPushed).toBe(false);
  });

  it("detects GitHub repos from remoteInfo", () => {
    useGitStore.getState().setStatus("p1", baseStatus);
    const caps = getProjectCaps("p1");
    expect(caps.isGitHub).toBe(true);
    expect(caps.remoteOwner).toBe("owner");
    expect(caps.remoteRepo).toBe("repo");
  });

  it("marks non-GitHub repos correctly", () => {
    useGitStore.getState().setStatus("p1", {
      ...baseStatus,
      remoteInfo: {
        url: "https://gitlab.com/org/project.git",
        platform: "gitlab",
        owner: "org",
        repo: "project",
      },
    });
    const caps = getProjectCaps("p1");
    expect(caps.isGitHub).toBe(false);
    expect(caps.hasRemote).toBe(true);
  });

  it("detects pushed branch (tracking + ahead=0)", () => {
    useGitStore.getState().setStatus("p1", baseStatus);
    const caps = getProjectCaps("p1");
    expect(caps.isPushed).toBe(true);
  });

  it("detects unpushed branch (no tracking)", () => {
    useGitStore.getState().setStatus("p1", { ...baseStatus, tracking: "" });
    const caps = getProjectCaps("p1");
    expect(caps.isPushed).toBe(false);
  });

  it("detects unpushed branch (ahead > 0)", () => {
    useGitStore.getState().setStatus("p1", { ...baseStatus, ahead: 3 });
    const caps = getProjectCaps("p1");
    expect(caps.isPushed).toBe(false);
  });

  it("falls back to project status when worktree has no status", () => {
    useGitStore.getState().setStatus("p1", baseStatus);
    const caps = getWorktreeCaps(undefined, "p1");
    expect(caps.isGitHub).toBe(true);
  });

  it("uses worktree status when available", () => {
    useGitStore.getState().setStatus("p1", baseStatus);
    useGitStore.getState().setWorktreeStatus("/wt/path", {
      ...baseStatus,
      branch: "feature/x",
      tracking: "",
      ahead: 0,
    });
    const caps = getWorktreeCaps("/wt/path", "p1");
    expect(caps.hasBranch).toBe(true);
    expect(caps.isPushed).toBe(false); // no tracking
  });
});
