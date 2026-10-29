import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ForgeRepository, PrData, PrDetails } from "@/shared/contracts";
import { ghMergePrAtHeadPayloadSchema } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import type { IpcProcedurePayload } from "@/shared/ipc";
import { reviewClient } from "@/renderer/utils/forgeReviews";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrWriteActions } from "./usePrWriteActions";

const { bridgeMock, setPrMergeMethodMock, syncMergedPrBaseMock, toastDangerMock } = vi.hoisted(
  () => ({
    bridgeMock: {
      ghMergePr: vi.fn<() => Promise<void>>(),
      ghMergePrAtHead: vi.fn<(input: IpcProcedurePayload<"ghMergePrAtHead">) => Promise<void>>(),
      forgeMergePr: vi.fn<() => Promise<void>>(),
      forgeMergePrAtHead:
        vi.fn<(input: IpcProcedurePayload<"forgeMergePrAtHead">) => Promise<void>>(),
      forgeGetPrDetails: vi.fn<() => Promise<unknown>>(),
      forgeClosePr: vi.fn<() => Promise<void>>(),
      forgeMarkPrReady: vi.fn<() => Promise<void>>(),
      forgeUpdatePrBranch: vi.fn<() => Promise<void>>(),
      forgeEditPr: vi.fn<(input: IpcProcedurePayload<"forgeEditPr">) => Promise<void>>(),
      gitPull: vi.fn<() => Promise<void>>(),
      gitPullRebase: vi.fn<() => Promise<void>>(),
    },
    setPrMergeMethodMock: vi.fn<(method: string) => void>(),
    syncMergedPrBaseMock: vi.fn<(projectId: string, pr: PrData) => Promise<void>>(),
    toastDangerMock:
      vi.fn<(message: string, options?: { actionProps: { onPress: () => void } }) => void>(),
  }),
);

vi.mock("@heroui/react", () => ({
  toast: { danger: toastDangerMock, info: vi.fn<(message: string) => void>() },
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
const source: ForgeRepository = {
  forge: "gitlab",
  host: "https://git.example",
  repository: "team/app",
  remote: "origin",
  account: { forge: "gitlab", host: "https://git.example", login: "alice" },
  capabilities: {
    mergeMethods: ["merge", "squash"],
    reviewDecisions: ["approve", "comment"],
    draft: true,
    reopen: true,
    updateBranch: false,
    rebaseBranch: true,
    edit: true,
    checks: true,
    reviewThreads: true,
    expectedHeadMerge: true,
    autoMerge: true,
    autoFix: true,
    adminMerge: false,
  },
};

const reviewDetails: PrDetails = {
  number: 7,
  title: "Land the thing",
  body: "",
  baseBranch: "main",
  headBranch: "feature",
  additions: 0,
  deletions: 0,
  changedFiles: 0,
  comments: [],
  reviews: [],
  commits: [],
  checks: [],
  source,
};

const bitbucketSource: ForgeRepository = {
  ...source,
  forge: "bitbucket",
  host: "https://bitbucket.org",
  account: { forge: "bitbucket", host: "https://bitbucket.org", login: "alice" },
  capabilities: { ...source.capabilities, expectedHeadMerge: false, autoMerge: false },
};

const replacementSources: { change: string; source: ForgeRepository }[] = [
  { change: "account", source: { ...source, account: { ...source.account!, login: "bob" } } },
  {
    change: "host",
    source: {
      ...source,
      host: "https://other.example",
      account: { ...source.account!, host: "https://other.example" },
    },
  },
  { change: "repository", source: { ...source, repository: "other/app" } },
];

describe("usePrWriteActions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    bridgeMock.ghMergePr.mockResolvedValue(undefined);
    bridgeMock.ghMergePrAtHead.mockResolvedValue(undefined);
    bridgeMock.forgeMergePr.mockResolvedValue(undefined);
    bridgeMock.forgeMergePrAtHead.mockResolvedValue(undefined);
    syncMergedPrBaseMock.mockResolvedValue(undefined);
    useGitStore.setState({ prData: { "__branchname:p1:feature": openPr }, prDetails: {} });
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

  it.each(["queued", "readback-failure"])(
    "keeps a successful %s merge request pending without repeating it",
    async (state) => {
      const scopedPr = { ...openPr, source, headSha: "a".repeat(40) };
      useGitStore.setState({ prData: { "__branchname:p1:feature": scopedPr } });
      bridgeMock.forgeMergePrAtHead.mockResolvedValue(undefined);
      if (state === "queued")
        bridgeMock.forgeGetPrDetails.mockResolvedValue({
          pr: scopedPr,
          details: reviewDetails,
        });
      else bridgeMock.forgeGetPrDetails.mockRejectedValue(new Error("readback unavailable"));
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
      expect(bridgeMock.forgeMergePrAtHead).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          expectedHeadSha: scopedPr.headSha,
          forgeAccount: source.account,
          forgeRepository: "team/app",
          admin: false,
        }),
      );
      expect(useGitStore.getState().prData["__branchname:p1:feature"]?.state).toBe("open");
      expect(syncMergedPrBaseMock).not.toHaveBeenCalled();
      expect(onRefresh).toHaveBeenCalledOnce();
    },
  );

  describe.each(replacementSources)(
    "same-key $change replacement",
    ({ source: replacementSource }) => {
      it.each([
        ["merge", "forgeMergePrAtHead"],
        ["close", "forgeClosePr"],
        ["ready", "forgeMarkPrReady"],
        ["update", "forgeUpdatePrBranch"],
      ] as const)(
        "discards a held %s completion without retargeting it",
        async (action, method) => {
          const held = Promise.withResolvers<void>();
          const priorPr = { ...openPr, source, headSha: "a".repeat(40) };
          const replacementPr = { ...priorPr, title: "Current B", source: replacementSource };
          const replacementDetails = {
            ...reviewDetails,
            title: "Current B",
            source: replacementSource,
          };
          useGitStore.setState({ prData: { "__branchname:p1:feature": priorPr } });
          bridgeMock[method].mockReturnValue(held.promise);
          const onRefresh = vi.fn<() => void>();
          const { result } = renderHook(() =>
            usePrWriteActions({
              projectLocation: { kind: "posix", path: "/repo" },
              projectId: "p1",
              prKey: "__branchname:p1:feature",
              onRefresh,
            }),
          );
          const actions = {
            merge: () => result.current.handleMergePr("squash"),
            close: () => result.current.handleClosePr(),
            ready: () => result.current.handleMarkPrReady(),
            update: () => result.current.handleUpdatePrBranch(),
          };
          let completion!: Promise<void>;
          act(() => {
            completion = actions[action]();
          });
          act(() => {
            useGitStore.getState().setPrData("__branchname:p1:feature", replacementPr);
            useGitStore.getState().setPrDetails("p1#7", replacementDetails);
          });
          await act(async () => {
            held.resolve();
            await completion;
          });
          expect(bridgeMock[method]).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
              forgeAccount: source.account,
              forgeRepository: source.repository,
              prNumber: priorPr.number,
            }),
          );
          expect(useGitStore.getState().prData["__branchname:p1:feature"]).toBe(replacementPr);
          expect(useGitStore.getState().prDetails["p1#7"]).toBe(replacementDetails);
          expect(bridgeMock.forgeGetPrDetails).not.toHaveBeenCalled();
          expect(bridgeMock.gitPull).not.toHaveBeenCalled();
          expect(bridgeMock.gitPullRebase).not.toHaveBeenCalled();
          expect(syncMergedPrBaseMock).not.toHaveBeenCalled();
          expect(onRefresh).not.toHaveBeenCalled();
        },
      );

      it("discards a held merge readback after the current row changes", async () => {
        const held = Promise.withResolvers<{ pr: PrData; details: PrDetails }>();
        const priorPr = { ...openPr, source, headSha: "a".repeat(40) };
        const replacementPr = { ...priorPr, source: replacementSource };
        const replacementDetails = { ...reviewDetails, source: replacementSource };
        useGitStore.setState({ prData: { "__branchname:p1:feature": priorPr } });
        bridgeMock.forgeMergePrAtHead.mockResolvedValue(undefined);
        bridgeMock.forgeGetPrDetails.mockReturnValue(held.promise);
        const onRefresh = vi.fn<() => void>();
        const { result } = renderHook(() =>
          usePrWriteActions({
            projectLocation: { kind: "posix", path: "/repo" },
            projectId: "p1",
            prKey: "__branchname:p1:feature",
            onRefresh,
          }),
        );
        let completion!: Promise<void>;
        await act(async () => {
          completion = result.current.handleMergePr("squash");
          await Promise.resolve();
        });
        expect(bridgeMock.forgeGetPrDetails).toHaveBeenCalledOnce();
        act(() => {
          useGitStore.getState().setPrData("__branchname:p1:feature", replacementPr);
          useGitStore.getState().setPrDetails("p1#7", replacementDetails);
        });
        await act(async () => {
          held.resolve({ pr: { ...priorPr, state: "merged" }, details: reviewDetails });
          await completion;
        });
        expect(useGitStore.getState().prData["__branchname:p1:feature"]).toBe(replacementPr);
        expect(useGitStore.getState().prDetails["p1#7"]).toBe(replacementDetails);
        expect(syncMergedPrBaseMock).not.toHaveBeenCalled();
        expect(onRefresh).not.toHaveBeenCalled();
        expect(bridgeMock.forgeMergePrAtHead).toHaveBeenCalledOnce();
      });
    },
  );

  it("does not let a captured admin retry operate on a replacement row", async () => {
    const priorPr = {
      ...openPr,
      headSha: "a".repeat(40),
      source: { ...source, capabilities: { ...source.capabilities, adminMerge: true } },
    };
    useGitStore.setState({ prData: { "__branchname:p1:feature": priorPr } });
    bridgeMock.forgeMergePrAtHead.mockRejectedValue(new Error("base branch policy"));
    const { result } = renderHook(() =>
      usePrWriteActions({
        projectLocation: { kind: "posix", path: "/repo" },
        prKey: "__branchname:p1:feature",
        onRefresh: () => {},
      }),
    );
    await act(() => result.current.handleMergePr("squash"));
    const retry = toastDangerMock.mock.calls[0]?.[1]?.actionProps.onPress;
    expect(retry).toBeTypeOf("function");
    useGitStore.getState().setPrData("__branchname:p1:feature", {
      ...priorPr,
      source: replacementSources[0]!.source,
    });
    await act(async () => retry?.());
    expect(bridgeMock.forgeMergePrAtHead).toHaveBeenCalledOnce();
  });

  it("reports a local sync failure without offering to repeat an accepted merge", async () => {
    const priorPr = {
      ...openPr,
      headSha: "a".repeat(40),
      source: { ...source, capabilities: { ...source.capabilities, adminMerge: true } },
    };
    const mergedPr: PrData = { ...priorPr, state: "merged" };
    useGitStore.setState({ prData: { "__branchname:p1:feature": priorPr } });
    bridgeMock.forgeMergePrAtHead.mockResolvedValue(undefined);
    bridgeMock.forgeGetPrDetails.mockResolvedValue({ pr: mergedPr, details: reviewDetails });
    syncMergedPrBaseMock.mockRejectedValue(
      new Error("base branch policy: local checkout unavailable"),
    );
    const { result } = renderHook(() =>
      usePrWriteActions({
        projectLocation: { kind: "posix", path: "/repo" },
        projectId: "p1",
        prKey: "__branchname:p1:feature",
        onRefresh: () => {},
      }),
    );
    await act(() => result.current.handleMergePr("squash"));
    expect(useGitStore.getState().prData["__branchname:p1:feature"]).toBe(mergedPr);
    expect(toastDangerMock).toHaveBeenCalledExactlyOnceWith(
      "base branch policy: local checkout unavailable",
    );
    expect(bridgeMock.forgeMergePrAtHead).toHaveBeenCalledOnce();
  });

  it("loudly refuses an unsupported supplied head without an unconditional merge", async () => {
    const scopedPr = { ...openPr, source: bitbucketSource, headSha: "a".repeat(40) };
    useGitStore.setState({ prData: { "__branchname:p1:feature": scopedPr } });
    const refusal = msg("forge.unsupported", { forge: "bitbucket" });
    bridgeMock.forgeMergePrAtHead.mockRejectedValue(new Error(refusal));
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
    expect(bridgeMock.forgeMergePrAtHead).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        expectedHeadSha: scopedPr.headSha,
        forgeAccount: bitbucketSource.account,
        forgeRepository: bitbucketSource.repository,
      }),
    );
    expect(bridgeMock.forgeMergePr).not.toHaveBeenCalled();
    expect(bridgeMock.ghMergePr).not.toHaveBeenCalled();
    expect(bridgeMock.forgeGetPrDetails).not.toHaveBeenCalled();
    expect(useGitStore.getState().prData["__branchname:p1:feature"]).toBe(scopedPr);
    expect(syncMergedPrBaseMock).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(toastDangerMock).toHaveBeenCalledExactlyOnceWith(refusal);
  });

  it("does not send an edit when the source host cannot edit the review", async () => {
    useGitStore.setState({
      prData: {
        "__branchname:p1:feature": {
          ...openPr,
          source: { ...source, capabilities: { ...source.capabilities, edit: false } },
        },
      },
    });
    const { result } = renderHook(() =>
      usePrWriteActions({
        projectLocation: { kind: "posix", path: "/repo" },
        prKey: "__branchname:p1:feature",
        onRefresh: () => {},
      }),
    );
    await act(async () => {
      expect(await result.current.handleEditPr({ title: "Renamed", body: "Notes" })).toBe(false);
    });
    expect(bridgeMock.forgeEditPr).not.toHaveBeenCalled();
  });

  describe("editing against the live review", () => {
    const key = "__branchname:p1:feature";
    const staleDetails = { ...reviewDetails, title: "Old title", body: "Loaded body" };

    function setup(liveBody: string) {
      const prior = { ...openPr, source };
      useGitStore.setState({
        prData: { [key]: prior },
        prDetails: { "p1#7": staleDetails },
      });
      bridgeMock.forgeGetPrDetails.mockResolvedValue({
        pr: prior,
        details: { ...reviewDetails, title: "Live title", body: liveBody },
      });
      bridgeMock.forgeEditPr.mockResolvedValue(undefined);
      const onRefresh = vi.fn<() => void>();
      const { result } = renderHook(() =>
        usePrWriteActions({
          projectLocation: { kind: "posix", path: "/repo" },
          projectId: "p1",
          prKey: key,
          onRefresh,
        }),
      );
      return { result, onRefresh };
    }

    it("sends the live description for a title-only edit, not the loaded copy", async () => {
      const { result, onRefresh } = setup("Newer host description");

      await act(async () => {
        expect(await result.current.handleEditPr({ title: " Renamed " })).toBe(true);
      });

      expect(bridgeMock.forgeEditPr).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ title: "Renamed", body: "Newer host description" }),
      );
      expect(useGitStore.getState().prDetails["p1#7"]).toMatchObject({
        title: "Renamed",
        body: "Newer host description",
      });
      expect(onRefresh).toHaveBeenCalledOnce();
    });

    it("sends the live title for a description-only edit", async () => {
      const { result } = setup("Loaded body");

      await act(async () => {
        expect(
          await result.current.handleEditPr({ body: "Rewritten", expectedBody: "Loaded body" }),
        ).toBe(true);
      });

      expect(bridgeMock.forgeEditPr).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ title: "Live title", body: "Rewritten" }),
      );
      expect(useGitStore.getState().prDetails["p1#7"]?.body).toBe("Rewritten");
    });

    it("refuses a description edit started from a stale copy without writing", async () => {
      const { result, onRefresh } = setup("Newer host description");

      await act(async () => {
        expect(
          await result.current.handleEditPr({ body: "Rewritten", expectedBody: "Loaded body" }),
        ).toBe(false);
      });

      expect(bridgeMock.forgeEditPr).not.toHaveBeenCalled();
      expect(toastDangerMock).toHaveBeenCalledExactlyOnceWith(
        "The description changed since you started editing. Reload and reapply your edit.",
      );
      expect(useGitStore.getState().prDetails["p1#7"]?.body).toBe("Loaded body");
      expect(onRefresh).not.toHaveBeenCalled();
    });

    it("writes nothing when neither field is edited or the title is blank", async () => {
      const { result } = setup("Loaded body");

      await act(async () => {
        expect(await result.current.handleEditPr({})).toBe(false);
        expect(await result.current.handleEditPr({ title: "   " })).toBe(false);
      });

      expect(bridgeMock.forgeGetPrDetails).not.toHaveBeenCalled();
      expect(bridgeMock.forgeEditPr).not.toHaveBeenCalled();
    });
  });

  it("saves a scoped edit and drops it when the source is replaced first", async () => {
    const prior = { ...openPr, source };
    useGitStore.setState({
      prData: { "__branchname:p1:feature": prior },
      prDetails: { "p1#7": reviewDetails },
    });
    bridgeMock.forgeGetPrDetails.mockResolvedValue({ pr: prior, details: reviewDetails });
    let release: (() => void) | undefined;
    bridgeMock.forgeEditPr.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const onRefresh = vi.fn<() => void>();
    const { result } = renderHook(() =>
      usePrWriteActions({
        projectLocation: { kind: "posix", path: "/repo" },
        projectId: "p1",
        prKey: "__branchname:p1:feature",
        onRefresh,
      }),
    );
    const pending = result.current.handleEditPr({ title: " Renamed ", body: "Notes" });
    await waitFor(() => expect(bridgeMock.forgeEditPr).toHaveBeenCalledTimes(1));
    expect(bridgeMock.forgeEditPr).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        prNumber: 7,
        title: "Renamed",
        body: "Notes",
        forgeAccount: source.account,
        forgeRepository: source.repository,
      }),
    );
    useGitStore.getState().setPrData("__branchname:p1:feature", {
      ...prior,
      source: { ...source, repository: "other/app" },
    });
    await act(async () => {
      release?.();
      expect(await pending).toBe(false);
    });
    expect(useGitStore.getState().prData["__branchname:p1:feature"]?.title).toBe(prior.title);
    expect(useGitStore.getState().prDetails["p1#7"]?.body).toBe("");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("keeps the replacement review busy when the old close fails", async () => {
    const prior = { ...openPr, source };
    const key = "__branchname:p1:feature";
    useGitStore.setState({ prData: { [key]: prior } });
    let rejectClose: (error: Error) => void = () => {};
    bridgeMock.forgeClosePr.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectClose = reject;
        }),
    );
    bridgeMock.forgeGetPrDetails.mockResolvedValue({ pr: prior, details: reviewDetails });
    let releaseEdit: (() => void) | undefined;
    bridgeMock.forgeEditPr.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseEdit = resolve;
        }),
    );
    const { result } = renderHook(() =>
      usePrWriteActions({
        projectLocation: { kind: "posix", path: "/repo" },
        projectId: "p1",
        prKey: key,
        onRefresh: () => {},
      }),
    );
    const closing = result.current.handleClosePr();
    await act(async () => {
      await Promise.resolve();
    });
    useGitStore.getState().setPrData(key, {
      ...prior,
      source: { ...source, repository: "other/app" },
    });
    const editing = result.current.handleEditPr({ title: "Current", body: "Notes" });
    await waitFor(() => expect(bridgeMock.forgeEditPr).toHaveBeenCalledTimes(1));
    expect(result.current.pendingAction).toBe("edit");
    await act(async () => {
      rejectClose(new Error("old close failed"));
      await closing;
    });
    expect(result.current.pendingAction).toBe("edit");
    expect(toastDangerMock).not.toHaveBeenCalled();
    await act(async () => {
      releaseEdit?.();
      expect(await editing).toBe(true);
    });
    expect(result.current.pendingAction).toBeNull();
  });

  describe.each([true, false])("conditional merge dispatch (scoped=%s)", (scoped) => {
    it.each(["a".repeat(40), "", "not-a-head"])(
      "never drops supplied condition %j",
      async (expectedHeadSha) => {
        const conditional = scoped ? bridgeMock.forgeMergePrAtHead : bridgeMock.ghMergePrAtHead;
        conditional.mockImplementation(async (input) => {
          ghMergePrAtHeadPayloadSchema.parse(input);
        });
        const payload = {
          projectLocation: { kind: "posix" as const, path: "/repo" },
          prNumber: 7,
          method: "squash" as const,
          admin: false,
        };
        const results = await Promise.allSettled([
          reviewClient(scoped ? bitbucketSource : undefined).merge(payload, expectedHeadSha),
        ]);
        expect(results[0]?.status).toBe(expectedHeadSha.length === 40 ? "fulfilled" : "rejected");
        expect(conditional).toHaveBeenCalledExactlyOnceWith({
          ...payload,
          ...(scoped
            ? { forgeAccount: bitbucketSource.account, forgeRepository: bitbucketSource.repository }
            : {}),
          expectedHeadSha,
        });
        expect(bridgeMock.forgeMergePr).not.toHaveBeenCalled();
        expect(bridgeMock.ghMergePr).not.toHaveBeenCalled();
      },
    );

    it("preserves the explicitly unconditional no-head route", async () => {
      const payload = {
        projectLocation: { kind: "posix" as const, path: "/repo" },
        prNumber: 7,
        method: "squash" as const,
        admin: false,
      };
      await reviewClient(scoped ? bitbucketSource : undefined).merge(payload);
      expect(scoped ? bridgeMock.forgeMergePr : bridgeMock.ghMergePr).toHaveBeenCalledOnce();
      expect(bridgeMock.forgeMergePrAtHead).not.toHaveBeenCalled();
      expect(bridgeMock.ghMergePrAtHead).not.toHaveBeenCalled();
    });
  });
});
