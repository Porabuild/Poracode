import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ThreadGoalDock } from "./ThreadGoalDock";

const bridgeMock = vi.hoisted(() => ({
  controlThreadGoal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  readBridge: () => bridgeMock,
}));

// Render tooltip content inline — React Aria's hover machinery does not open
// tooltips under jsdom.
vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@heroui/react")>();
  const Tooltip = Object.assign((props: { children: ReactNode }) => <>{props.children}</>, {
    Trigger: (props: { children: ReactNode }) => <>{props.children}</>,
    Content: (props: { children: ReactNode }) => <div>{props.children}</div>,
  });
  return { ...actual, Tooltip };
});

describe("ThreadGoalDock", () => {
  afterEach(() => {
    vi.useRealTimers();
    bridgeMock.controlThreadGoal.mockClear();
  });

  it("renders goal details with the shared dock chrome", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T10:00:10Z"));
    const onDismiss = vi.fn<() => void>();

    render(
      <AppProvider>
        <ThreadGoalDock
          threadId="thread-1"
          state={{
            sourceItemId: "goal-1",
            itemState: "completed",
            objective: "Ship goal dock",
            status: "active",
            action: "set",
            tokenBudget: 1000,
            tokensUsed: 120,
            timeUsedSeconds: 5,
            updatedAt: Date.parse("2026-05-12T10:00:10Z") / 1000,
          }}
          placement="composer"
          onDismiss={onDismiss}
        />
      </AppProvider>,
    );

    expect(screen.getByLabelText("Thread goal dock")).toHaveAttribute("data-placement", "composer");
    expect(screen.getByText("Goal")).toBeInTheDocument();
    expect(screen.getByText("Ship goal dock")).toBeInTheDocument();
    expect(screen.getByText("120/1K tokens")).toBeInTheDocument();
    expect(screen.getByText("5s")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close goal" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("offers Codex edit, pause, and clear controls and sends direct goal actions", async () => {
    render(
      <AppProvider>
        <ThreadGoalDock
          threadId="thread-1"
          state={{
            sourceItemId: "goal-1",
            itemState: "completed",
            objective: "Ship goal dock",
            status: "active",
            action: "set",
            availableActions: ["edit", "pause", "clear"],
          }}
          placement="composer"
          onDismiss={() => undefined}
        />
      </AppProvider>,
    );

    expect(screen.getByRole("button", { name: "Edit goal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause goal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear goal" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close goal" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pause goal" }));
    await waitFor(() =>
      expect(bridgeMock.controlThreadGoal).toHaveBeenCalledWith({
        threadId: "thread-1",
        action: "pause",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit goal" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Goal objective" }), {
      target: { value: "Ship edited goal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(bridgeMock.controlThreadGoal).toHaveBeenCalledWith({
        threadId: "thread-1",
        action: "edit",
        objective: "Ship edited goal",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear goal" }));
    await waitFor(() =>
      expect(bridgeMock.controlThreadGoal).toHaveBeenCalledWith({
        threadId: "thread-1",
        action: "clear",
      }),
    );
  });

  it("offers resume for a paused Codex goal", () => {
    render(
      <AppProvider>
        <ThreadGoalDock
          threadId="thread-1"
          state={{
            sourceItemId: "goal-1",
            itemState: "completed",
            objective: "Ship goal dock",
            status: "paused",
            action: "updated",
            availableActions: ["edit", "resume", "clear"],
          }}
          placement="composer"
          onDismiss={() => undefined}
        />
      </AppProvider>,
    );

    expect(screen.getByRole("button", { name: "Resume goal" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause goal" })).not.toBeInTheDocument();
  });

  it("abbreviates five-digit token counts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T10:00:10Z"));

    render(
      <AppProvider>
        <ThreadGoalDock
          threadId="thread-1"
          state={{
            sourceItemId: "goal-1",
            itemState: "completed",
            objective: "Ship goal dock",
            status: "complete",
            action: "updated",
            tokenBudget: null,
            tokensUsed: 11_199,
            timeUsedSeconds: 621,
            updatedAt: Date.parse("2026-05-12T10:00:10Z") / 1000,
          }}
          placement="composer"
          onDismiss={() => undefined}
        />
      </AppProvider>,
    );

    expect(screen.getByText("Complete · 11K tokens")).toBeInTheDocument();
    expect(screen.getByText("10m 21s")).toBeInTheDocument();
  });

  it("shows evaluator check count and surfaces the last evaluation reason in the objective tooltip", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T10:00:10Z"));

    render(
      <AppProvider>
        <ThreadGoalDock
          threadId="thread-1"
          state={{
            sourceItemId: "goal-1",
            itemState: "completed",
            objective: "All auth tests pass",
            status: "active",
            action: "updated",
            tokensUsed: 5000,
            timeUsedSeconds: 60,
            iterations: 3,
            lastReason: "login.test.ts still failing",
            updatedAt: Date.parse("2026-05-12T10:00:10Z") / 1000,
          }}
          placement="composer"
          onDismiss={() => undefined}
        />
      </AppProvider>,
    );

    expect(screen.getByText("3 checks")).toBeInTheDocument();

    expect(screen.getByText(/login\.test\.ts still failing/)).toBeInTheDocument();
  });

  it("swaps the dock icon to the achieved indicator when the goal completes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T10:00:10Z"));

    const { container, rerender } = render(
      <AppProvider>
        <ThreadGoalDock
          threadId="thread-1"
          state={{
            sourceItemId: "goal-1",
            itemState: "completed",
            objective: "Ship goal dock",
            status: "active",
            action: "set",
          }}
          placement="composer"
          onDismiss={() => undefined}
        />
      </AppProvider>,
    );

    const dock = screen.getByLabelText("Thread goal dock");
    const activeIcon = dock.querySelector("svg.lucide-target");
    expect(activeIcon).not.toBeNull();
    expect(dock.querySelector("svg.lucide-circle-check-big")).toBeNull();

    rerender(
      <AppProvider>
        <ThreadGoalDock
          threadId="thread-1"
          state={{
            sourceItemId: "goal-1",
            itemState: "completed",
            objective: "Ship goal dock",
            status: "complete",
            action: "updated",
            tokensUsed: 1200,
            timeUsedSeconds: 90,
          }}
          placement="composer"
          onDismiss={() => undefined}
        />
      </AppProvider>,
    );

    const completeIcon = container.querySelector("svg.lucide-circle-check-big");
    expect(completeIcon).not.toBeNull();
    expect(completeIcon?.classList.contains("text-success")).toBe(true);
    expect(container.querySelector("svg.lucide-target")).toBeNull();
  });

  it.each([
    ["failed", "Failed", "lucide-circle-x"],
    ["cancelled", "Cancelled", "lucide-circle-stop"],
  ] as const)("renders a %s terminal goal outcome", (status, label, iconClass) => {
    render(
      <AppProvider>
        <ThreadGoalDock
          threadId="thread-1"
          state={{
            sourceItemId: `goal-${status}`,
            itemState: "completed",
            objective: "Ship goal dock",
            status,
            action: "updated",
            lastReason: `${label} by provider`,
          }}
          placement="composer"
          onDismiss={() => undefined}
        />
      </AppProvider>,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(document.querySelector(`svg.${iconClass}`)).not.toBeNull();
    expect(screen.getByText(new RegExp(`${label} by provider`))).toBeInTheDocument();
  });

  it("advances active goal elapsed time locally between server updates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T10:00:10Z"));

    render(
      <AppProvider>
        <ThreadGoalDock
          threadId="thread-1"
          state={{
            sourceItemId: "goal-1",
            itemState: "completed",
            objective: "Ship goal dock",
            status: "active",
            action: "updated",
            timeUsedSeconds: 10,
            updatedAt: Date.parse("2026-05-12T10:00:10Z") / 1000,
          }}
          placement="composer"
          onDismiss={() => undefined}
        />
      </AppProvider>,
    );

    expect(screen.getByText("10s")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("13s")).toBeInTheDocument();
  });

  it("keeps active goal elapsed time across dock remounts without a server timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));
    const state = {
      sourceItemId: "goal-remount-no-timestamp",
      itemState: "completed" as const,
      objective: "Ship goal dock",
      status: "active" as const,
      action: "set" as const,
      timeUsedSeconds: 0,
    };

    const first = render(
      <AppProvider>
        <ThreadGoalDock
          threadId="thread-1"
          state={state}
          placement="composer"
          onDismiss={() => undefined}
        />
      </AppProvider>,
    );

    vi.setSystemTime(new Date("2026-05-12T10:01:10Z"));
    first.unmount();

    render(
      <AppProvider>
        <ThreadGoalDock
          threadId="thread-1"
          state={state}
          placement="composer"
          onDismiss={() => undefined}
        />
      </AppProvider>,
    );

    expect(screen.getByText("1m 10s")).toBeInTheDocument();
  });
});
