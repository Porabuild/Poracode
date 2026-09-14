import { act, cleanup, render } from "@testing-library/react";
import { Plug } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { GroupSummarySection } from "./GroupSummarySection";

function Summary({ count, running = true }: { count: number; running?: boolean }) {
  return (
    <AppProvider>
      <GroupSummarySection
        section={{
          category: "mcp",
          count,
          label: count === 1 ? "MCP" : "MCPs",
          Icon: Plug,
          hasRunning: running,
        }}
        showRunning
      />
    </AppProvider>
  );
}

describe("GroupSummarySection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps the animated count outside the shimmer text mask", () => {
    const { container } = render(<Summary count={3} />);
    const code = container.querySelector("code")!;
    const counter = code.firstElementChild!;
    const label = code.querySelector(".poracode-thinking-text")!;

    expect(code.textContent).toBe("3 MCPs");
    expect(label.textContent).toBe("MCPs");
    expect(counter.closest(".poracode-thinking-text")).toBeNull();
  });

  it("refreshes changed label glyphs while preserving the rolling counter", () => {
    const view = render(<Summary count={1} />);
    const counter = view.container.querySelector("code")!.firstElementChild;
    const previousLabel = view.container.querySelector(".poracode-thinking-text")!;
    const previousPosition = (previousLabel as HTMLElement).style.backgroundPositionX;

    view.rerender(<Summary count={2} />);
    const nextLabel = view.container.querySelector<HTMLElement>(".poracode-thinking-text")!;
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // 100ms on the shared timer → -200 × (100 / 2200) ≈ -9.1% (same convention
    // as thinkingAnimator.test.tsx). Closing on the phase proves the remounted
    // label is registered and driven, not merely left with an empty style.
    expect(parseFloat(nextLabel.style.backgroundPositionX)).toBeCloseTo(-9.1, 1);
    expect(view.container.querySelector("code")!.firstElementChild).toBe(counter);
    expect(nextLabel).not.toBe(previousLabel);
    expect(nextLabel.textContent).toBe("MCPs");
    expect(nextLabel.style.backgroundPositionX).not.toBe(previousPosition);
    expect((previousLabel as HTMLElement).style.backgroundPositionX).toBe(previousPosition);
  });

  it("keeps a stable label mounted as its count grows", () => {
    const view = render(<Summary count={2} />);
    const label = view.container.querySelector(".poracode-thinking-text");
    const counter = view.container.querySelector("code")!.firstElementChild;

    view.rerender(<Summary count={3} />);

    expect(view.container.querySelector(".poracode-thinking-text")).toBe(label);
    expect(view.container.querySelector("code")!.firstElementChild).toBe(counter);
    expect(view.container.querySelector("code")!.textContent).toBe("3 MCPs");
  });

  it("stops shimmering when the category finishes", () => {
    const view = render(<Summary count={3} />);
    const label = view.container.querySelector<HTMLElement>(".poracode-thinking-text")!;
    const paintedPosition = label.style.backgroundPositionX;

    view.rerender(<Summary count={3} running={false} />);

    expect(view.container.querySelector(".poracode-thinking-text")).toBeNull();
    expect(view.container.querySelector("code")!.textContent).toBe("3 MCPs");

    // Going inactive must unregister the label, otherwise the shared timer
    // keeps repainting an invisible span (the loop thinkingAnimator.ts exists
    // to avoid).
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(label.style.backgroundPositionX).toBe(paintedPosition);
  });
});
