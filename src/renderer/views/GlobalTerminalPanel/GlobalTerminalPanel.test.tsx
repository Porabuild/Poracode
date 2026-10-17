import { act, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { TerminalTab } from "@/renderer/state/devTerminalStore";
import type { StartShellPayload, TerminalSize } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useGlobalTerminalStore } from "@/renderer/state/globalTerminalStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { startDeferredPanelShell } from "@/renderer/utils/shellUtils";
import { GlobalTerminalPanel } from "./GlobalTerminalPanel";

interface LayoutProps {
  tabs: TerminalTab[];
  selectedTabId: string;
  activeScopeLabel: string;
  visible: boolean;
  hideHeader?: boolean;
  handleSelectionChange: (key: string) => void;
  handleCloseTab: (tab: TerminalTab) => void;
  onTerminalResize: (id: string, size: TerminalSize) => void;
  onTerminalExited: (id: string) => void;
}

const layout = vi.hoisted(() => ({ current: null as LayoutProps | null }));
vi.mock(
  "@/renderer/views/MainView/parts/RightPanel/parts/DevTerminalPanel/parts/BottomTerminalLayout",
  () => ({
    BottomTerminalLayout: (props: LayoutProps) => {
      layout.current = props;
      return <div data-testid="normal-bottom-terminal" />;
    },
  }),
);
vi.mock(
  "@/renderer/views/MainView/parts/RightPanel/parts/DevTerminalPanel/parts/RightTerminalLayout",
  () => ({
    RightTerminalLayout: (props: LayoutProps) => {
      layout.current = props;
      return <div data-testid="normal-right-terminal" />;
    },
  }),
);
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    getHomeScopeLocation: async () => ({ kind: "windows", path: "C:\\Users\\tester" }),
  }),
}));
vi.mock("@/renderer/utils/shellUtils", () => ({
  noteShellExited: vi.fn<(id: string) => void>(),
  closeThreads: vi.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined),
  startDeferredPanelShell: vi
    .fn<(payload: StartShellPayload) => Promise<void>>()
    .mockResolvedValue(undefined),
  wasShellStartedDeferred: () => false,
}));
vi.mock("@/renderer/actions/terminalActions", () => ({
  closeGlobalTerminalTab: (id: string) => {
    useGlobalTerminalStore.getState().removeTab(id);
    if (
      useGlobalTerminalStore.getState().tabs.length === 0 &&
      useDevTerminalStore.getState().source === "global"
    ) {
      useDevTerminalStore.getState().closePanel();
    }
  },
}));

beforeEach(() => {
  resetDevTerminalStore();
  useDevTerminalStore.getState().openGlobalPanel();
  useSharedSettings.setState({ terminalPosition: "bottom" });
  useGlobalTerminalStore.setState({ tabs: [], activeTabId: null, location: null });
  useGlobalTerminalStore.getState().open();
  layout.current = null;
});

it("uses the existing bottom terminal layout and tab actions", () => {
  render(<GlobalTerminalPanel />);
  expect(screen.getByTestId("normal-bottom-terminal")).toBeInTheDocument();
  expect(layout.current).toMatchObject({ activeScopeLabel: "Terminal", visible: true });
  const firstId = layout.current!.selectedTabId;
  act(() => layout.current!.handleSelectionChange("__add__"));
  expect(layout.current!.tabs).toHaveLength(2);
  expect(layout.current!.selectedTabId).not.toBe(firstId);
  act(() => layout.current!.handleSelectionChange(firstId));
  expect(layout.current!.selectedTabId).toBe(firstId);
});

it("uses the existing right terminal layout without a duplicate header", () => {
  useSharedSettings.setState({ terminalPosition: "right" });
  render(<GlobalTerminalPanel visible={false} />);
  expect(screen.getByTestId("normal-right-terminal")).toBeInTheDocument();
  expect(layout.current).toMatchObject({ hideHeader: true, visible: false });
});

it("closes only the selected shell and hides the panel after its last tab", () => {
  useGlobalTerminalStore.getState().addTab();
  render(<GlobalTerminalPanel />);
  const [first, second] = layout.current!.tabs;
  act(() => layout.current!.handleCloseTab(second!));
  expect(layout.current!.tabs).toEqual([first]);
  expect(useDevTerminalStore.getState().isOpen).toBe(true);
  act(() => layout.current!.onTerminalExited(first!.id));
  expect(useGlobalTerminalStore.getState().tabs).toEqual([]);
  expect(useDevTerminalStore.getState().isOpen).toBe(false);
});

it("preserves a project panel when the last hidden home shell exits", () => {
  render(<GlobalTerminalPanel />);
  const terminalId = layout.current!.selectedTabId;
  act(() => useDevTerminalStore.getState().openPanel("project"));
  act(() => layout.current!.onTerminalExited(terminalId));
  expect(useDevTerminalStore.getState()).toMatchObject({ isOpen: true, source: "project" });
});

it.each([false, true])(
  "requests focus after startup while respecting other inputs (%s)",
  async (moveFocus) => {
    const started = Promise.withResolvers<void>();
    vi.mocked(startDeferredPanelShell).mockReturnValueOnce(started.promise);
    render(
      <>
        <input aria-label="Message" />
        <GlobalTerminalPanel />
      </>,
    );
    const requestId = useDevTerminalStore.getState().focusRequestId;
    await act(async () =>
      layout.current!.onTerminalResize(layout.current!.selectedTabId, { cols: 80, rows: 24 }),
    );
    if (moveFocus) screen.getByRole("textbox", { name: "Message" }).focus();
    await act(async () => started.resolve());
    expect(useDevTerminalStore.getState().focusRequestId).toBe(requestId + (moveFocus ? 0 : 1));
  },
);
