import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBrainThinking, useShimmer } from "./thinkingAnimator";

function ShimmerProbe({ active }: { active: boolean }) {
  const ref = useShimmer<HTMLSpanElement>(active);
  return <span ref={ref} data-testid="shimmer" />;
}

function BrainProbe({ active }: { active: boolean }) {
  const ref = useBrainThinking(active);
  return (
    <svg ref={ref} data-testid="brain">
      <path data-testid="p0" />
      <path data-testid="p1" />
      <path data-testid="p2" />
    </svg>
  );
}

describe("thinkingAnimator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute("data-app-hidden");
    document.documentElement.removeAttribute("data-app-unfocused");
  });

  it("drives the shimmer background-position from a shared timer", () => {
    const { getByTestId } = render(<ShimmerProbe active={true} />);
    const el = getByTestId("shimmer") as HTMLSpanElement;

    // The registration effect paints one frame immediately at t=0.
    expect(el.style.backgroundPositionX).toMatch(/%$/);
    expect(parseFloat(el.style.backgroundPositionX)).toBeCloseTo(0, 5);

    // One 50ms tick → now=50 → -200 * (50/2200) ≈ -4.5%.
    vi.advanceTimersByTime(50);
    expect(parseFloat(el.style.backgroundPositionX)).toBeCloseTo(-4.5, 1);
  });

  it("stops writing once the element unmounts", () => {
    const { getByTestId, unmount } = render(<ShimmerProbe active={true} />);
    const el = getByTestId("shimmer") as HTMLSpanElement;
    vi.advanceTimersByTime(67);
    const afterFirst = el.style.backgroundPositionX;

    unmount();
    // No registered elements left; further ticks must not throw or write.
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(el.style.backgroundPositionX).toBe(afterFirst);
  });

  it("does not animate while inactive", () => {
    const { getByTestId } = render(<ShimmerProbe active={false} />);
    const el = getByTestId("shimmer") as HTMLSpanElement;
    vi.advanceTimersByTime(500);
    expect(el.style.backgroundPositionX).toBe("");
  });

  it("freezes ticks while the app is backgrounded", () => {
    document.documentElement.setAttribute("data-app-hidden", "");
    const { getByTestId } = render(<ShimmerProbe active={true} />);
    const el = getByTestId("shimmer") as HTMLSpanElement;
    const initial = el.style.backgroundPositionX; // painted once on register
    vi.advanceTimersByTime(1000);
    expect(el.style.backgroundPositionX).toBe(initial); // ticks are no-ops while hidden
  });

  it("fires the three brain path groups out of phase", () => {
    const { getByTestId } = render(<BrainProbe active={true} />);
    // At t=0 the groups (delays 0 / 0.6s / 1.2s) sit at different points of the
    // 0.45→1→0.45 pulse, so group 0 differs from groups 1 and 2.
    expect(parseFloat(getByTestId("p0").style.opacity)).toBeCloseTo(0.45, 2);
    expect(parseFloat(getByTestId("p1").style.opacity)).toBeCloseTo(0.817, 2);
    expect(parseFloat(getByTestId("p2").style.opacity)).toBeCloseTo(0.817, 2);
  });
});
