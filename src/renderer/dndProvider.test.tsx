import { render, screen } from "@testing-library/react";
import { useDraggable } from "@dnd-kit/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPaneLayoutFromLegacy } from "@/shared/paneLayout";
import { AppDndProvider } from "./dnd";

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => true,
}));

describe("AppDndProvider compact surface", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("omits desktop drag orchestration while retaining context for child hooks", () => {
    const addEventListener = vi.spyOn(document, "addEventListener");

    render(
      <AppDndProvider
        onSidebarSortEnd={() => undefined}
        onPaneDrop={() => undefined}
        onMainPanelDrop={() => undefined}
        onPanelDockDrop={() => undefined}
        paneLayout={buildPaneLayoutFromLegacy(["thread-1"])}
      >
        <DraggableProbe />
      </AppDndProvider>,
    );

    expect(screen.getByText("compact content")).toBeInTheDocument();
    expect(addEventListener.mock.calls.some(([eventName]) => eventName === "pointermove")).toBe(
      false,
    );
  });
});

function DraggableProbe() {
  useDraggable({ id: "compact-probe" });
  return <div>compact content</div>;
}
