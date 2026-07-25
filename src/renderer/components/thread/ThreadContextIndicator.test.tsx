import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ThreadContextDock } from "./ThreadContextDock";
import { ThreadContextIndicator } from "./ThreadContextIndicator";
import type { ThreadContextUsageSummary } from "./threadContextUsage";

const summary: ThreadContextUsageSummary = {
  usedTokens: 71_000,
  maxTokens: 200_000,
  remainingTokens: 129_000,
  percent: 36,
  breakdown: [{ id: "input", label: "Input", tokens: 71_000 }],
  usedLabel: "71K",
  maxLabel: "200K",
  remainingLabel: "129K",
  percentLabel: "36%",
  headline: "36% full",
  detail: "71K / 200K tokens",
};

describe("ThreadContextIndicator", () => {
  it("renders the context ring without any number and toggles the dock", () => {
    const onToggle = vi.fn<() => void>();
    const { container } = render(
      <ThreadContextIndicator summary={summary} isOpen={false} onToggle={onToggle} />,
    );

    const trigger = screen.getByRole("button", { name: "Show context usage details" });

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("data-tone", "normal");
    expect(
      container.querySelector(".poracode-context-indicator__ring-progress"),
    ).toBeInTheDocument();
    expect(container.querySelector(".poracode-context-indicator svg text")).not.toBeInTheDocument();
    expect(container.querySelector(".poracode-context-indicator__percent")).not.toBeInTheDocument();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders the composer context breakdown dock", () => {
    render(<ThreadContextDock summary={summary} onClose={() => undefined} />);

    expect(screen.getByRole("region", { name: "Thread context usage" })).toBeVisible();
    expect(screen.getByText("36% Full")).toBeVisible();
    expect(screen.getByText("71K used")).toBeVisible();
    expect(screen.getByText("200K limit")).toBeVisible();
    expect(screen.getByText("Input")).toBeVisible();
    expect(screen.getByText("71,000")).toBeVisible();
  });
});
