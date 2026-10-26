// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GhGetPrDetailsPayload,
  GhGetPrDetailsResult,
  GitWorktreeInfo,
  PrData,
  Project,
} from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";

const bridge = vi.hoisted(() => ({
  ghGetPrFiles: vi.fn<() => Promise<{ files: never[] }>>(),
  ghGetPrDiff: vi.fn<() => Promise<{ diff: string }>>(),
  ghGetPrDetails: vi.fn<(payload: GhGetPrDetailsPayload) => Promise<GhGetPrDetailsResult>>(),
  ghGetPrReviewComments: vi.fn<() => Promise<{ threads: never[] }>>(),
}));
vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  readBridge: () => bridge,
  isRemoteSession: () => false,
}));

import { usePrDetailModel, type PrSelection } from "./usePrDetailModel";

const project: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "posix", path: "/work/poracode" },
  createdAt: "2026-07-13T10:00:00.000Z",
};
const WINDOWS_PATH = ["C:", "Work", "Poracode-Fix", ""].join(String.fromCharCode(92));
const PR_KEY = "__branchname:project-1:fix/pixels";
const WORKTREE = "/work/poracode-fix-pixels";
const pr: PrData = {
  number: 42,
  state: "open",
  title: "Fix the pixel renderer",
  url: "https://github.com/example/poracode/pull/42",
  baseBranch: "main",
  isDraft: false,
  updatedAt: "2026-07-13T11:00:00.000Z",
};

const main: GitWorktreeInfo = { path: "/work/poracode", branch: "main", commit: "a", isMain: true };
const linked: GitWorktreeInfo = {
  path: WORKTREE,
  branch: "fix/pixels",
  commit: "b",
  isMain: false,
};

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

function selectionWith(worktreePath: string | undefined): PrSelection {
  return {
    project,
    prNumber: 42,
    prKey: PR_KEY,
    ...(worktreePath ? { worktreePath } : {}),
    skipLocalSync: true,
  };
}

function selectReview(worktreePath: string | undefined) {
  usePanelStore.setState({
    prReviewContext: {
      projectId: project.id,
      prNumber: 42,
      prKey: PR_KEY,
      ...(worktreePath ? { worktreePath } : {}),
      skipLocalSync: true,
    },
  });
}

describe("usePrDetailModel worktree", () => {
  beforeEach(() => {
    bridge.ghGetPrFiles.mockReset().mockResolvedValue({ files: [] });
    bridge.ghGetPrDiff.mockReset().mockResolvedValue({ diff: "" });
    bridge.ghGetPrDetails.mockReset().mockResolvedValue({
      details: {
        number: 42,
        title: pr.title,
        body: "",
        baseBranch: "main",
        headBranch: "fix/pixels",
        additions: 0,
        deletions: 0,
        changedFiles: 0,
        commits: [],
        comments: [],
        reviews: [],
        checks: [],
      },
      pr,
    });
    bridge.ghGetPrReviewComments.mockReset().mockResolvedValue({ threads: [] });
    useGitStore.setState({
      statuses: {},
      worktrees: { [project.id]: [main, linked] },
      prData: { [PR_KEY]: pr },
      prDetails: {},
      prFiles: {},
    });
    usePanelStore.setState({ prReviewContext: null });
  });

  function renderModel(worktreePath: string | undefined) {
    return renderHook(() => usePrDetailModel(selectionWith(worktreePath), () => undefined), {
      wrapper,
    });
  }

  it("addresses the review to the project even when a worktree is selected", async () => {
    // The host refuses (HTTP 403) a location that is neither a project nor the worktree of
    // one of its threads, and a worktree made by the checkout action has no thread.
    selectReview(WORKTREE);
    const { result } = renderModel(WORKTREE);

    await waitFor(() => expect(bridge.ghGetPrDetails).toHaveBeenCalled());
    expect(result.current?.worktreePath).toBe(WORKTREE);
    expect(result.current?.location).toEqual(project.location);
    expect(bridge.ghGetPrDetails).toHaveBeenCalledWith(
      expect.objectContaining({ projectLocation: project.location }),
    );
    expect(bridge.ghGetPrDetails).not.toHaveBeenCalledWith(
      expect.objectContaining({ projectLocation: expect.objectContaining({ path: WORKTREE }) }),
    );
    expect(usePanelStore.getState().prReviewContext?.worktreePath).toBe(WORKTREE);
  });

  it("forgets a worktree removed outside the app and keeps reading through the project", async () => {
    selectReview(WORKTREE);
    useGitStore.setState({ worktrees: { [project.id]: [main] } });
    const { result } = renderModel(WORKTREE);

    await waitFor(() => expect(bridge.ghGetPrDetails).toHaveBeenCalled());
    expect(result.current?.worktreePath).toBeUndefined();
    expect(result.current?.location).toEqual(project.location);
    expect(bridge.ghGetPrDetails).toHaveBeenCalledWith(
      expect.objectContaining({ projectLocation: project.location }),
    );
    await waitFor(() =>
      expect(usePanelStore.getState().prReviewContext).toEqual({
        projectId: project.id,
        prNumber: 42,
        prKey: PR_KEY,
        skipLocalSync: true,
      }),
    );
  });

  it("keeps the review's row key when the path it was derived from is forgotten", async () => {
    usePanelStore.setState({
      prReviewContext: { projectId: project.id, prNumber: 42, worktreePath: WORKTREE },
    });
    useGitStore.setState({ worktrees: { [project.id]: [main] } });
    renderModel(WORKTREE);

    await waitFor(() =>
      expect(usePanelStore.getState().prReviewContext).toEqual({
        projectId: project.id,
        prNumber: 42,
        prKey: WORKTREE,
      }),
    );
  });

  it("recovers when the worktree list reports the path missing after the review opened", async () => {
    selectReview(WORKTREE);
    const { result } = renderModel(WORKTREE);
    await waitFor(() => expect(result.current?.worktreePath).toBe(WORKTREE));

    useGitStore.getState().setWorktrees(project.id, [main]);

    await waitFor(() => expect(result.current?.worktreePath).toBeUndefined());
    expect(result.current?.location).toEqual(project.location);
    expect(usePanelStore.getState().prReviewContext?.worktreePath).toBeUndefined();
  });

  it.each([
    ["not loaded", undefined],
    ["empty", []],
  ])("keeps the path while the worktree list is %s", async (_label, list) => {
    selectReview(WORKTREE);
    useGitStore.setState({ worktrees: list ? { [project.id]: list } : {} });
    const { result } = renderModel(WORKTREE);

    await waitFor(() => expect(bridge.ghGetPrDetails).toHaveBeenCalled());
    expect(result.current?.worktreePath).toBe(WORKTREE);
    expect(usePanelStore.getState().prReviewContext?.worktreePath).toBe(WORKTREE);
  });

  it("matches the path whatever its separators, case or trailing slash", async () => {
    selectReview(WINDOWS_PATH);
    useGitStore.setState({
      worktrees: {
        [project.id]: [main, { ...linked, path: "c:/work/poracode-fix" }],
      },
    });
    const { result } = renderModel(WINDOWS_PATH);

    await waitFor(() => expect(bridge.ghGetPrDetails).toHaveBeenCalled());
    expect(result.current?.worktreePath).toBe(WINDOWS_PATH);
  });

  it("exposes a retryable load error when the review fetch fails", async () => {
    selectReview(WORKTREE);
    bridge.ghGetPrDetails.mockRejectedValue(new Error("host exploded"));
    const { result } = renderModel(WORKTREE);

    await waitFor(() => expect(result.current?.loadError).toBeTruthy());
  });
});
