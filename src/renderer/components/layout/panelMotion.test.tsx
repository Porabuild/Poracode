import { createRef, useEffect, useState, type ReactNode } from "react";
import { create } from "zustand";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AsideSlot } from "@/renderer/views/MainView/parts/AppShell/parts/AsideSlot";
import { PanelActivity, PanelExitContent, usePanelContentDeferred } from "./panelMotion";

function Body() {
  return <div data-testid="body">{usePanelContentDeferred() ? "Waiting for panel" : "Ready"}</div>;
}

function panel(open: boolean, width = 350, children: ReactNode = <Body />) {
  return (
    <AsideSlot
      orientation="vertical"
      isOpen={open}
      targetWidth={width}
      onResizeStart={() => undefined}
      onResizeKeyDown={() => undefined}
      panelRef={createRef()}
      panelInnerRef={createRef()}
      ariaLabel="Resize panel"
    >
      {children}
    </AsideSlot>
  );
}

afterEach(() => vi.useRealTimers());

describe("panel motion", () => {
  it("retains input and scroll state while hidden subscriptions pause and resume current data", async () => {
    vi.useFakeTimers();
    const store = create(() => ({ value: 1 }));
    const renders = vi.fn<() => void>();
    const disposed = vi.fn<() => void>();
    function Content() {
      const value = store((state) => state.value);
      const [draft, setDraft] = useState("");
      renders();
      useEffect(() => disposed, []);
      return (
        <div data-testid="retained-panel">
          <span>{value}</span>
          <input
            aria-label="Draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
      );
    }
    const view = render(
      <PanelActivity visible>
        <Content />
      </PanelActivity>,
    );
    const input = screen.getByRole("textbox", { name: "Draft" });
    const retainedPanel = screen.getByTestId("retained-panel");
    fireEvent.change(input, { target: { value: "unsent" } });
    retainedPanel.scrollTop = 73;
    view.rerender(
      <PanelActivity visible={false}>
        <Content />
      </PanelActivity>,
    );
    expect(retainedPanel).toBeVisible();
    await act(() => vi.advanceTimersByTime(120));
    expect(retainedPanel).not.toBeVisible();
    expect(disposed).toHaveBeenCalledTimes(1);
    renders.mockClear();
    act(() => store.setState({ value: 2 }));
    expect(renders).not.toHaveBeenCalled();
    expect(retainedPanel).toHaveTextContent("1");
    view.rerender(
      <PanelActivity visible>
        <Content />
      </PanelActivity>,
    );
    expect(retainedPanel).toBeVisible();
    expect(retainedPanel).toHaveTextContent("2");
    expect(screen.getByRole("textbox", { name: "Draft" })).toBe(input);
    expect(input).toHaveValue("unsent");
    expect(retainedPanel.scrollTop).toBe(73);
  });

  it("cancels a pending suspension when a tab is reopened during its fade", async () => {
    vi.useFakeTimers();
    const view = render(
      <PanelActivity visible>
        <span>Panel body</span>
      </PanelActivity>,
    );
    view.rerender(
      <PanelActivity visible={false}>
        <span>Panel body</span>
      </PanelActivity>,
    );
    await act(() => vi.advanceTimersByTime(60));
    view.rerender(
      <PanelActivity visible>
        <span>Panel body</span>
      </PanelActivity>,
    );
    await act(() => vi.advanceTimersByTime(120));
    expect(screen.getByText("Panel body")).toBeVisible();
  });

  it("defers heavy bodies through opening, without deferring again for a resize", () => {
    const { container, rerender } = render(panel(false));
    rerender(panel(true));
    expect(screen.getByText("Waiting for panel")).toBeInTheDocument();
    fireEvent.transitionEnd(screen.getByTestId("body"), { propertyName: "width" });
    expect(screen.getByText("Waiting for panel")).toBeInTheDocument();
    fireEvent.transitionEnd(container.querySelector("aside")!, { propertyName: "width" });
    expect(screen.getByText("Ready")).toBeInTheDocument();
    rerender(panel(true, 550));
    expect(screen.getByText("Ready")).toBeInTheDocument();
    rerender(panel(false));
    expect(container.querySelector("aside")).toHaveAttribute("inert");
    rerender(panel(true));
    expect(container.querySelector("aside")).not.toHaveAttribute("inert");
    expect(screen.getByText("Waiting for panel")).toBeInTheDocument();
    fireEvent.transitionEnd(container.querySelector("aside")!, { propertyName: "width" });
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("releases the body when the browser omits transitionend", async () => {
    vi.useFakeTimers();
    render(panel(true));
    expect(screen.getByText("Waiting for panel")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTime(200));
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("keeps a new body deferred if opening is interrupted by close", async () => {
    vi.useFakeTimers();
    const { container, rerender } = render(panel(true));
    rerender(panel(false));
    fireEvent.transitionEnd(container.querySelector("aside")!, { propertyName: "width" });
    await act(() => vi.advanceTimersByTime(350));
    expect(screen.getByText("Waiting for panel")).toBeInTheDocument();
    rerender(panel(true));
    fireEvent.transitionEnd(container.querySelector("aside")!, { propertyName: "width" });
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("recognizes Tailwind's overlay translate transition", () => {
    const { container } = render(
      <AsideSlot
        orientation="vertical"
        isOpen
        overlay
        overlayReady
        targetWidth={350}
        onResizeStart={() => undefined}
        onResizeKeyDown={() => undefined}
        panelRef={createRef()}
        panelInnerRef={createRef()}
        ariaLabel="Resize panel"
      >
        <Body />
      </AsideSlot>,
    );
    expect(screen.getByText("Waiting for panel")).toBeInTheDocument();
    fireEvent.transitionEnd(container.querySelector("aside")!, { propertyName: "translate" });
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("retains the last view when closing clears its context, and adopts a reopened view", () => {
    const { rerender } = render(
      <PanelExitContent visible>
        <span>Subagent transcript</span>
      </PanelExitContent>,
    );
    rerender(<PanelExitContent visible={false}>{null}</PanelExitContent>);
    expect(screen.getByText("Subagent transcript")).toBeInTheDocument();
    rerender(
      <PanelExitContent visible>
        <span>Thread Info</span>
      </PanelExitContent>,
    );
    expect(screen.queryByText("Subagent transcript")).not.toBeInTheDocument();
    expect(screen.getByText("Thread Info")).toBeInTheDocument();
  });
});
