import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const execGitMock = vi.hoisted(() =>
  vi.fn<(location: ProjectLocation, args: string[], options?: unknown) => Promise<string>>(),
);

vi.mock("./exec", async () => {
  const actual = await vi.importActual<typeof import("./exec")>("./exec");
  return { ...actual, execGit: execGitMock };
});

import { GitExperimentService } from "./experimentService";
import { GitStatusService } from "./statusService";

const location: ProjectLocation = { kind: "posix", path: "/repo" };
const commit = "a".repeat(40);

describe("GitExperimentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses concrete untracked files instead of collapsed directory status rows", async () => {
    const statusService = new GitStatusService();
    const statusSpy = vi.spyOn(statusService, "getStatusSummary").mockResolvedValue({
      isRepo: true,
      branch: "main",
      tracking: "",
      hasRemote: false,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [
        {
          path: ".venv",
          status: "?",
          staged: false,
          insertions: 0,
          deletions: 0,
        },
      ],
      totalInsertions: 0,
      totalDeletions: 0,
    });
    execGitMock.mockImplementation(async (_location, args) => {
      if (args[0] === "rev-parse") return `${commit}\n`;
      if (args[0] === "ls-files") return ".venv/bin/python\0";
      if (args[0] === "diff" && args.includes("--no-index")) {
        return "2\t0\t.venv/bin/python\n";
      }
      return "";
    });

    await expect(
      new GitExperimentService(statusService).getCandidateStats(location, commit),
    ).resolves.toEqual({ insertions: 2, deletions: 0, files: 1 });

    expect(statusSpy).not.toHaveBeenCalled();
    const untrackedDiffCalls = execGitMock.mock.calls.filter(([, args]) =>
      args.includes("--no-index"),
    );
    expect(untrackedDiffCalls).toHaveLength(2);
    expect(untrackedDiffCalls.every(([, args]) => args.at(-1) === ".venv/bin/python")).toBe(true);
  });
});
