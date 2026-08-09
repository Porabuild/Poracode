import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrData, Project } from "@/shared/contracts";
import { useAppStore } from "./appStore";
import { syncMergedPrBase } from "./prMergeBaseSync";

const pullMergedPrBaseIfPossibleMock = vi.hoisted(() =>
  vi.fn<
    (projectLocation: Project["location"], baseBranch: string, projectId?: string) => Promise<void>
  >(),
);

vi.mock("@/renderer/actions/gitCommandRunner", () => ({
  pullMergedPrBaseIfPossible: (
    projectLocation: Project["location"],
    baseBranch: string,
    projectId?: string,
  ) => pullMergedPrBaseIfPossibleMock(projectLocation, baseBranch, projectId),
}));

const project: Project = {
  id: "p1",
  name: "Project",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-07-20T00:00:00.000Z",
};

function pr(number: number): PrData {
  return {
    number,
    state: "merged",
    title: `PR ${number}`,
    url: `https://github.com/owner/repo/pull/${number}`,
    baseBranch: "main",
    isDraft: false,
    checksStatus: "SUCCESS",
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
}

describe("prMergeBaseSync", () => {
  beforeEach(() => {
    pullMergedPrBaseIfPossibleMock.mockReset();
    useAppStore.setState({ projects: [project] });
  });

  it("deduplicates the same PR and serializes different PRs for one project", async () => {
    let releaseFirst!: () => void;
    pullMergedPrBaseIfPossibleMock
      .mockImplementationOnce(() => new Promise<void>((resolve) => (releaseFirst = resolve)))
      .mockResolvedValueOnce(undefined);

    const first = syncMergedPrBase("p1", pr(7));
    const duplicate = syncMergedPrBase("p1", pr(7));
    const second = syncMergedPrBase("p1", pr(8));

    await vi.waitFor(() => expect(pullMergedPrBaseIfPossibleMock).toHaveBeenCalledTimes(1));
    expect(duplicate).toBe(first);
    const movedLocation: Project["location"] = { kind: "posix", path: "/repo-moved" };
    useAppStore.setState({ projects: [{ ...project, location: movedLocation }] });

    releaseFirst();
    await Promise.all([first, duplicate, second]);

    expect(pullMergedPrBaseIfPossibleMock).toHaveBeenNthCalledWith(
      1,
      project.location,
      "main",
      "p1",
    );
    expect(pullMergedPrBaseIfPossibleMock).toHaveBeenNthCalledWith(2, movedLocation, "main", "p1");
  });
});
