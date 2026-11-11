import "@/renderer/testUtils/clientDraftDatabase";
import { waitFor } from "@testing-library/react";
import { listClientSubmissions } from "@/renderer/state/composerDrafts/clientDraftDatabase";
import { settleClientSubmission } from "@/renderer/actions/clientDraftSubmission";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { submitComposerPrompt, type ComposerSubmitContext } from "./threadComposerSubmit";

const mocks = vi.hoisted(() => ({
  open: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  submit: vi.fn<() => void>(),
  steer: vi.fn<() => void>(),
  queue: vi.fn<(...args: unknown[]) => void>(),
  deny: vi.fn<() => void>(),
  clearDraft: vi.fn<() => void>(),
  saveDraft: vi.fn<(...args: unknown[]) => void>(),
}));
vi.mock("./SideChat/sideChatActions", () => ({
  sideChatAvailable: (_threadId: string, presentationMode: string) => presentationMode === "gui",
  openSideChat: mocks.open,
}));
vi.mock("@/renderer/actions/threadRuntimeActions", () => ({
  submitThreadInput: mocks.submit,
  setThreadPendingSteer: mocks.steer,
  resolveThreadServerRequest: mocks.deny,
  changeThreadConfig: vi.fn<() => void>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({ queueThreadFollowUp: mocks.queue }) }));
vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: {
    getState: () => ({
      threadDraftContents: {},
      clearThreadDraftContent: mocks.clearDraft,
      saveThreadDraftContent: mocks.saveDraft,
      requestChatScrollToPrompt: vi.fn<() => void>(),
    }),
  },
}));

const thread = {
  id: "parent",
  agentKind: "neutral-gui",
  config: { model: "default" },
  presentationMode: "gui",
  status: "working",
} as Thread;
function context(): ComposerSubmitContext {
  const ctx: ComposerSubmitContext = {
    thread,
    agentStatus: undefined,
    presentationMode: "gui",
    usesTerminalPresentation: false,
    canSubmit: true,
    usesPendingSteerPath: true,
    followUpBehavior: "queue",
    needsFocusBeforeInput: false,
    activeRuntimeRequest: { requestId: "approval", requestType: "permission" } as never,
    approvalDenyOption: { optionId: "deny", label: "Deny" },
    availableCommands: [],
    attachments: {
      attachments: [],
      getAttachments: () => [],
      getDraftAttachments: () => [],
      hasPendingUploads: () => false,
      toSegments: () => [],
      clearAll: vi.fn<() => void>(),
      restore: vi.fn<() => void>(),
    } as never,
    mentionRef: {
      current: {
        clear: vi.fn<() => void>(),
        focus: vi.fn<() => void>(),
        restoreFromSegments: vi.fn<() => void>(),
      } as never,
    },
    terminalPaneRef: { current: null },
    latestSegmentsRef: { current: [] },
    submittedRef: { current: false },
    isCurrentSession: () => true,
    setPrompt: vi.fn<() => void>(),
    setHasContent: vi.fn<() => void>(),
    setIsSubmitting: vi.fn<() => void>(),
    requestOpenControl: vi.fn<() => void>(),
  };
  ctx.attachments.getDraftAttachments = () => ctx.attachments.getAttachments();
  return ctx;
}
beforeEach(() =>
  mocks.open.mockReset().mockImplementation(async (...args) => {
    const options = args[3] as { clientSubmissionId?: string } | undefined;
    await settleClientSubmission(options?.clientSubmissionId, "accepted");
    return true;
  }),
);
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("side questions leave the parent runtime untouched", () => {
  it("keeps attachments in the parent draft when opening an empty side composer", async () => {
    const ctx = context();
    const attachment = { id: "file", path: "/fixture/note.txt", name: "note.txt", isImage: false };
    ctx.attachments.getAttachments = () => [attachment];
    await submitComposerPrompt([{ kind: "text", content: "/btw" }], ctx);
    await settled();
    expect(mocks.open).toHaveBeenCalledWith("parent");
    expect(ctx.attachments.clearAll).not.toHaveBeenCalled();
    expect(mocks.saveDraft).toHaveBeenCalledWith("parent", {
      segments: [],
      attachments: [attachment],
    });
  });
  it("opens an empty side composer for bare /btw without sending or steering", async () => {
    const ctx = context();
    await submitComposerPrompt([{ kind: "text", content: "/btw" }], ctx);
    await settled();
    expect(mocks.open).toHaveBeenCalledWith("parent");
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.steer).not.toHaveBeenCalled();
  });
  it("routes before denial, queue, steer and ordinary input", async () => {
    const ctx = context();
    await submitComposerPrompt([{ kind: "text", content: "/btw why?" }], ctx);
    await settled();
    expect(mocks.open).toHaveBeenCalledWith("parent", "why?", [{ kind: "text", content: "why?" }], {
      clientSubmissionId: expect.any(String),
    });
    expect(mocks.deny).not.toHaveBeenCalled();
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.steer).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(ctx.mentionRef.current!.clear).toHaveBeenCalled();
  });
  it("keeps side routing with nonleading skill chips and attachments", async () => {
    const ctx = context();
    ctx.attachments.toSegments = () => [
      { kind: "attachment", path: "/fixture/diagram.png", mimeType: "image/png" },
    ];
    const skill = {
      kind: "skill",
      name: "explain",
      invocation: "/explain",
      provider: "neutral-gui",
      scope: "project",
      path: "/fixture/SKILL.md",
    } as const;
    await submitComposerPrompt([{ kind: "text", content: "/btw explain " }, skill], ctx);
    await settled();
    expect(mocks.open.mock.calls[0]?.[2]).toEqual([
      { kind: "attachment", path: "/fixture/diagram.png", mimeType: "image/png" },
      { kind: "text", content: "explain " },
      skill,
    ]);
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.deny).not.toHaveBeenCalled();
  });
  it("does not clear the parent composer when the window cannot open", async () => {
    mocks.open.mockResolvedValue(false);
    const ctx = context();
    await submitComposerPrompt([{ kind: "text", content: "/btw question" }], ctx);
    await settled();
    expect(ctx.mentionRef.current!.clear).not.toHaveBeenCalled();
    expect(mocks.clearDraft).not.toHaveBeenCalled();
  });
  it("preserves a new draft typed while the context read is pending", async () => {
    let resolveOpen!: (value: boolean) => void;
    mocks.open.mockReturnValue(
      new Promise((resolve) => {
        resolveOpen = resolve;
      }),
    );
    const ctx = context();
    const pending = submitComposerPrompt([{ kind: "text", content: "/btw question" }], ctx);
    await waitFor(() => expect(mocks.open).toHaveBeenCalled());
    ctx.latestSegmentsRef.current = [{ kind: "text", content: "next main question" }];
    const options = mocks.open.mock.calls[0]?.[3] as { clientSubmissionId: string };
    await settleClientSubmission(options.clientSubmissionId, "accepted");
    resolveOpen(true);
    await pending;
    expect(ctx.mentionRef.current!.clear).not.toHaveBeenCalled();
    expect(ctx.attachments.clearAll).not.toHaveBeenCalled();
  });

  it("retains uncertain side-chat submissions and preserves failed ones when the parent editor changed", async () => {
    mocks.open.mockImplementationOnce(async (...args: unknown[]) => {
      const options = args[3] as { clientSubmissionId: string };
      await settleClientSubmission(options.clientSubmissionId, "uncertain");
      return true;
    });
    const ctx = context();
    ctx.latestSegmentsRef.current = [{ kind: "text", content: "/btw uncertain question" }];
    await submitComposerPrompt(ctx.latestSegmentsRef.current, ctx);
    expect(await listClientSubmissions()).toEqual([
      expect.objectContaining({ state: "uncertain" }),
    ]);

    let resolveOpen!: (opened: boolean) => void;
    mocks.open.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOpen = resolve;
      }),
    );
    const second = context();
    second.latestSegmentsRef.current = [{ kind: "text", content: "/btw failed after edit" }];
    const pending = submitComposerPrompt(second.latestSegmentsRef.current, second);
    await waitFor(() => expect(mocks.open).toHaveBeenCalledTimes(2));
    second.latestSegmentsRef.current = [{ kind: "text", content: "edited parent prompt" }];
    const options = mocks.open.mock.calls[1]?.[3] as { clientSubmissionId: string };
    await settleClientSubmission(options.clientSubmissionId, "failed");
    resolveOpen(false);
    await pending;
    expect(await listClientSubmissions()).toContainEqual(
      expect.objectContaining({ id: options.clientSubmissionId, state: "failed" }),
    );
  });
});

describe("per-message side conversation context", () => {
  it("keeps a fresh hidden snapshot with each queued message", async () => {
    const ctx = context();
    ctx.activeRuntimeRequest = undefined;
    ctx.captureClientContext = vi.fn<() => Promise<import("@/shared/contracts").TurnClientContext>>(
      async () => ({
        conversationSnapshot: { text: "new parent answer" },
      }),
    );
    await submitComposerPrompt([{ kind: "text", content: "follow-up question" }], ctx);
    await settled();
    expect(mocks.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "follow-up question",
        clientContext: { conversationSnapshot: { text: "new parent answer" } },
      }),
    );
    expect(mocks.queue.mock.calls[0]?.[0]).not.toHaveProperty("contextSummary");
  });
  it("keeps a locally rejected context capture retryable after preservation finishes", async () => {
    const ctx = context();
    ctx.activeRuntimeRequest = undefined;
    ctx.captureClientContext = async () => {
      throw new Error("context unavailable");
    };
    const segments = [{ kind: "text" as const, content: "retry after context recovers" }];
    await submitComposerPrompt(segments, ctx);
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(await listClientSubmissions()).toEqual([]);
    ctx.captureClientContext = async () => ({
      conversationSnapshot: { text: "context recovered" },
    });
    await submitComposerPrompt(segments, ctx);
    expect(mocks.queue).toHaveBeenCalledOnce();
  });

  it("retains the draft and does not send when required context rejects", async () => {
    const ctx = context();
    ctx.followUpBehavior = "steer";
    ctx.captureClientContext = async () => {
      throw new Error("latest context unavailable");
    };
    await submitComposerPrompt([{ kind: "text", content: "follow-up question" }], ctx);
    await settled();
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.deny).not.toHaveBeenCalled();
    expect(mocks.saveDraft).toHaveBeenCalledWith(
      "parent",
      expect.objectContaining({ segments: [{ kind: "text", content: "follow-up question" }] }),
    );
  });
});
