import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Thread } from "@/shared/contracts";

const dismissThreadWindow = vi.hoisted(() => vi.fn<(threadId: string) => void>());
vi.mock("@/renderer/actions/threadWindowActions", () => ({ dismissThreadWindow }));
import { useCloseWhenThreadLeaves } from "./useCloseWhenThreadLeaves";

function makeThread(patch: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    ...patch,
  };
}

// The window closes through Dismiss, so the thread does not come back to the
// main window after Archive, Done or Delete.
function renderWindow(thread: Thread | undefined, restoreFailed = false) {
  const hook = renderHook(
    (props: { thread: Thread | undefined; restoreFailed: boolean }) =>
      useCloseWhenThreadLeaves("thread-1", props.thread, props.restoreFailed),
    { initialProps: { thread, restoreFailed } },
  );
  return { close: dismissThreadWindow, rerender: hook.rerender };
}

afterEach(() => {
  dismissThreadWindow.mockReset();
});

describe("useCloseWhenThreadLeaves", () => {
  it.each([
    ["archived", { archived: true }],
    ["marked done", { done: true }],
  ])("closes the window once its thread is %s", (_label, patch) => {
    const { close, rerender } = renderWindow(makeThread());
    expect(close).not.toHaveBeenCalled();

    rerender({ thread: makeThread(patch), restoreFailed: false });

    expect(close).toHaveBeenCalledExactlyOnceWith("thread-1");
  });

  it("waits for a failed restore before closing for a missing thread", () => {
    const { close, rerender } = renderWindow(makeThread());

    rerender({ thread: undefined, restoreFailed: false });
    expect(close).not.toHaveBeenCalled();

    rerender({ thread: undefined, restoreFailed: true });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps a window that opened on a done thread until the thread is deleted", () => {
    const { close, rerender } = renderWindow(makeThread({ done: true }));
    rerender({ thread: makeThread({ done: true, title: "Renamed" }), restoreFailed: false });
    expect(close).not.toHaveBeenCalled();

    rerender({ thread: undefined, restoreFailed: true });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("leaves the retry screen up when the thread never loaded", () => {
    const { close, rerender } = renderWindow(undefined);
    rerender({ thread: undefined, restoreFailed: true });

    expect(close).not.toHaveBeenCalled();
  });
});
