import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { GuiThreadContent } from "./ThreadContent";

const layout = vi.hoisted(() => ({ compact: true }));
const captured = vi.hoisted(() => ({
  chatPaneProps: [] as { bottomInset?: number }[],
  onComposerInsetChange: undefined as ((inset: number) => void) | undefined,
}));

vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => layout.compact }));
vi.mock("@/renderer/state/useThread", () => ({ useThread: () => undefined }));
vi.mock("./useThreadDockState", () => ({
  useThreadDockState: () => ({
    showTodoDock: false,
    showGoalDock: false,
    hiddenRuntimeItemId: undefined,
    dockLayoutToken: null,
  }),
}));
vi.mock("./ChatPane/ChatPane", () => ({
  ChatPane: (props: { bottomInset?: number }) => {
    captured.chatPaneProps.push(props);
    return null;
  },
}));
vi.mock("./ThreadComposerSection", () => ({
  ThreadComposerSection: (props: { onComposerInsetChange?: (inset: number) => void }) => {
    captured.onComposerInsetChange = props.onComposerInsetChange;
    return null;
  },
}));

const thread = { id: "thread-1" } as Thread;

function renderContent() {
  return render(
    <GuiThreadContent
      threadId="thread-1"
      fallbackThread={thread}
      agentStatus={undefined}
      projectLocation={{ kind: "posix", path: "/repo" }}
      paneCount={1}
      terminalPaneRef={{ current: null }}
      runtimeDebugOpen={false}
    />,
  );
}

describe("GuiThreadContent composer inset", () => {
  beforeEach(() => {
    layout.compact = true;
    captured.chatPaneProps = [];
    captured.onComposerInsetChange = undefined;
  });

  it("passes the measured floating-dock inset to the chat pane in the compact layout", () => {
    renderContent();
    expect(captured.chatPaneProps.at(-1)?.bottomInset).toBeUndefined();

    act(() => captured.onComposerInsetChange?.(130));

    expect(captured.chatPaneProps.at(-1)?.bottomInset).toBe(130);
  });

  it("drops a measured inset once the window leaves the compact layout", () => {
    const view = renderContent();
    act(() => captured.onComposerInsetChange?.(130));
    expect(captured.chatPaneProps.at(-1)?.bottomInset).toBe(130);

    layout.compact = false;
    view.rerender(
      <GuiThreadContent
        threadId="thread-1"
        fallbackThread={thread}
        agentStatus={undefined}
        projectLocation={{ kind: "posix", path: "/repo" }}
        paneCount={1}
        terminalPaneRef={{ current: null }}
        runtimeDebugOpen={false}
      />,
    );

    expect(captured.chatPaneProps.at(-1)?.bottomInset).toBeUndefined();
  });
});
