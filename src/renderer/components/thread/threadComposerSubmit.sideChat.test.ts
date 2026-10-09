import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { submitComposerPrompt, type ComposerSubmitContext } from "./threadComposerSubmit";

const mocks = vi.hoisted(() => ({
  open: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  submit: vi.fn<() => void>(),
  steer: vi.fn<() => void>(),
  queue: vi.fn<() => void>(),
  deny: vi.fn<() => void>(),
  clearDraft: vi.fn<() => void>(),
  saveDraft: vi.fn<(...args: unknown[]) => void>(),
}));
vi.mock("./SideChat/sideChatActions", () => ({
  canOpenSideChat: () => true,
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
      clearThreadDraftContent: mocks.clearDraft,
      saveThreadDraftContent: mocks.saveDraft,
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
  return {
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
      toSegments: () => [],
      clearAll: vi.fn<() => void>(),
      restore: vi.fn<() => void>(),
    } as never,
    mentionRef: { current: { clear: vi.fn<() => void>(), focus: vi.fn<() => void>() } as never },
    terminalPaneRef: { current: null },
    latestSegmentsRef: { current: [] },
    submittedRef: { current: false },
    isCurrentSession: () => true,
    setPrompt: vi.fn<() => void>(),
    setHasContent: vi.fn<() => void>(),
    setIsSubmitting: vi.fn<() => void>(),
    requestOpenControl: vi.fn<() => void>(),
  };
}
beforeEach(() => mocks.open.mockReset().mockResolvedValue(true));
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("side questions leave the parent runtime untouched", () => {
  it("keeps attachments in the parent draft when opening an empty side composer", async () => {
    const ctx = context();
    const attachment = { id: "file", path: "/fixture/note.txt", name: "note.txt", isImage: false };
    ctx.attachments.getAttachments = () => [attachment];
    submitComposerPrompt([{ kind: "text", content: "/btw" }], ctx);
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
    submitComposerPrompt([{ kind: "text", content: "/btw" }], ctx);
    await settled();
    expect(mocks.open).toHaveBeenCalledWith("parent");
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.steer).not.toHaveBeenCalled();
  });
  it("routes before denial, queue, steer and ordinary input", async () => {
    const ctx = context();
    submitComposerPrompt([{ kind: "text", content: "/btw why?" }], ctx);
    await settled();
    expect(mocks.open).toHaveBeenCalledWith("parent", "why?", [{ kind: "text", content: "why?" }]);
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
    submitComposerPrompt([{ kind: "text", content: "/btw explain " }, skill], ctx);
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
    submitComposerPrompt([{ kind: "text", content: "/btw question" }], ctx);
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
    submitComposerPrompt([{ kind: "text", content: "/btw question" }], ctx);
    ctx.latestSegmentsRef.current = [{ kind: "text", content: "next main question" }];
    resolveOpen(true);
    await settled();
    expect(ctx.mentionRef.current!.clear).not.toHaveBeenCalled();
    expect(ctx.attachments.clearAll).not.toHaveBeenCalled();
  });
});
