import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_EXPERIMENT_UNTRACKED_FILES, type ProjectLocation } from "@/shared/contracts";

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

  it("captures the first 200 code-like untracked files and lists the rest", async () => {
    const paths = Array.from({ length: 283 }, (_, index) => `research/result-${index}.md`);
    const statusService = new GitStatusService();
    const diffSpy = vi
      .spyOn(statusService, "getDiff")
      .mockImplementation(async (_location, path) => ({
        diff: `diff --git a/${path} b/${path}\n+result`,
      }));
    execGitMock.mockImplementation(async (_location, args) => {
      if (args[0] === "rev-parse") return `${commit}\n`;
      if (args[0] === "ls-files") return `${paths.join("\0")}\0`;
      return "";
    });

    const result = await new GitExperimentService(statusService).getCandidateDiff(location, commit);

    expect(result.diff).toContain("research/result-0.md");
    expect(result.diff).toContain("research/result-282.md");
    expect(result.diff).toContain("untracked content limit");
    expect(result.omittedFiles).toBe(83);
    expect(diffSpy).toHaveBeenCalledTimes(MAX_EXPERIMENT_UNTRACKED_FILES * 2);
    expect(diffSpy).not.toHaveBeenCalledWith(
      location,
      "research/result-282.md",
      false,
      expect.any(Number),
    );
  });

  it("does not block comparison when the untracked content limit is exceeded", async () => {
    const paths = Array.from(
      { length: MAX_EXPERIMENT_UNTRACKED_FILES + 1 },
      (_, index) => `generated/${index}`,
    );
    const statusService = new GitStatusService();
    const diffSpy = vi
      .spyOn(statusService, "getDiff")
      .mockImplementation(async (_location, path) => ({
        diff: `diff --git a/${path} b/${path}\n+generated`,
      }));
    execGitMock.mockImplementation(async (_location, args) => {
      if (args[0] === "rev-parse") return `${commit}\n`;
      if (args[0] === "ls-files") return `${paths.join("\0")}\0`;
      return "";
    });

    const result = await new GitExperimentService(statusService).getCandidateDiff(location, commit);

    expect(result.omittedFiles).toBe(1);
    expect(result.diff).toContain(`"generated/${MAX_EXPERIMENT_UNTRACKED_FILES}"`);
    expect(diffSpy).toHaveBeenCalledTimes(MAX_EXPERIMENT_UNTRACKED_FILES * 2);
  });

  it("lists non-code assets without reading their contents", async () => {
    const paths = ["src/feature.ts", "docs/notes.md", "assets/logo.svg", "assets/photo.png"];
    const statusService = new GitStatusService();
    const diffSpy = vi
      .spyOn(statusService, "getDiff")
      .mockImplementation(async (_location, path) => ({
        diff: `diff --git a/${path} b/${path}\n+text`,
      }));
    execGitMock.mockImplementation(async (_location, args) => {
      if (args[0] === "rev-parse") return `${commit}\n`;
      if (args[0] === "ls-files") return `${paths.join("\0")}\0`;
      return "";
    });

    const result = await new GitExperimentService(statusService).getCandidateDiff(location, commit);

    expect(result.omittedFiles).toBe(2);
    expect(result.diff).toContain('"assets/logo.svg" (non-code asset)');
    expect(result.diff).toContain('"assets/photo.png" (non-code asset)');
    expect(diffSpy).toHaveBeenCalledTimes(4);
    expect(diffSpy.mock.calls.map(([, path]) => path)).toEqual([
      "src/feature.ts",
      "docs/notes.md",
      "src/feature.ts",
      "docs/notes.md",
    ]);
  });

  it("lists oversized untracked files instead of blocking the comparison", async () => {
    const paths = ["generated/huge.txt", "src/small.ts"];
    const statusService = new GitStatusService();
    vi.spyOn(statusService, "getDiff").mockImplementation(async (_location, path) => {
      if (path === "generated/huge.txt") {
        throw new Error("Git output exceeded the 1995904-byte limit");
      }
      return { diff: `diff --git a/${path} b/${path}\n+small` };
    });
    execGitMock.mockImplementation(async (_location, args) => {
      if (args[0] === "rev-parse") return `${commit}\n`;
      if (args[0] === "ls-files") return `${paths.join("\0")}\0`;
      return "";
    });

    const result = await new GitExperimentService(statusService).getCandidateDiff(location, commit);

    expect(result.omittedFiles).toBe(1);
    expect(result.diff).toContain('"generated/huge.txt" (diff size limit)');
    expect(result.diff).toContain("src/small.ts");
  });
});
