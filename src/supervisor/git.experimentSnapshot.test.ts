import { describe, expect, it, vi } from "vitest";
import { GitService } from "./git";

describe("GitService experiment snapshots", () => {
  it("reports parallel snapshot completions in candidate order", async () => {
    const service = new GitService();
    const internals = service as unknown as {
      worktreeService: {
        listWorktrees: (...args: unknown[]) => Promise<unknown>;
        getWorktreeOwner: (...args: unknown[]) => Promise<unknown>;
      };
      statusService: { getStatusSummary: (...args: unknown[]) => Promise<unknown> };
      experimentService: { getCandidateDiff: (...args: unknown[]) => Promise<unknown> };
    };
    vi.spyOn(internals.worktreeService, "listWorktrees").mockResolvedValue({
      worktrees: [
        { path: "/repo", branch: "main", isMain: true },
        { path: "/worktrees/one", branch: "poracode/one", isMain: false },
        { path: "/worktrees/two", branch: "poracode/two", isMain: false },
      ],
    });
    vi.spyOn(internals.worktreeService, "getWorktreeOwner").mockImplementation(
      async (_location, branch) => ({
        ownerToken: branch === "poracode/one" ? "owner-one" : "owner-two",
      }),
    );
    vi.spyOn(internals.statusService, "getStatusSummary").mockImplementation(async (location) => ({
      branch: (location as { path: string }).path.endsWith("/one")
        ? "poracode/one"
        : "poracode/two",
    }));
    const pending: Array<(result: { diff: string; headCommit: string }) => void> = [];
    vi.spyOn(internals.experimentService, "getCandidateDiff").mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
    const progress: string[] = [];

    const capturing = service.captureExperimentSnapshot(
      {
        experimentId: "experiment-1",
        projectLocation: { kind: "posix", path: "/repo" },
        baseCommit: "a".repeat(40),
        candidates: [
          {
            threadId: "thread-one",
            branch: "poracode/one",
            ownerToken: "owner-one",
            worktreePath: "/worktrees/one",
          },
          {
            threadId: "thread-two",
            branch: "poracode/two",
            ownerToken: "owner-two",
            worktreePath: "/worktrees/two",
          },
        ],
      },
      (candidate) => progress.push(candidate.threadId),
    );
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1]!({ diff: "second", headCommit: "b".repeat(40) });
    await Promise.resolve();
    expect(progress).toEqual([]);
    pending[0]!({ diff: "first", headCommit: "c".repeat(40) });

    await expect(capturing).resolves.toMatchObject({
      candidates: [{ threadId: "thread-one" }, { threadId: "thread-two" }],
    });
    expect(progress).toEqual(["thread-one", "thread-two"]);
  });
});
