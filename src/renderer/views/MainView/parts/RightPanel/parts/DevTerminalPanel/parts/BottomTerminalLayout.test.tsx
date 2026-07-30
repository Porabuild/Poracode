import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { BottomTerminalLayout } from "./BottomTerminalLayout";

vi.mock("./TerminalSurfaces", () => ({
  TerminalSurfaces: () => <div data-testid="terminal-surfaces" />,
}));

function renderLayout() {
  return render(
    <BottomTerminalLayout
      tabs={[]}
      projectTabs={[]}
      activeScopeLabel="Poracode / feature"
      selectedTabId="__add__"
      activeTab={undefined}
      focusRequestId={0}
      markTabActive={vi.fn<() => void>()}
      updateTabTitle={vi.fn<() => void>()}
      fadeStyle={{ opacity: 1, transition: "none" }}
      emptyState={null}
      handleCloseTab={vi.fn<() => void>()}
      handleCloseSplit={vi.fn<() => void>()}
      handleSelectionChange={vi.fn<() => void>()}
      getTabContextItems={() => []}
      handleTabContextAction={vi.fn<() => void>()}
    />,
  );
}

describe("BottomTerminalLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the project and worktree scope in the header", () => {
    renderLayout();

    expect(screen.getByText("Poracode / feature")).toBeInTheDocument();
  });

  it("resizes and persists the terminal sidebar with the keyboard", () => {
    renderLayout();
    const separator = screen.getByRole("separator", { name: "Resize sidebar" });
    const sidebar = separator.previousElementSibling;
    expect(sidebar).toHaveStyle({ width: "140px" });

    fireEvent.keyDown(separator, { key: "ArrowRight" });

    expect(sidebar).toHaveStyle({ width: "164px" });
    expect(localStorage.getItem("poracode-bottom-terminal-sidebar-width")).toBe("164");
  });

  it("resizes and persists the terminal sidebar by dragging", () => {
    renderLayout();
    const separator = screen.getByRole("separator", { name: "Resize sidebar" });
    const sidebar = separator.previousElementSibling;

    fireEvent.pointerDown(separator, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 170 });
    fireEvent.pointerUp(window);

    expect(sidebar).toHaveStyle({ width: "210px" });
    expect(localStorage.getItem("poracode-bottom-terminal-sidebar-width")).toBe("210");
  });
});
