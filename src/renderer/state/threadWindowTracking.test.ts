// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import type { ThreadWindowsChanged } from "@/shared/ipc/threadWindow";

const harness = vi.hoisted(() => ({
  listener: undefined as ((event: ThreadWindowsChanged) => void) | undefined,
  resolveIds: undefined as ((ids: string[]) => void) | undefined,
  reloadThreadDraftContent: vi.fn<(threadId: string) => void>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    onThreadWindowsChanged: (listener: (event: ThreadWindowsChanged) => void) => {
      harness.listener = listener;
      return () => (harness.listener = undefined);
    },
    getThreadWindowIds: () =>
      new Promise<string[]>((resolve) => {
        harness.resolveIds = resolve;
      }),
  }),
}));
vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: {
    getState: () => ({ reloadThreadDraftContent: harness.reloadThreadDraftContent }),
  },
}));
vi.mock("@/renderer/diagnostics/sentry", () => ({
  captureRendererException: vi.fn<() => void>(),
}));

import { hasOwnWindow, setOwnWindowThreadIds } from "./auxiliaryThreadWindows";
import { installThreadWindowTracking, threadWindowIdsLoaded } from "./threadWindowTracking";

afterEach(() => {
  setOwnWindowThreadIds([]);
  harness.reloadThreadDraftContent.mockClear();
});

it("keeps a live change over an older startup answer", async () => {
  const uninstall = installThreadWindowTracking();
  harness.listener?.({ threadIds: ["thread-b"] });
  harness.resolveIds?.(["thread-a"]);
  await threadWindowIdsLoaded();
  expect(hasOwnWindow("thread-a")).toBe(false);
  expect(hasOwnWindow("thread-b")).toBe(true);
  uninstall();
});

it("rereads the draft of a thread that comes back from its window", async () => {
  const uninstall = installThreadWindowTracking();
  harness.resolveIds?.(["thread-a", "thread-b"]);
  await threadWindowIdsLoaded();
  harness.listener?.({ threadIds: ["thread-b"] });
  expect(harness.reloadThreadDraftContent).toHaveBeenCalledExactlyOnceWith("thread-a");
  expect(hasOwnWindow("thread-a")).toBe(false);
  uninstall();
});
