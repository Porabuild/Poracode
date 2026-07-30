import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  emptyGitStateSnapshot,
  gitTargetKey,
  pullRequestKey,
  type GitTargetState,
  type PullRequestState,
} from "@/shared/gitState";
import { usePullRequestForTarget } from "./gitReadModelSelectors";
import { useGitReadModelStore } from "./gitReadModelStore";

const targetRef = {
  hostId: "host-a",
  projectId: "project-a",
  worktreePath: "/repo/worktree",
};
const prRef = { hostId: "host-a", projectId: "project-a", prNumber: 42 };
const targetKey = gitTargetKey(targetRef);
const prKey = pullRequestKey(prRef);

function makePr(title: string): PullRequestState {
  return {
    ref: prRef,
    data: {
      number: 42,
      state: "open",
      title,
      url: "https://example.test/pull/42",
      baseBranch: "main",
      isDraft: false,
      updatedAt: "2026-07-28T12:00:00.000Z",
    },
    freshness: { core: "2026-07-28T12:00:00.000Z" },
  };
}

describe("gitReadModelStore", () => {
  beforeEach(() => {
    useGitReadModelStore.getState().reset();
  });

  it("updates every target consumer when the canonical PR entity changes", () => {
    const target: GitTargetState = {
      ref: targetRef,
      pullRequestKey: prKey,
      refreshedAt: "2026-07-28T12:00:00.000Z",
    };
    act(() => {
      useGitReadModelStore.getState().applyPatch({
        revision: 1,
        targets: { [targetKey]: target },
        pullRequests: { [prKey]: makePr("Old title") },
      });
    });
    const view = renderHook(() => usePullRequestForTarget(targetRef));
    expect(view.result.current?.data.title).toBe("Old title");

    act(() => {
      useGitReadModelStore.getState().applyPatch({
        revision: 2,
        pullRequests: { [prKey]: makePr("New title") },
      });
    });

    expect(view.result.current?.data.title).toBe("New title");
  });

  it("distinguishes a modern host's empty revision-zero snapshot from no host model", () => {
    expect(useGitReadModelStore.getState().hostAvailable).toBe(false);

    act(() => {
      useGitReadModelStore.getState().replaceSnapshot(emptyGitStateSnapshot());
    });

    expect(useGitReadModelStore.getState().hostAvailable).toBe(true);

    act(() => {
      useGitReadModelStore.getState().reset();
    });

    expect(useGitReadModelStore.getState().hostAvailable).toBe(false);
  });

  it("isolates equal project and worktree identifiers across hosts", () => {
    const otherRef = { ...targetRef, hostId: "host-b" };
    const otherKey = gitTargetKey(otherRef);
    const otherPrRef = { ...prRef, hostId: "host-b" };
    const otherPrKey = pullRequestKey(otherPrRef);
    act(() => {
      useGitReadModelStore.getState().applyPatch({
        revision: 1,
        targets: {
          [targetKey]: {
            ref: targetRef,
            pullRequestKey: prKey,
            refreshedAt: "2026-07-28T12:00:00.000Z",
          },
          [otherKey]: {
            ref: otherRef,
            pullRequestKey: otherPrKey,
            refreshedAt: "2026-07-28T12:00:00.000Z",
          },
        },
        pullRequests: {
          [prKey]: makePr("Host A"),
          [otherPrKey]: {
            ...makePr("Host B"),
            ref: otherPrRef,
          },
        },
      });
    });

    const hostA = renderHook(() => usePullRequestForTarget(targetRef));
    const hostB = renderHook(() => usePullRequestForTarget(otherRef));
    expect(hostA.result.current?.data.title).toBe("Host A");
    expect(hostB.result.current?.data.title).toBe("Host B");
  });
});
