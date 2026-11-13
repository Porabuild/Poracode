import "@/renderer/testUtils/clientDraftDatabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { ThreadWindowBootstrap, ThreadWindowNavigation } from "@/shared/ipc/threadWindow";
import {
  composerDraftStorage,
  createComposerDraftStorage,
} from "@/renderer/state/composerDraftStorage";
import type { DraftContent } from "@/renderer/state/slices/types";

const bridge = vi.hoisted(() => ({
  windowKind: "main",
  openThreadWindow: vi.fn<(bootstrap: ThreadWindowBootstrap) => Promise<void>>(),
  navigateFromThreadWindow: vi.fn<(navigation: ThreadWindowNavigation) => Promise<void>>(),
  danger: vi.fn<(message: string) => void>(),
}));
vi.mock("@heroui/react", () => ({ toast: { danger: bridge.danger } }));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));
vi.mock("@/renderer/clientRuntime", () => ({ hasAnyClientBridge: () => true }));
import {
  openInMainWindowFromThread,
  openThreadWindow,
  trackThreadAttachmentImport,
} from "./threadWindowActions";

const thread = {
  id: "thread-1",
  projectId: "project-1",
  title: "Thread",
} as Thread;
const typed: DraftContent = {
  segments: [{ kind: "text", content: "typed just before moving" }],
  attachments: [],
};

beforeEach(() => {
  bridge.windowKind = "main";
  bridge.navigateFromThreadWindow.mockResolvedValue(undefined);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
  bridge.openThreadWindow.mockReset();
  bridge.danger.mockReset();
  bridge.navigateFromThreadWindow.mockReset();
});

it.each<ThreadWindowNavigation>([
  { kind: "thread", threadId: "other-thread" },
  { kind: "file", path: "src/app.ts", lineNumber: 12 },
  { kind: "review" },
])("forwards $kind links only from a thread window", (navigation) => {
  expect(openInMainWindowFromThread(navigation)).toBe(false);
  expect(bridge.navigateFromThreadWindow).not.toHaveBeenCalled();
  bridge.windowKind = "thread";
  expect(openInMainWindowFromThread(navigation)).toBe(true);
  expect(bridge.navigateFromThreadWindow).toHaveBeenCalledExactlyOnceWith(navigation);
});

describe("openThreadWindow", () => {
  it("waits for a pending attachment before the new window reads the draft", async () => {
    let finishImport!: () => void;
    const attached = {
      ...typed,
      attachments: [
        { id: "file-1", path: "C:/files/report.txt", name: "report.txt", isImage: false },
      ],
    };
    const imported = trackThreadAttachmentImport(
      thread.id,
      new Promise<void>((resolve) => {
        finishImport = resolve;
      }).then(() => {
        composerDraftStorage()!.save("thread", thread.id, attached);
      }),
    );
    let received: DraftContent | undefined;
    bridge.openThreadWindow.mockImplementation(async () => {
      received = createComposerDraftStorage(localStorage, window).load("thread")[thread.id];
    });

    openThreadWindow(thread);
    await Promise.resolve();
    expect(bridge.openThreadWindow).not.toHaveBeenCalled();
    finishImport();
    await imported;
    await vi.waitFor(() => expect(bridge.openThreadWindow).toHaveBeenCalledOnce());
    expect(received).toEqual(attached);
  });

  it("keeps the composer in its window when its draft cannot be saved", async () => {
    const storage = composerDraftStorage()!;
    storage.save("thread", thread.id, typed);
    const flush = vi
      .spyOn(storage, "flushDraft")
      .mockRejectedValueOnce(new Error("Draft save failed"));

    openThreadWindow(thread);
    await vi.waitFor(() => expect(bridge.danger).toHaveBeenCalledWith("Draft save failed"));

    expect(bridge.openThreadWindow).not.toHaveBeenCalled();
    expect(storage.currentDraft("thread", thread.id)).toEqual(typed);
    flush.mockRestore();
  });

  it("saves the thread's typed draft before the new window starts reading it", async () => {
    let draftSeenByNewWindow: DraftContent | undefined;
    bridge.openThreadWindow.mockImplementation(async () => {
      // A new renderer loads drafts from storage with an empty cache.
      draftSeenByNewWindow = createComposerDraftStorage(localStorage, window).load("thread")[
        thread.id
      ];
    });
    composerDraftStorage()!.save("thread", thread.id, typed);

    openThreadWindow(thread);
    // The 250 ms save delay never runs: timers stay frozen.
    await vi.waitFor(() => expect(bridge.openThreadWindow).toHaveBeenCalledOnce());

    expect(draftSeenByNewWindow).toEqual(typed);
    expect(vi.getTimerCount()).toBe(0);
  });
});
