import { I18nProvider } from "@lingui/react";
import { act, render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/renderer/i18n/i18n";
import { useSidebarOverlayStore } from "@/renderer/state/sidebarOverlayStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { AppShell } from "./AppShell";

vi.mock("@/renderer/bridge", () => ({ isMac: () => false, isWindows: () => false }));
vi.mock("./parts/usePanelVisibility", () => ({
  usePanelVisibility: () => ({ rightPanelOpen: true, gitPanelOpen: true, sidePanelOpen: true }),
}));
vi.mock("./parts/useSidebarOverlay", () => ({
  SIDEBAR_COLLAPSED_WIDTH: 48,
  useSidebarOverlayEffects: () => {},
}));
vi.mock("@/renderer/hooks/useTwoRafReady", () => ({ useTwoRafReady: (active: boolean) => active }));
vi.mock("@/renderer/hooks/useGlassState", () => ({ useSidebarGlassActive: () => false }));
vi.mock("@/renderer/components/layout/windowChrome", () => ({
  hasMacWindowChrome: () => false,
  hasNativeWindowChrome: () => false,
}));
vi.mock("./parts/useResizablePanels", () => ({
  CONTENT_MIN_WIDTH: 400,
  SIDEBAR_MIN_WIDTH: 200,
  useResizablePanels: () => ({
    sidebarWidth: 250,
    panelWidth: 350,
    panelHeight: 250,
    gitPanelWidth: 350,
  }),
}));

beforeEach(() => {
  usePanelStore.setState({
    deviceWorkspaceThreadId: null,
    bottomPanelDocks: { left: null, right: null },
  });
  useSidebarOverlayStore.setState({
    shellWidth: 390,
    isCollapsed: true,
    isNarrow: false,
    closingOverlay: false,
  });
});

function shell(rightPanel?: ReactNode, gitPanel?: ReactNode) {
  return (
    <I18nProvider i18n={i18n}>
      <AppShell
        sidebar={<div>sidebar</div>}
        content={<button type="button">Use page</button>}
        rightPanel={rightPanel}
        gitPanel={gitPanel}
        rightPanelPlacement="right"
        onDismissRightOverlay={() => {}}
      />
    </I18nProvider>
  );
}

// The backdrop is intentionally hidden from accessibility, but it still
// intercepts pointer input. No other overlay is enabled in this fixture.
function backdrop(container: HTMLElement) {
  return (
    [...container.querySelectorAll<HTMLElement>('[aria-hidden="true"].fixed')].find(
      (element) => getComputedStyle(element).display !== "none",
    ) ?? null
  );
}

it("does not cover a page when globally open panels have no content in this shell", () => {
  const { container } = render(shell());
  expect(screen.getByRole("button", { name: "Use page" })).toBeEnabled();
  expect(backdrop(container)).toBeNull();
});

it.each(["right", "git"])(
  "removes the %s backdrop immediately when responsive layout removes its panel",
  (slot) => {
    const panel = <div>Panel content</div>;
    const { container, rerender } = render(
      shell(slot === "right" ? panel : undefined, slot === "git" ? panel : undefined),
    );
    expect(screen.getByText("Panel content")).toBeInTheDocument();
    expect(backdrop(container)).not.toBeNull();
    rerender(shell());
    expect(screen.queryByText("Panel content")).toBeNull();
    expect(backdrop(container)).toBeNull();
  },
);

it("keeps Devices in the right panel at constrained width instead of docking it below chat", () => {
  usePanelStore.setState({ rightPanelTab: "devices", deviceWorkspaceThreadId: "thread-1" });
  render(
    <I18nProvider i18n={i18n}>
      <AppShell
        sidebar={<div>sidebar</div>}
        content={<button type="button">Use page</button>}
        rightPanel={<div>Bottom terminal</div>}
        gitPanel={<div>Devices panel</div>}
        rightPanelPlacement="bottom"
        onDismissRightOverlay={() => {}}
      />
    </I18nProvider>,
  );
  expect(usePanelStore.getState().bottomPanelDocks).toEqual({ left: null, right: null });
  expect(screen.getByText("Devices panel").closest("aside")).toHaveClass("fixed");
});

it.each(["right", "git"])(
  "retains the Devices controller in the %s slot across responsive transitions",
  (slot) => {
    usePanelStore.setState({ deviceWorkspaceThreadId: "thread-1" });
    useSidebarOverlayStore.setState({ shellWidth: 1500 });
    const dispose = vi.fn<() => void>();
    const mount = vi.fn<() => void>();
    function Preview() {
      useEffect(() => {
        mount();
        return dispose;
      }, []);
      return <div>Active preview</div>;
    }
    render(
      shell(slot === "right" ? <Preview /> : undefined, slot === "git" ? <Preview /> : undefined),
    );
    act(() => {
      useSidebarOverlayStore.setState({ shellWidth: 390 });
    });
    act(() => {
      useSidebarOverlayStore.setState({ shellWidth: 1500 });
    });
    expect(mount).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();
  },
);
