// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ForgeRepository,
  ForgePrReviewGuideResult,
  ForgePrViewedFilesResult,
  PrData,
  PrDetails,
  PrComment,
  PrFile,
  PrReviewThread,
  Project,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useGitStore } from "@/renderer/state/gitStore";
import { useAppStore } from "@/renderer/state/appStore";
import { sha256Hex } from "@/shared/remote/contract/sha256";
import { useSidebarOverlayStore } from "@/renderer/state/sidebarOverlayStore";

const layout = vi.hoisted(() => ({ compact: false }));

const bridge = vi.hoisted(() => ({
  ghGetPrFiles: vi.fn<() => Promise<{ files: PrFile[] }>>(),
  ghGetPrDiff: vi.fn<() => Promise<{ diff: string }>>(),
  ghGetPrDetails: vi.fn<() => Promise<{ details: PrDetails; pr?: PrData }>>(),
  ghGetPrReviewComments: vi.fn<() => Promise<{ threads: PrReviewThread[] }>>(),
  forgeGetPrDetails: vi.fn<() => Promise<{ details: PrDetails; pr?: PrData }>>(),
  forgeGetPrFiles: vi.fn<() => Promise<{ files: PrFile[] }>>(),
  forgeGetPrDiff: vi.fn<() => Promise<{ diff: string }>>(),
  forgeGetPrReviewComments: vi.fn<() => Promise<{ threads: PrReviewThread[] }>>(),
  ghSubmitPrReview: vi.fn<() => Promise<void>>(),
  ghPostPrComment: vi.fn<() => Promise<PrComment>>(),
  forgeSubmitPrReview: vi.fn<() => Promise<void>>(),
  forgePostPrComment: vi.fn<() => Promise<PrComment>>(),
  forgeEditPr: vi.fn<() => Promise<void>>(),
  forgeEditPrComment: vi.fn<() => Promise<void>>(),
  forgeGetPrViewedFiles: vi.fn<() => Promise<ForgePrViewedFilesResult>>(),
  forgeSetPrFileViewed: vi.fn<() => Promise<ForgePrViewedFilesResult>>(),
  forgeGetPrReviewGuide: vi.fn<() => Promise<ForgePrReviewGuideResult>>(),
  openExternal: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/renderer/adaptiveLayout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/adaptiveLayout")>()),
  useCompactLayout: () => layout.compact,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isMac: () => false,
  isWindows: () => false,
}));

import { reviewViewedScope } from "@/renderer/utils/forgeReviews";
import { PR_VIEWED_FILES_STORAGE_KEY } from "./parts/prViewedFiles";
import { viewedFingerprint } from "@/shared/reviewDiff";
import { PrReviewOverlay } from "./PrReviewOverlay";
import * as reviewOfflineCache from "@/renderer/browser/offlineReviewCache";
import { RemoteClientError } from "@/shared/remote/clientErrors";

const project: Project = {
  id: "project-1",
  name: "Poracode",
  createdAt: "2026-07-25T10:00:00.000Z",
  location: { kind: "windows", path: "C:\\repo" },
};

const files: PrFile[] = [{ path: "src/compact-only.ts", additions: 4, deletions: 1 }];

const details: PrDetails = {
  number: 12,
  title: "Compact PR review",
  body: "Review body",
  author: { login: "alice" },
  baseBranch: "main",
  headBranch: "feature",
  additions: 4,
  deletions: 1,
  changedFiles: 1,
  comments: [],
  reviews: [],
  commits: [],
  checks: [],
};

const forgeSource: ForgeRepository = {
  forge: "gitlab",
  host: "https://git.example/gitlab",
  repository: "team/app",
  remote: "origin",
  account: { forge: "gitlab", host: "https://git.example/gitlab", login: "alice" },
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

const scopedPr: PrData = {
  number: 12,
  title: details.title,
  state: "open",
  url: "https://git.example/gitlab/team/app/-/merge_requests/12",
  baseBranch: details.baseBranch,
  isDraft: false,
  updatedAt: "",
  source: forgeSource,
};

const replacementSources: [string, ForgeRepository][] = [
  ["legacy", forgeSource],
  ["account", { ...forgeSource, account: { ...forgeSource.account!, login: "bob" } }],
  [
    "host",
    {
      ...forgeSource,
      host: "https://other.example/gitlab",
      account: { ...forgeSource.account!, host: "https://other.example/gitlab" },
    },
  ],
  ["repository", { ...forgeSource, repository: "other/app" }],
];

describe("PrReviewOverlay", () => {
  beforeEach(() => {
    layout.compact = false;
    bridge.ghGetPrFiles.mockReset().mockResolvedValue({ files });
    bridge.ghGetPrDiff.mockReset().mockResolvedValue({ diff: "" });
    bridge.ghGetPrDetails.mockReset().mockResolvedValue({ details });
    bridge.ghGetPrReviewComments.mockReset().mockResolvedValue({ threads: [] });
    bridge.forgeGetPrFiles.mockReset().mockResolvedValue({ files });
    bridge.forgeGetPrDiff.mockReset().mockResolvedValue({ diff: "" });
    bridge.forgeGetPrDetails
      .mockReset()
      .mockResolvedValue({ details: { ...details, source: forgeSource } });
    bridge.forgeGetPrReviewComments.mockReset().mockResolvedValue({ threads: [] });
    bridge.ghSubmitPrReview.mockReset();
    bridge.ghPostPrComment.mockReset();
    bridge.forgeSubmitPrReview.mockReset();
    bridge.forgePostPrComment.mockReset();
    bridge.forgeEditPr.mockReset().mockResolvedValue(undefined);
    bridge.forgeEditPrComment.mockReset().mockResolvedValue(undefined);
    bridge.forgeGetPrViewedFiles.mockReset().mockResolvedValue({ storage: "host", files: [] });
    bridge.forgeSetPrFileViewed.mockReset().mockResolvedValue({ storage: "host", files: [] });
    bridge.forgeGetPrReviewGuide
      .mockReset()
      .mockResolvedValue({ status: "empty", stale: false, guide: null });
    useGitStore.setState({
      prFiles: {},
      prDiffs: {},
      prDetails: {},
      prData: {},
    });
    useSidebarOverlayStore.setState({ isCollapsed: false, isAutoCollapsed: false });
    localStorage.clear();
  });

  it("opens a review question in the selected project's composer without discarding its draft", async () => {
    const source = {
      ...forgeSource,
      capabilities: { ...forgeSource.capabilities, reviewGuides: true as const },
    };
    const pr = { ...scopedPr, source, headSha: "a".repeat(40) };
    bridge.forgeGetPrDetails.mockResolvedValue({ details: { ...details, source }, pr });
    bridge.forgeGetPrDiff.mockResolvedValue({ diff: "current diff" });
    bridge.forgeGetPrReviewGuide.mockResolvedValue({
      status: "ready",
      stale: false,
      diffHash: sha256Hex("current diff"),
      guide: {
        version: 1,
        fingerprint: "guide",
        model: "writer",
        createdAt: "2026-10-20T00:00:00Z",
        summary: "Review summary",
        stops: [
          {
            title: "Read behavior",
            body: "Review context",
            lookClosely: false,
            files: ["src/compact-only.ts"],
            excerpts: [],
            questions: ["Why change this?"],
          },
        ],
      },
    });
    useGitStore.setState({ prData: { "__branch:project-1": pr } });
    const draft = {
      segments: [{ kind: "text" as const, content: "Keep my unsent input" }],
      attachments: [],
    };
    useAppStore.setState({ draftContents: { [project.id]: draft }, pendingComposerSeeds: {} });
    const close = vi.fn<() => void>();
    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={close}
      />,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Guide" }));
    fireEvent.click(await screen.findByRole("button", { name: "Why change this?" }));
    expect(useAppStore.getState().draftContents[project.id]).toEqual(draft);
    const seed = useAppStore.getState().pendingComposerSeeds[project.id]?.text;
    expect(seed).toContain(pr.headSha);
    expect(seed).toContain(pr.url);
    expect(seed).toContain("Why change this?");
    expect(useAppStore.getState().view).toMatchObject({ kind: "draft", projectId: project.id });
    expect(close).toHaveBeenCalledOnce();
  });

  it("opens a cached review read-only and refreshes it when the host reconnects", async () => {
    const owner = { key: "selected-owner", online: false, canRead: true };
    const online = vi.spyOn(reviewOfflineCache, "useBrowserReviewOnline").mockReturnValue(false);
    const currentOwner = vi.spyOn(reviewOfflineCache, "browserReviewOwner").mockReturnValue(owner);
    const cached = {
      details: {
        ...details,
        source: forgeSource,
        comments: [
          {
            id: "offline-comment",
            author: { login: "alice" },
            body: "Cached comment",
            createdAt: "2026-10-20T00:00:00Z",
          },
        ],
      },
      files,
      diff: "cached diff",
      pr: scopedPr,
    };
    const read = vi
      .spyOn(reviewOfflineCache, "readBrowserReviewCache")
      .mockImplementation(async (_key, schema) => schema.parse(cached));
    const write = vi.spyOn(reviewOfflineCache, "writeBrowserReviewCache").mockResolvedValue();
    const offline = new RemoteClientError("Offline", 0, "offline");
    bridge.forgeGetPrDetails.mockRejectedValue(offline);
    bridge.forgeGetPrFiles.mockRejectedValue(offline);
    bridge.forgeGetPrDiff.mockRejectedValue(offline);
    useGitStore.setState({ prData: { "__branch:project-1": scopedPr } });
    const view = render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );
    try {
      expect(await screen.findByText("Cached comment")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Write a comment" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Submit review" })).toBeDisabled();
      expect(screen.getByText("Offline")).toBeInTheDocument();
      expect(bridge.forgePostPrComment).not.toHaveBeenCalled();
      online.mockReturnValue(true);
      currentOwner.mockReturnValue({ ...owner, online: true });
      bridge.forgeGetPrDetails.mockResolvedValue({ details: { ...details, source: forgeSource } });
      bridge.forgeGetPrFiles.mockResolvedValue({ files });
      bridge.forgeGetPrDiff.mockResolvedValue({ diff: "fresh diff" });
      view.rerender(
        <PrReviewOverlay
          project={project}
          prNumber={12}
          prKey="__branch:project-1"
          onClose={() => {}}
        />,
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Submit review" })).toBeEnabled(),
      );
      expect(screen.queryByText("Cached comment")).not.toBeInTheDocument();
      expect(useGitStore.getState().prDiffs["project-1#12"]).toBe("fresh diff");
    } finally {
      view.unmount();
      online.mockRestore();
      currentOwner.mockRestore();
      read.mockRestore();
      write.mockRestore();
    }
  });

  it("edits an owned comment with its original body and explicit source", async () => {
    const source: ForgeRepository = {
      ...forgeSource,
      capabilities: { ...forgeSource.capabilities, commentEditing: ["conversation"] },
    };
    const comment: PrComment = {
      id: "own-comment",
      body: "Original comment",
      author: { login: "alice" },
      createdAt: "2026-10-20T10:00:00Z",
    };
    bridge.forgeGetPrDetails.mockResolvedValue({
      details: { ...details, source, comments: [comment] },
    });
    useGitStore.setState({ prData: { "__branch:project-1": { ...scopedPr, source } } });
    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );
    const edit = await screen.findByRole("button", { name: "Edit comment" });
    await waitFor(() => expect(edit).toBeEnabled());
    fireEvent.click(edit);
    fireEvent.change(screen.getByRole("textbox", { name: "Edit comment" }), {
      target: { value: "Updated comment" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(bridge.forgeEditPrComment).toHaveBeenCalledExactlyOnceWith({
        projectLocation: project.location,
        prNumber: 12,
        commentId: comment.id,
        body: "Updated comment",
        expectedBody: comment.body,
        forgeAccount: source.account,
        forgeRepository: source.repository,
      }),
    );
    await waitFor(() => expect(bridge.forgeGetPrDetails).toHaveBeenCalledTimes(2));
  });

  it("discards an owned comment editor when the selected account changes", async () => {
    const source: ForgeRepository = {
      ...forgeSource,
      capabilities: { ...forgeSource.capabilities, commentEditing: ["conversation"] },
    };
    const comment: PrComment = {
      id: "own-comment",
      body: "Original comment",
      author: { login: "alice" },
      createdAt: "2026-10-20T10:00:00Z",
    };
    bridge.forgeGetPrDetails.mockResolvedValue({
      details: { ...details, source, comments: [comment] },
    });
    useGitStore.setState({ prData: { "__branch:project-1": { ...scopedPr, source } } });
    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );
    const edit = await screen.findByRole("button", { name: "Edit comment" });
    await waitFor(() => expect(edit).toBeEnabled());
    fireEvent.click(edit);
    const form = screen.getByRole("button", { name: "Save" }).closest("form")!;
    const replacement = { ...source, account: { ...source.account!, login: "bob" } };
    bridge.forgeGetPrDetails.mockResolvedValue({
      details: { ...details, source: replacement, comments: [comment] },
    });
    act(() =>
      useGitStore.getState().setPrData("__branch:project-1", { ...scopedPr, source: replacement }),
    );
    fireEvent.submit(form);
    await waitFor(() => expect(bridge.forgeGetPrDetails).toHaveBeenCalledTimes(2));
    expect(bridge.forgeEditPrComment).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Edit comment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit comment" })).not.toBeInTheDocument();
  });

  it("loads account-scoped viewed marks without importing device-local ticks", async () => {
    const source: ForgeRepository = {
      ...forgeSource,
      capabilities: { ...forgeSource.capabilities, viewedFiles: "host" },
    };
    localStorage.setItem(
      PR_VIEWED_FILES_STORAGE_KEY,
      JSON.stringify({
        [reviewViewedScope(source, project.id, 12)]: {
          [files[0]!.path]: viewedFingerprint("", files[0]!),
        },
      }),
    );
    bridge.forgeGetPrDetails.mockResolvedValue({ details: { ...details, source } });
    useGitStore.setState({ prData: { "__branch:project-1": { ...scopedPr, source } } });
    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );
    await waitFor(() =>
      expect(bridge.forgeGetPrViewedFiles).toHaveBeenCalledExactlyOnceWith({
        projectLocation: project.location,
        prNumber: 12,
        forgeAccount: source.account,
        forgeRepository: source.repository,
      }),
    );
    expect(bridge.forgeSetPrFileViewed).not.toHaveBeenCalled();
    expect(await screen.findByText("0 of 1 viewed")).toBeInTheDocument();
  });

  it.each(["number", "account"])(
    "does not save an edit draft after its %s changes",
    async (change) => {
      useGitStore.setState({ prData: { "__branch:project-1": scopedPr } });
      render(
        <PrReviewOverlay
          project={project}
          prNumber={12}
          prKey="__branch:project-1"
          onClose={() => {}}
        />,
      );
      const edit = await screen.findByRole("button", { name: "Edit" });
      await waitFor(() => expect(edit).toBeEnabled());
      fireEvent.click(edit);
      fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
        target: { value: "Old review draft" },
      });
      const form = screen.getByRole("button", { name: "Save" }).closest("form")!;
      const source = { ...forgeSource, account: { ...forgeSource.account!, login: "bob" } };
      bridge.forgeGetPrDetails.mockResolvedValue({ details: { ...details, source } });
      act(() =>
        useGitStore
          .getState()
          .setPrData(
            "__branch:project-1",
            change === "number" ? { ...scopedPr, number: 13 } : { ...scopedPr, source },
          ),
      );
      fireEvent.submit(form);
      await waitFor(() => expect(bridge.forgeGetPrDetails).toHaveBeenCalled());
      expect(bridge.forgeEditPr).not.toHaveBeenCalled();
      expect(screen.queryByDisplayValue("Old review draft")).not.toBeInTheDocument();
    },
  );

  it("reloads review content when the branch head changes", async () => {
    useGitStore.setState({
      prData: { "__branch:project-1": { ...scopedPr, headSha: "a".repeat(40) } },
    });
    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled());
    const held = Promise.withResolvers<{ diff: string }>();
    bridge.forgeGetPrDiff.mockReturnValueOnce(held.promise);
    act(() =>
      useGitStore
        .getState()
        .setPrData("__branch:project-1", { ...scopedPr, headSha: "b".repeat(40) }),
    );
    await waitFor(() => expect(bridge.forgeGetPrDiff).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    await act(async () => {
      held.resolve({ diff: "new head diff" });
      await held.promise;
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled());
    expect(useGitStore.getState().prDiffs["project-1#12"]).toBe("new head diff");
  });

  it("keeps writes disabled when a replacement source diff fails to load", async () => {
    useGitStore.setState({ prData: { "__branch:project-1": scopedPr } });
    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled());
    const source = { ...forgeSource, account: { ...forgeSource.account!, login: "bob" } };
    const held = Promise.withResolvers<{ diff: string }>();
    bridge.forgeGetPrDiff.mockReturnValueOnce(held.promise);
    bridge.forgeGetPrDetails.mockResolvedValue({ details: { ...details, source } });
    act(() => useGitStore.getState().setPrData("__branch:project-1", { ...scopedPr, source }));
    await waitFor(() => expect(bridge.forgeGetPrDiff).toHaveBeenCalledTimes(2));
    await act(async () => {
      held.reject(new Error("fixture diff unavailable"));
      await held.promise.catch(() => {});
    });
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Merge options" })).toBeDisabled();
  });

  it("does not treat another account's viewed tick as this review", async () => {
    const otherAccount = { ...forgeSource, account: { ...forgeSource.account!, login: "bob" } };
    localStorage.setItem(
      PR_VIEWED_FILES_STORAGE_KEY,
      JSON.stringify({
        [reviewViewedScope(forgeSource, project.id, 12)]: {
          "src/compact-only.ts": viewedFingerprint(undefined, files[0]!),
        },
      }),
    );
    useGitStore.setState({
      prData: {
        "__branch:project-1": { ...scopedPr, source: otherAccount },
      },
    });
    bridge.forgeGetPrDetails.mockResolvedValue({
      details: { ...details, source: otherAccount },
      pr: { ...scopedPr, source: otherAccount },
    });

    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );

    expect(await screen.findByRole("checkbox", { name: "Mark as viewed" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Mark as not viewed" })).not.toBeInTheDocument();
  });

  it("collapses a file after it is marked viewed on this device", async () => {
    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );

    fireEvent.click(await screen.findByRole("checkbox", { name: "Mark as viewed" }));
    expect(screen.getByRole("button", { name: /Viewed here/ })).toBeInTheDocument();
    expect(screen.queryByText("compact-only.ts")).not.toBeInTheDocument();
  });

  it("navigates the file list and PR conversation as compact pages", async () => {
    layout.compact = true;
    useSidebarOverlayStore.setState({ isCollapsed: true, isAutoCollapsed: true });

    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );

    const main = screen.getByRole("main");
    const file = await within(main).findByText("compact-only.ts");
    expect(file.closest(".invisible")).toBeNull();
    expect(within(main).getByRole("button", { name: "Conversation" })).toBeInTheDocument();
    expect(within(main).queryByRole("tab", { name: /Conversation/ })).not.toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "Refresh" })).toHaveClass(
      "m-home-compose-action",
    );

    fireEvent.click(within(main).getByRole("button", { name: "Conversation" }));
    await waitFor(() => {
      expect(within(main).getByRole("tab", { name: /Conversation/ })).toBeInTheDocument();
    });
    expect(within(main).queryByText("compact-only.ts")).not.toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "Submit review" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await within(main).findByText("compact-only.ts")).toBeInTheDocument();
    expect(within(main).queryByRole("tab", { name: /Conversation/ })).not.toBeInTheDocument();
  });

  it("loads scoped host review threads and preserves their file and resolution state", async () => {
    const heldDetails = Promise.withResolvers<{ details: PrDetails }>();
    const source = forgeSource;
    useGitStore.setState({
      prData: {
        "__branch:project-1": {
          number: 12,
          title: details.title,
          state: "open",
          url: "https://git.example/gitlab/team/app/-/merge_requests/12",
          baseBranch: "main",
          isDraft: false,
          updatedAt: "",
          source,
        },
      },
    });
    bridge.forgeGetPrFiles.mockResolvedValue({ files });
    bridge.forgeGetPrDiff.mockResolvedValue({ diff: "" });
    bridge.forgeGetPrDetails.mockReturnValue(heldDetails.promise);
    bridge.forgeGetPrReviewComments.mockResolvedValue({
      threads: [
        {
          id: "thread",
          path: "src/compact-only.ts",
          line: 4,
          isResolved: false,
          isOutdated: false,
          comments: [
            {
              id: "comment",
              author: { login: "reviewer" },
              body: "Please handle the empty input",
              createdAt: "2026-10-16T10:00:00Z",
            },
          ],
        },
      ],
    });
    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Submit review" })).toBeDisabled();
    await act(async () => {
      heldDetails.resolve({ details: { ...details, source } });
      await heldDetails.promise;
    });
    expect(await screen.findByText("Please handle the empty input")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit review" })).not.toBeDisabled();
    expect(screen.getByText("Unresolved")).toBeInTheDocument();
    expect(bridge.forgeGetPrReviewComments).toHaveBeenCalledWith({
      projectLocation: project.location,
      prNumber: 12,
      forgeAccount: source.account,
      forgeRepository: "team/app",
    });
    expect(bridge.ghGetPrDetails).not.toHaveBeenCalled();
  });

  it("does not publish unscoped feedback after review details fail to load", async () => {
    useGitStore.setState({
      prData: {
        "__branch:project-1": {
          number: 12,
          title: details.title,
          state: "open",
          url: "https://git.example/gitlab/team/app/-/merge_requests/12",
          baseBranch: details.baseBranch,
          isDraft: false,
          updatedAt: "",
          source: forgeSource,
        },
      },
    });
    bridge.forgeGetPrFiles.mockResolvedValue({ files });
    bridge.forgeGetPrDiff.mockResolvedValue({ diff: "" });
    bridge.forgeGetPrDetails.mockRejectedValue(new Error("Fixture review unavailable"));
    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );
    const composer = await screen.findByRole("textbox", { name: "Write a comment" });
    expect(composer).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit review" })).toBeDisabled();
    fireEvent.change(composer, { target: { value: "Must not publish" } });
    fireEvent.keyDown(composer, { key: "Enter", ctrlKey: true });
    expect(bridge.ghPostPrComment).not.toHaveBeenCalled();
    expect(bridge.ghSubmitPrReview).not.toHaveBeenCalled();
  });

  it.each(replacementSources)(
    "reloads a same-key %s source change and rejects the held old load",
    async (change, replacementSource) => {
      const priorPr = { ...scopedPr };
      if (change === "legacy") delete priorPr.source;
      const priorDetails = change === "legacy" ? details : { ...details, source: forgeSource };
      const replacementPr = { ...scopedPr, title: "Current B", source: replacementSource };
      const replacementDetails = { ...details, title: "Current B", source: replacementSource };
      const heldFiles = Promise.withResolvers<{ files: PrFile[] }>();
      const heldDiff = Promise.withResolvers<{ diff: string }>();
      const heldDetails = Promise.withResolvers<{ details: PrDetails; pr?: PrData }>();
      const heldReplacement = Promise.withResolvers<{ details: PrDetails; pr?: PrData }>();
      const replacementFiles = [{ path: "src/current-b.ts", additions: 2, deletions: 0 }];
      bridge.forgeGetPrFiles.mockResolvedValue({ files: replacementFiles });
      bridge.forgeGetPrDiff.mockResolvedValue({ diff: "Current B diff" });
      bridge.forgeGetPrDetails.mockReturnValue(heldReplacement.promise);
      const priorFiles = change === "legacy" ? bridge.ghGetPrFiles : bridge.forgeGetPrFiles;
      const priorDiff = change === "legacy" ? bridge.ghGetPrDiff : bridge.forgeGetPrDiff;
      const priorRead = change === "legacy" ? bridge.ghGetPrDetails : bridge.forgeGetPrDetails;
      priorFiles.mockReturnValueOnce(heldFiles.promise);
      priorDiff.mockReturnValueOnce(heldDiff.promise);
      priorRead.mockReturnValueOnce(heldDetails.promise);
      useGitStore.setState({ prData: { "__branch:project-1": priorPr } });
      render(
        <PrReviewOverlay
          project={project}
          prNumber={12}
          prKey="__branch:project-1"
          onClose={() => {}}
        />,
      );
      act(() => useGitStore.getState().setPrData("__branch:project-1", replacementPr));
      await waitFor(() =>
        expect(bridge.forgeGetPrDetails).toHaveBeenCalledTimes(change === "legacy" ? 1 : 2),
      );
      await act(async () => {
        heldFiles.resolve({ files });
        heldDiff.resolve({ diff: "Old A diff" });
        heldDetails.resolve({ details: priorDetails, pr: priorPr });
        await Promise.all([heldFiles.promise, heldDiff.promise, heldDetails.promise]);
      });
      expect(useGitStore.getState().prData["__branch:project-1"]).toBe(replacementPr);
      expect(useGitStore.getState().prFiles["project-1#12"]).toEqual(replacementFiles);
      expect(useGitStore.getState().prDiffs["project-1#12"]).toBe("Current B diff");
      expect(useGitStore.getState().prDetails["project-1#12"]).toBeUndefined();
      expect(screen.getByRole("button", { name: "Submit review" })).toBeDisabled();
      await act(async () => {
        heldReplacement.resolve({ details: replacementDetails, pr: replacementPr });
        await heldReplacement.promise;
      });
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Submit review" })).not.toBeDisabled(),
      );
      expect(useGitStore.getState().prData["__branch:project-1"]).toBe(replacementPr);
      expect(useGitStore.getState().prDetails["project-1#12"]?.source).toEqual(replacementSource);
      expect(bridge.forgeGetPrDetails).toHaveBeenLastCalledWith({
        projectLocation: project.location,
        prNumber: 12,
        forgeAccount: replacementSource.account,
        forgeRepository: replacementSource.repository,
      });
      expect(bridge.forgeGetPrReviewComments).toHaveBeenCalledOnce();
    },
  );

  it("invalidates old scoped details and a held thread read while the replacement loads", async () => {
    const heldThreads = Promise.withResolvers<{ threads: PrReviewThread[] }>();
    const heldReplacement = Promise.withResolvers<{ details: PrDetails; pr?: PrData }>();
    const replacementSource = replacementSources[1]![1];
    const replacementPr = { ...scopedPr, source: replacementSource };
    bridge.forgeGetPrDetails
      .mockResolvedValueOnce({ details: { ...details, source: forgeSource }, pr: scopedPr })
      .mockReturnValue(heldReplacement.promise);
    bridge.forgeGetPrReviewComments.mockReturnValueOnce(heldThreads.promise);
    useGitStore.setState({ prData: { "__branch:project-1": scopedPr } });
    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(bridge.forgeGetPrReviewComments).toHaveBeenCalledOnce());
    act(() => useGitStore.getState().setPrData("__branch:project-1", replacementPr));
    expect(screen.getByRole("button", { name: "Submit review" })).toBeDisabled();
    await act(async () => {
      heldThreads.resolve({ threads: [] });
      await heldThreads.promise;
    });
    expect(useGitStore.getState().prDetails["project-1#12"]).toBeUndefined();
    expect(screen.getByRole("button", { name: "Submit review" })).toBeDisabled();
    await act(async () => {
      heldReplacement.resolve({
        pr: replacementPr,
        details: { ...details, source: replacementSource },
      });
      await heldReplacement.promise;
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Submit review" })).not.toBeDisabled(),
    );
    expect(useGitStore.getState().prDetails["project-1#12"]?.source).toEqual(replacementSource);
    expect(bridge.forgeGetPrReviewComments).toHaveBeenCalledTimes(2);
  });

  it.each(["cleared", "renumbered"])(
    "does not reload a %s scoped row through the legacy fallback",
    async (change) => {
      const held = Promise.withResolvers<{ details: PrDetails; pr?: PrData }>();
      bridge.forgeGetPrDetails.mockReturnValue(held.promise);
      useGitStore.setState({ prData: { "__branch:project-1": scopedPr } });
      render(
        <PrReviewOverlay
          project={project}
          prNumber={12}
          prKey="__branch:project-1"
          onClose={() => {}}
        />,
      );
      const replacement = change === "cleared" ? null : { ...scopedPr, number: 13 };
      act(() => useGitStore.getState().setPrData("__branch:project-1", replacement));
      await act(async () => {
        held.resolve({ details: { ...details, source: forgeSource }, pr: scopedPr });
        await held.promise;
      });
      expect(useGitStore.getState().prData["__branch:project-1"]).toBe(replacement);
      expect(useGitStore.getState().prDetails["project-1#12"]).toBeUndefined();
      expect(bridge.ghGetPrDetails).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Submit review" })).toBeDisabled();
      const composer = screen.getByRole("textbox", { name: "Write a comment" });
      expect(composer).toBeDisabled();
      fireEvent.change(composer, { target: { value: "Must not publish" } });
      fireEvent.keyDown(composer, { key: "Enter", ctrlKey: true });
      expect(bridge.ghPostPrComment).not.toHaveBeenCalled();
      expect(bridge.forgePostPrComment).not.toHaveBeenCalled();
    },
  );

  it.each(["comment", "review"])(
    "keeps a held %s completion bound to its original source",
    async (feedback) => {
      const heldComment = Promise.withResolvers<PrComment>();
      const heldReview = Promise.withResolvers<void>();
      bridge.forgePostPrComment.mockReturnValue(heldComment.promise);
      bridge.forgeSubmitPrReview.mockReturnValue(heldReview.promise);
      useGitStore.setState({ prData: { "__branch:project-1": scopedPr } });
      render(
        <PrReviewOverlay
          project={project}
          prNumber={12}
          prKey="__branch:project-1"
          onClose={() => {}}
        />,
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Submit review" })).not.toBeDisabled(),
      );
      if (feedback === "comment") {
        const composer = screen.getByRole("textbox", { name: "Write a comment" });
        fireEvent.change(composer, { target: { value: "A feedback" } });
        fireEvent.keyDown(composer, { key: "Enter", ctrlKey: true });
      } else {
        fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
        const composer = await screen.findByRole("textbox", { name: "Review comment" });
        fireEvent.change(composer, { target: { value: "A feedback" } });
        fireEvent.click(screen.getAllByRole("button", { name: "Submit review" }).at(-1)!);
      }
      const replacementSource = replacementSources[1]![1];
      const replacementPr = { ...scopedPr, source: replacementSource };
      bridge.forgeGetPrDetails.mockResolvedValue({
        pr: replacementPr,
        details: { ...details, source: replacementSource },
      });
      act(() => useGitStore.getState().setPrData("__branch:project-1", replacementPr));
      await waitFor(() =>
        expect(useGitStore.getState().prDetails["project-1#12"]?.source).toEqual(replacementSource),
      );
      await act(async () => {
        heldComment.resolve({
          id: "old-a-comment",
          body: "A feedback",
          author: { login: "alice" },
          createdAt: "2026-10-17T10:00:00Z",
        });
        heldReview.resolve();
        await Promise.all([heldComment.promise, heldReview.promise]);
      });
      const mutation =
        feedback === "comment" ? bridge.forgePostPrComment : bridge.forgeSubmitPrReview;
      expect(mutation).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          forgeAccount: forgeSource.account,
          forgeRepository: forgeSource.repository,
          body: "A feedback",
        }),
      );
      expect(useGitStore.getState().prData["__branch:project-1"]).toBe(replacementPr);
      expect(useGitStore.getState().prDetails["project-1#12"]?.source).toEqual(replacementSource);
      expect(useGitStore.getState().prDetails["project-1#12"]?.comments).toEqual([]);
      expect(bridge.forgeGetPrDetails).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole("textbox", {
          name: feedback === "comment" ? "Write a comment" : "Review comment",
        }),
      ).toHaveValue("A feedback");
      expect(bridge.ghPostPrComment).not.toHaveBeenCalled();
      expect(bridge.ghSubmitPrReview).not.toHaveBeenCalled();
    },
  );

  it("keeps a scoped comment completion working through a same-source refresh", async () => {
    const held = Promise.withResolvers<PrComment>();
    bridge.forgePostPrComment.mockReturnValue(held.promise);
    useGitStore.setState({ prData: { "__branch:project-1": scopedPr } });
    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );
    const composer = await screen.findByRole("textbox", { name: "Write a comment" });
    fireEvent.change(composer, { target: { value: "Accepted A feedback" } });
    fireEvent.keyDown(composer, { key: "Enter", ctrlKey: true });
    const refreshedPr = { ...scopedPr, updatedAt: "2026-10-17T10:01:00Z" };
    const posted: PrComment = {
      id: "accepted-a-comment",
      body: "Accepted A feedback",
      author: { login: "alice" },
      createdAt: "2026-10-17T10:00:00Z",
    };
    act(() => useGitStore.getState().setPrData("__branch:project-1", refreshedPr));
    bridge.forgeGetPrDetails.mockResolvedValue({
      pr: refreshedPr,
      details: { ...details, source: forgeSource, comments: [posted] },
    });
    await act(async () => {
      held.resolve(posted);
      await held.promise;
    });
    expect(await screen.findByText("Accepted A feedback")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Write a comment" })).toHaveValue("");
    expect(bridge.forgePostPrComment).toHaveBeenCalledOnce();
    expect(bridge.forgeGetPrDetails).toHaveBeenCalledTimes(2);
  });

  it("does not let a delayed thread read overwrite a newer conversation load", async () => {
    const held = Promise.withResolvers<{ threads: PrReviewThread[] }>();
    bridge.ghGetPrReviewComments
      .mockReturnValueOnce(held.promise)
      .mockResolvedValue({ threads: [] });
    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(bridge.ghGetPrReviewComments).toHaveBeenCalledOnce());
    bridge.ghGetPrDetails.mockResolvedValue({
      details: {
        ...details,
        comments: [
          {
            id: "new",
            author: { login: "alice" },
            body: "New comment must remain visible",
            createdAt: "2026-10-16T10:01:00Z",
          },
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("New comment must remain visible")).toBeInTheDocument();
    await act(async () => {
      held.resolve({ threads: [] });
      await held.promise;
    });
    expect(screen.getByText("New comment must remain visible")).toBeInTheDocument();
  });
});
