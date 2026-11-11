import "@/renderer/testUtils/clientDraftDatabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { ThreadWindowBootstrap } from "@/shared/ipc/threadWindow";
import {
  composerDraftStorage,
  createComposerDraftStorage,
} from "@/renderer/state/composerDraftStorage";
import type { DraftContent } from "@/renderer/state/slices/types";

const bridge = vi.hoisted(() => ({
  openThreadWindow: vi.fn<(bootstrap: ThreadWindowBootstrap) => Promise<void>>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ windowKind: "main", openThreadWindow: bridge.openThreadWindow }),
}));
vi.mock("@/renderer/clientRuntime", () => ({ hasAnyClientBridge: () => true }));
import { openThreadWindow } from "./threadWindowActions";

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
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
  bridge.openThreadWindow.mockReset();
});

describe("openThreadWindow", () => {
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
