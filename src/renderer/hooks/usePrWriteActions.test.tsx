import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrData } from "@/shared/contracts";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrWriteActions } from "./usePrWriteActions";

const { bridgeMock, setPrMergeMethodMock, syncMergedPrBaseMock } = vi.hoisted(() => ({
  bridgeMock: {
    ghMergePr: vi.fn<() => Promise<void>>(),
  },
  setPrMergeMethodMock: vi.fn<(method: string) => void>(),
  syncMergedPrBaseMock: vi.fn<(projectId: string, pr: PrData) => Promise<void>>(),
}));

vi.mock("@heroui/react", () => ({
  toast: { danger: vi.fn<(message: string) => void>() },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: {
    getState: () => ({ setPrMergeMethod: setPrMergeMethodMock }),
  },
}));

vi.mock("@/renderer/state/prMergeBaseSync", () => ({
  syncMergedPrBase: (projectId: string, pr: PrData) => syncMergedPrBaseMock(projectId, pr),
}));

const openPr: PrData = {
  number: 7,
  state: "open",
  title: "Land the thing",
  url: "https://github.com/owner/repo/pull/7",
  baseBranch: "main",
  isDraft: false,
  checksStatus: "SUCCESS",
  updatedAt: "2026-07-20T00:00:00.000Z",
};

describe("usePrWriteActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMock.ghMergePr.mockResolvedValue(undefined);
    syncMergedPrBaseMock.mockResolvedValue(undefined);
    useGitStore.setState({ prData: { "__branchname:p1:feature": openPr } });
  });

  it("syncs the base checkout after a direct merge without a matching worktree thread", async () => {
    const onRefresh = vi.fn<() => void>();
    const { result } = renderHook(() =>
      usePrWriteActions({
        projectLocation: { kind: "posix", path: "/repo" },
        projectId: "p1",
        prKey: "__branchname:p1:feature",
        onRefresh,
      }),
    );

    await act(() => result.current.handleMergePr("squash"));

    expect(syncMergedPrBaseMock).toHaveBeenCalledWith("p1", { ...openPr, state: "merged" });
    expect(useGitStore.getState().prData["__branchname:p1:feature"]?.state).toBe("merged");
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
