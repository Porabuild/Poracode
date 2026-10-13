import "fake-indexeddb/auto";
import type { ReactNode } from "react";
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { useCommandPaletteStore } from "@/renderer/commands/commandPaletteStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MainView } from "./MainView";

const layout = vi.hoisted(() => ({ compact: false }));
vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => layout.compact }));
vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ view: { kind: "home" }, projects: [], threads: [], openHome: vi.fn<() => void>() }),
}));
vi.mock("@/renderer/state/experimentStore", () => ({
  useExperimentStore: (selector: (state: { experiments: object }) => unknown) =>
    selector({ experiments: {} }),
}));
vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: object) => unknown) =>
    selector({ homeScopeEnabled: false, sharedSettingsHydrated: false }),
}));
vi.mock("@/renderer/state/welcomeGateStore", () => ({
  useWelcomeGateStore: (selector: (state: { backgroundWorkReleased: boolean }) => unknown) =>
    selector({ backgroundWorkReleased: false }),
}));
vi.mock("@/renderer/actions/projectActions", () => ({
  ensureHomeScopeProject: vi.fn<() => void>(),
}));
vi.mock("@/renderer/hooks/useKeyboardShortcuts", () => ({
  useKeyboardShortcuts: vi.fn<() => void>(),
}));
vi.mock("@/renderer/hooks/useGitRefresh", () => ({ useGitRefresh: vi.fn<() => void>() }));
vi.mock("@/renderer/hooks/useRemoteServerConnection", () => ({
  useRemoteServerConnection: () => ({ checked: true }),
}));
vi.mock("@/renderer/hooks/useRestoredRemoteThreadLifecycle", () => ({
  useRestoredRemoteThreadLifecycle: vi.fn<() => void>(),
}));
vi.mock("@/renderer/hooks/useRightPanelThreadLock", () => ({
  useRightPanelThreadLock: vi.fn<() => void>(),
}));
vi.mock("@/renderer/hooks/useThreadLifecycle", () => ({ useThreadLifecycle: vi.fn<() => void>() }));
vi.mock("@/renderer/hooks/useDndHandlers", () => ({ useDndHandlers: () => ({}) }));
vi.mock(
  "@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/hooks/useBrowserSync",
  () => ({
    useBrowserSync: vi.fn<() => void>(),
  }),
);
vi.mock("./parts/mobilePageHistory", () => ({ useMobilePageHistory: vi.fn<() => void>() }));
vi.mock("@/renderer/dnd", () => ({
  AppDndProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="desktop-dnd">{children}</div>
  ),
  CompactDndProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="compact-dnd">{children}</div>
  ),
}));
vi.mock("@/renderer/deferredFeatures", () => ({
  DeferredCommandPalette: () => {
    const open = useCommandPaletteStore((state) => state.isOpen);
    return open ? <div role="dialog" aria-label="Search" /> : null;
  },
}));
vi.mock("./parts/MainPageLayout", () => ({
  MainPageLayout: () => <div>Connected page</div>,
  StalePanelCleanup: () => null,
}));
vi.mock("./parts/BrowserConnectionPage/BrowserConnectionPage", () => ({
  BrowserConnectionPage: () => <div>Pairing page</div>,
}));
vi.mock("./parts/MobileTopLevelPage", () => ({
  MobileTopLevelPage: () => <div>Mobile settings page</div>,
}));
vi.mock("./parts/AppOverlays", () => ({ AppOverlays: () => null }));
vi.mock("./parts/WorktreeDeleteDialogs", () => ({ WorktreeDeleteDialogs: () => null }));
vi.mock("./parts/PullFromSourceDialog", () => ({ PullFromSourceDialog: () => null }));
vi.mock("@/renderer/components/thread/ChatPane/parts/items/ActiveSubAgentTile", () => ({
  ThreadLiveWorkflowTracker: () => null,
}));
vi.mock("@/renderer/diagnostics/runtimeContext", () => ({
  RendererRuntimeDiagnosticContextSync: () => null,
}));

beforeEach(() => {
  resetClientRuntimeForTest();
  window.poracode = {} as PoracodeBridge;
  installBrowserClientRuntime(window.poracode);
  useRemoteServersStore.setState({ servers: [], runtime: {} });
  usePanelStore.setState({ mobileUtilityPage: null });
  useCommandPaletteStore.getState().close();
});
afterEach(() => {
  useCommandPaletteStore.getState().close();
  usePanelStore.setState({ mobileUtilityPage: null });
  resetClientRuntimeForTest();
  Reflect.deleteProperty(window, "poracode");
});

describe("Search hosting", () => {
  it.each([false, true])(
    "keeps Search available above the unpaired browser page (compact=%s)",
    (compact) => {
      layout.compact = compact;
      render(<MainView storeHydrated={false} runtimeSnapshotsReady={false} />);
      expect(screen.getByText("Pairing page")).toBeInTheDocument();
      expect(screen.queryByText("Connected page")).not.toBeInTheDocument();
      act(() => useCommandPaletteStore.getState().open());
      const dialog = screen.getByRole("dialog", { name: "Search" });
      expect(screen.getByTestId(compact ? "compact-dnd" : "desktop-dnd")).toContainElement(dialog);
      act(() => useCommandPaletteStore.getState().close());
      expect(screen.queryByRole("dialog", { name: "Search" })).not.toBeInTheDocument();
    },
  );

  it("keeps Search inside the compact provider on top-level settings", () => {
    layout.compact = true;
    usePanelStore.setState({ mobileUtilityPage: "settings" });
    render(<MainView storeHydrated={false} runtimeSnapshotsReady={false} />);
    expect(screen.getByText("Mobile settings page")).toBeInTheDocument();
    act(() => useCommandPaletteStore.getState().open());
    expect(screen.getByTestId("compact-dnd")).toContainElement(
      screen.getByRole("dialog", { name: "Search" }),
    );
  });
});
