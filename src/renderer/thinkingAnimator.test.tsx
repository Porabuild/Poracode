import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBrainThinking, useIconShine, useShimmer } from "./thinkingAnimator";
import { PaneVisibility } from "./paneVisibility";

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

function IconProbe({ active = true }: { active?: boolean }) {
  const ref = useIconShine(active);
  return <span ref={ref} data-testid="icon" />;
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
    vi.unstubAllGlobals();
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

  it("stops the shared timer for hidden retained panes and resumes at the current phase", () => {
    const pane = (visible: boolean) => (
      <PaneVisibility value={visible}>
        <ShimmerProbe active={true} />
        <BrainProbe active={true} />
        <IconProbe />
      </PaneVisibility>
    );
    const view = render(pane(true));
    vi.advanceTimersByTime(50);
    const shimmer = view.getByTestId("shimmer");
    const brain = view.getByTestId("p0");
    const position = shimmer.style.backgroundPositionX;
    const opacity = brain.style.opacity;
    const icon = view.getByTestId("icon");
    const transform = icon.style.transform;
    view.rerender(pane(false));
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(500);
    expect(shimmer.style.backgroundPositionX).toBe(position);
    expect(brain.style.opacity).toBe(opacity);
    expect(icon.style.transform).toBe(transform);
    view.rerender(pane(true));
    expect(vi.getTimerCount()).toBe(1);
    expect(parseFloat(shimmer.style.backgroundPositionX)).toBeCloseTo(-50, 1);
    // The second registry joins an already-running shared timer.
    vi.advanceTimersByTime(50);
    expect(brain.style.opacity).not.toBe(opacity);
  });

  it("does not register initially hidden targets or stop another visible pane", () => {
    const view = render(
      <>
        <PaneVisibility value={false}>
          <ShimmerProbe active={true} />
        </PaneVisibility>
        <BrainProbe active={true} />
      </>,
    );
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(500);
    expect(view.getByTestId("shimmer").style.backgroundPositionX).toBe("");
    expect(view.getByTestId("p0").style.opacity).not.toBe("0.450");
  });

  it("continues at a lower rate while the app is unfocused", () => {
    document.documentElement.setAttribute("data-app-unfocused", "");
    const { getByTestId } = render(<ShimmerProbe active={true} />);
    const el = getByTestId("shimmer") as HTMLSpanElement;
    const initial = el.style.backgroundPositionX;

    vi.advanceTimersByTime(150);
    expect(el.style.backgroundPositionX).toBe(initial);

    vi.advanceTimersByTime(50);
    expect(parseFloat(el.style.backgroundPositionX)).toBeCloseTo(-18.2, 1);
  });

  it("batches icon shine and shimmer on the same clock and stops when both unmount", () => {
    const view = render(
      <>
        <ShimmerProbe active={true} />
        <IconProbe />
      </>,
    );
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(50);
    expect(view.getByTestId("icon").style.transform).toBe("translate3d(-31.2497%, 0, 0)");
    expect(parseFloat(view.getByTestId("shimmer").style.backgroundPositionX)).toBeCloseTo(-4.5, 1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("joins newly mounted icons to the current sweep phase", () => {
    const view = render(<IconProbe />);
    vi.advanceTimersByTime(750);
    view.rerender(
      <>
        <IconProbe />
        <IconProbe />
      </>,
    );
    vi.advanceTimersByTime(50);
    expect(view.getAllByTestId("icon").map((el) => el.style.transform)).toEqual([
      "translate3d(0.0000%, 0, 0)",
      "translate3d(0.0000%, 0, 0)",
    ]);
  });

  it("reschedules the shared cadence on blur and focus", () => {
    const view = render(
      <>
        <ShimmerProbe active={true} />
        <IconProbe />
      </>,
    );
    document.documentElement.setAttribute("data-app-unfocused", "");
    window.dispatchEvent(new Event("blur"));
    const initial = view.getByTestId("icon").style.transform;
    vi.advanceTimersByTime(150);
    expect(view.getByTestId("icon").style.transform).toBe(initial);
    vi.advanceTimersByTime(50);
    expect(view.getByTestId("icon").style.transform).not.toBe(initial);
    document.documentElement.removeAttribute("data-app-unfocused");
    window.dispatchEvent(new Event("focus"));
    const background = view.getByTestId("icon").style.transform;
    vi.advanceTimersByTime(50);
    expect(view.getByTestId("icon").style.transform).not.toBe(background);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("stops for a hidden page and resumes at the current phase", () => {
    const view = render(
      <>
        <ShimmerProbe active={true} />
        <IconProbe />
      </>,
    );
    document.documentElement.setAttribute("data-app-hidden", "");
    document.dispatchEvent(new Event("visibilitychange"));
    const initial = view.getByTestId("icon").style.transform;
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(800);
    expect(view.getByTestId("icon").style.transform).toBe(initial);
    document.documentElement.removeAttribute("data-app-hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(view.getByTestId("icon").style.transform).toBe("translate3d(0.0000%, 0, 0)");
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    window.dispatchEvent(new Event("focus"));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops offscreen targets without stopping another visible effect", () => {
    let intersect: IntersectionObserverCallback;
    const unobserve = vi.fn<(target: Element) => void>();
    const disconnect = vi.fn<() => void>();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersect = callback;
        }
        observe = vi.fn<(target: Element) => void>();
        unobserve = unobserve;
        disconnect = disconnect;
      },
    );
    const view = render(
      <>
        <ShimmerProbe active={true} />
        <IconProbe />
      </>,
    );
    const icon = view.getByTestId("icon");
    const shimmer = view.getByTestId("shimmer");
    const notify = (target: Element, isIntersecting: boolean) =>
      intersect(
        [{ target, isIntersecting } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    notify(icon, false);
    const iconPosition = icon.style.transform;
    vi.advanceTimersByTime(100);
    expect(icon.style.transform).toBe(iconPosition);
    expect(parseFloat(shimmer.style.backgroundPositionX)).toBeCloseTo(-9.1, 1);
    notify(shimmer, false);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(700);
    notify(icon, true);
    expect(icon.style.transform).toBe("translate3d(0.0000%, 0, 0)");
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(unobserve).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("responds to reduced-motion changes without keeping a timer alive", () => {
    const query = new EventTarget() as MediaQueryList;
    Object.defineProperty(query, "matches", { value: false, configurable: true });
    vi.spyOn(window, "matchMedia").mockReturnValue(query);
    const view = render(
      <>
        <ShimmerProbe active={true} />
        <IconProbe />
      </>,
    );
    vi.advanceTimersByTime(500);
    Object.defineProperty(query, "matches", { value: true });
    query.dispatchEvent(new Event("change"));
    expect(vi.getTimerCount()).toBe(0);
    expect(view.getByTestId("icon").style.transform).toBe("translate3d(-33.3330%, 0, 0)");
    vi.advanceTimersByTime(300);
    Object.defineProperty(query, "matches", { value: false });
    query.dispatchEvent(new Event("change"));
    expect(view.getByTestId("icon").style.transform).toBe("translate3d(0.0000%, 0, 0)");
    expect(vi.getTimerCount()).toBe(1);
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
