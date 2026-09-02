import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ThreadTodoDock } from "./ThreadTodoDock";

const scrollIntoView = vi.fn<() => void>();

beforeEach(() => {
  scrollIntoView.mockReset();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
});

describe("ThreadTodoDock", () => {
  const state = {
    sourceItemId: "plan-1",
    itemState: "updated" as const,
    sourceKind: "steps" as const,
    activeIndex: 1,
    steps: [
      { text: "Build ACP todo dock", status: "completed" as const },
      { text: "Wire ACP todo placement", status: "in_progress" as const },
      { text: "Cover ACP todo dock behavior", status: "pending" as const },
    ],
  };

  it("auto-scrolls the active item into view and exposes collapse controls", () => {
    const onCollapsedChange = vi.fn<(collapsed: boolean) => void>();

    render(
      <AppProvider>
        <ThreadTodoDock
          collapsed={false}
          placement="composer"
          state={state}
          onCollapsedChange={onCollapsedChange}
          onRetire={() => undefined}
        />
      </AppProvider>,
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    for (const name of ["Collapse todo dock", "Close plan"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("h-6", "w-6");
    }
    expect(
      screen.queryByRole("button", { name: "Show docks in the right panel" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse todo dock" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it("shows only the active row when collapsed", () => {
    render(
      <AppProvider>
        <ThreadTodoDock
          collapsed
          placement="right"
          state={state}
          onCollapsedChange={() => undefined}
          onRetire={() => undefined}
        />
      </AppProvider>,
    );

    expect(screen.getByLabelText("Thread todo dock")).toHaveAttribute("data-collapsed", "true");
    expect(screen.getByText("Wire ACP todo placement")).toBeInTheDocument();
    expect(screen.queryByText("Build ACP todo dock")).not.toBeInTheDocument();
    expect(screen.queryByText("Cover ACP todo dock behavior")).not.toBeInTheDocument();
  });

  it("shows all in-progress rows when collapsed", () => {
    const multiInProgressState = {
      sourceItemId: "plan-1",
      itemState: "updated" as const,
      sourceKind: "steps" as const,
      activeIndex: 1,
      steps: [
        { text: "Task 1", status: "completed" as const },
        { text: "Task 2", status: "in_progress" as const },
        { text: "Task 3", status: "in_progress" as const },
        { text: "Task 4", status: "pending" as const },
      ],
    };

    render(
      <AppProvider>
        <ThreadTodoDock
          collapsed
          placement="right"
          state={multiInProgressState}
          onCollapsedChange={() => undefined}
          onRetire={() => undefined}
        />
      </AppProvider>,
    );

    expect(screen.getByText("Task 2")).toBeInTheDocument();
    expect(screen.getByText("Task 3")).toBeInTheDocument();
    expect(screen.queryByText("Task 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Task 4")).not.toBeInTheDocument();
  });
});
