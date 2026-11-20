import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { hasOwnWindow, setOwnWindowThreadIds } from "@/renderer/state/auxiliaryThreadWindows";

const bridge = vi.hoisted(() => ({
  closeThreadWindow: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  openThreadWindow: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
vi.mock("@/renderer/components/thread/PaneDragAndDrop", () => ({
  usePaneDragAndDrop: () => ({ paneElementRef: () => {} }),
}));
vi.mock("@/renderer/components/thread/ThreadDraftChrome", () => ({
  ThreadDraftDropIndicators: () => null,
}));
vi.mock("@/renderer/dnd", () => ({ usePaneDropIndicatorState: () => null }));
import { ThreadWindowPlaceholder } from "./ThreadWindowPlaceholder";

function makeThread(id: string): Thread {
  return {
    id,
    projectId: "project-1",
    title: `Thread ${id}`,
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
  };
}

afterEach(() => {
  setOwnWindowThreadIds([]);
  vi.clearAllMocks();
});

describe("ThreadWindowPlaceholder", () => {
  it("closes only the placeholder pane and leaves the thread's window open", () => {
    useAppStore.setState({
      threads: [makeThread("detached"), makeThread("other")],
      view: { kind: "thread", panes: ["detached", "other"] },
    });
    setOwnWindowThreadIds(["detached"]);
    render(
      <ThreadWindowPlaceholder
        threadId="detached"
        onClose={() => useAppStore.getState().closePane("detached")}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close pane" }));

    expect(useAppStore.getState().view).toMatchObject({ kind: "thread", panes: ["other"] });
    expect(bridge.closeThreadWindow).not.toHaveBeenCalled();
    expect(hasOwnWindow("detached")).toBe(true);
  });
});
