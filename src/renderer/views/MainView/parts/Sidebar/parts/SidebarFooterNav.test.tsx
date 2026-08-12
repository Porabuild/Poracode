import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { usePanelStore } from "@/renderer/state/panelStore";
import { beginPanelResize, endPanelResize } from "@/renderer/state/panelResizeSignal";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { SidebarFooterNav } from "./SidebarFooterNav";

const originalResizeObserver = globalThis.ResizeObserver;

/** The component under test re-measures via getBoundingClientRect, so firing
 * the captured callbacks is enough to simulate a resize. */
class MockResizeObserver {
  static instances = new Set<MockResizeObserver>();

  readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.add(this);
  }

  observe() {}
  unobserve() {}
  disconnect() {
    MockResizeObserver.instances.delete(this);
  }

  static notifyAll() {
    for (const instance of MockResizeObserver.instances) {
      instance.callback([], {} as ResizeObserver);
    }
  }
}

describe("SidebarFooterNav", () => {
  beforeEach(() => {
    localStorage.clear();
    useSidebarUiStore.setState({ footerCollapsed: false });
    usePanelStore.setState({ settingsOpen: false, settingsSection: "general" });
    useSharedSettings.setState({
      sidebarHiddenShortcuts: ["githubActions"],
      sidebarShortcutOrder: ["pullRequests", "githubActions", "schedules"],
    });
  });

  it("shows labeled rows with a collapse toggle by default", () => {
    render(<SidebarFooterNav remoteAccessStatus="off" />);

    expect(screen.getByText("Pull requests")).toBeInTheDocument();
    expect(screen.getByText("Schedules")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Hide sidebar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse footer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand footer" })).not.toBeInTheDocument();
  });

  it("hides Remote Access when the current host cannot serve incoming connections", () => {
    render(<SidebarFooterNav remoteAccessStatus="off" showRemoteAccess={false} />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remote Access" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse footer" }));
    expect(screen.queryByRole("button", { name: "Remote Access" })).not.toBeInTheDocument();
  });

  it("collapses to an icon row and back via the toggle", () => {
    render(<SidebarFooterNav remoteAccessStatus="off" />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse footer" }));
    expect(useSidebarUiStore.getState().footerCollapsed).toBe(true);

    // Icon mode: labels leave the visible text but stay reachable as
    // aria-labels on the icon buttons.
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Hide sidebar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pull requests" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedules" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remote Access" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide sidebar" })).toBeInTheDocument();

    // Hide sidebar anchors the left edge of the row, the expand toggle the
    // right edge. (HeroUI's Tooltip.Trigger wrapper div also carries
    // role="button", so filter down to the actual button elements.)
    const buttons = screen.getAllByRole("button").filter((b) => b.tagName === "BUTTON");
    expect(buttons[0]).toHaveAccessibleName("Hide sidebar");
    expect(buttons.at(-1)).toHaveAccessibleName("Expand footer");
    // The expand toggle is pinned to the row's right edge via an ml-auto
    // wrapper, so it stays right-aligned even when nothing overflows.
    expect(
      screen.getByRole("button", { name: "Expand footer" }).closest(".ml-auto"),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand footer" }));
    expect(useSidebarUiStore.getState().footerCollapsed).toBe(false);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("starts collapsed when the persisted flag is set", () => {
    useSidebarUiStore.setState({ footerCollapsed: true });

    render(<SidebarFooterNav remoteAccessStatus="off" />);

    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand footer" })).toBeInTheDocument();
  });

  describe("overflow", () => {
    beforeEach(() => {
      // jsdom measures 0 everywhere (read as "unmeasured" → no overflow), so
      // force a narrow row: 100px fits two 36px-pitch items, which the pinned
      // Hide-sidebar / expand buttons already claim.
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        width: 100,
        height: 32,
        top: 0,
        left: 0,
        right: 100,
        bottom: 32,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("moves actions that do not fit into a kebab menu", async () => {
      useSidebarUiStore.setState({ footerCollapsed: true });

      render(<SidebarFooterNav remoteAccessStatus="off" />);

      // Pinned buttons stay put; every action icon overflows.
      expect(screen.getByRole("button", { name: "Hide sidebar" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Expand footer" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pull requests" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "More" }));

      const menu = await screen.findByRole("menu");
      expect(menu).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Pull requests" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Schedules" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Remote Access" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
      expect(usePanelStore.getState().settingsOpen).toBe(true);
    });

    it("marks the kebab active while a hidden destination is the current one", () => {
      useSidebarUiStore.setState({ footerCollapsed: true });
      // Settings (non-Remote-Access section) is open and overflowed, so the
      // trigger has to stand in for the active icon it hides.
      usePanelStore.setState({ settingsOpen: true, settingsSection: "general" });

      render(<SidebarFooterNav remoteAccessStatus="off" />);

      const trigger = screen.getByRole("button", { name: "More" });
      expect(trigger.className).toContain("bg-[var(--row-active)]");
      expect(trigger.className).not.toContain("text-muted");
    });

    it("leaves the kebab inactive when nothing hidden is active", () => {
      useSidebarUiStore.setState({ footerCollapsed: true });

      render(<SidebarFooterNav remoteAccessStatus="off" />);

      const trigger = screen.getByRole("button", { name: "More" });
      expect(trigger.className).toContain("text-muted");
      expect(trigger.className).not.toContain("bg-[var(--row-active)]");
    });
  });

  describe("resize responsiveness", () => {
    let rowWidth = 350;

    function mockRowWidth() {
      // mockImplementation (not mockReturnValue) so tests can change rowWidth
      // after setup and the next measurement picks it up.
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
        () =>
          ({
            width: rowWidth,
            height: 32,
            top: 0,
            left: 0,
            right: rowWidth,
            bottom: 32,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          }) as DOMRect,
      );
    }

    beforeEach(() => {
      rowWidth = 350;
      mockRowWidth();
      globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    });

    afterEach(() => {
      endPanelResize();
      globalThis.ResizeObserver = originalResizeObserver;
      MockResizeObserver.instances.clear();
      vi.restoreAllMocks();
    });

    it("hides overflowing actions immediately during a divider drag", () => {
      useSidebarUiStore.setState({ footerCollapsed: true });
      render(<SidebarFooterNav remoteAccessStatus="off" />);

      // 350px fits everything, so there is no kebab yet.
      expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();

      beginPanelResize();
      rowWidth = 100;
      act(() => MockResizeObserver.notifyAll());

      // No debounce while dragging: the kebab appears in the same frame.
      expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
    });

    it("debounces width changes when no drag is in progress", async () => {
      useSidebarUiStore.setState({ footerCollapsed: true });
      render(<SidebarFooterNav remoteAccessStatus="off" />);

      rowWidth = 100;
      act(() => MockResizeObserver.notifyAll());

      // Animation/window-resize path: the row keeps its settled layout until
      // the width stops moving, so the kebab does not appear right away.
      expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });
      expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
    });
  });
});
