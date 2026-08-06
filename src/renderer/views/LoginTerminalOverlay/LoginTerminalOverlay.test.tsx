import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalFeedListener } from "@/shared/remote/terminalFeed";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useLoginTerminalStore } from "@/renderer/state/loginTerminalStore";
import { LoginTerminalOverlay } from "./LoginTerminalOverlay";

const { bridge, remoteTerminal, terminal } = vi.hoisted(() => ({
  bridge: {
    closeThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
  remoteTerminal: {
    watch: vi.fn<(id: string, listener: TerminalFeedListener, desktopId?: string) => () => void>(),
  },
  terminal: {
    outputSource: undefined as ((listener: TerminalFeedListener) => () => void) | undefined,
  },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@/renderer/state/remoteTerminalFeed", () => ({
  watchRoutedTerminal: remoteTerminal.watch,
}));

vi.mock("@/renderer/components/terminal/XTermSurface", () => ({
  XTermSurface: (props: { outputSource?: (listener: TerminalFeedListener) => () => void }) => {
    terminal.outputSource = props.outputSource;
    return <div data-testid="login-terminal" />;
  },
}));

describe("LoginTerminalOverlay", () => {
  beforeEach(() => {
    bridge.closeThread.mockClear();
    remoteTerminal.watch.mockReset();
    terminal.outputSource = undefined;
    useLoginTerminalStore.setState({ active: null });
  });

  it("subscribes a remote login shell to its routed terminal feed", async () => {
    const unsubscribe = vi.fn<() => void>();
    remoteTerminal.watch.mockReturnValue(unsubscribe);
    useLoginTerminalStore.getState().open({
      shellId: "login:remote",
      label: "Remote agent",
      projectLocation: {
        kind: "posix",
        path: "/srv/project",
        remoteServerId: "desktop-1",
      },
    });

    const view = render(<LoginTerminalOverlay />);
    await waitFor(() => expect(terminal.outputSource).toBeTypeOf("function"));
    const listener: TerminalFeedListener = {
      onOutput: vi.fn<(data: string) => void>(),
      onReset: vi.fn<() => void>(),
      onExited: vi.fn<(exitCode: number | null) => void>(),
    };

    expect(terminal.outputSource?.(listener)).toBe(unsubscribe);
    expect(remoteTerminal.watch).toHaveBeenCalledWith("login:remote", listener, "desktop-1");
    view.unmount();
  });
});
