import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDoneViewportReveal } from "./useDoneViewportReveal";

const COLUMN_HEIGHT = 800;
const HEADER_HEIGHT = 28;
const CAP = COLUMN_HEIGHT / 2 - HEADER_HEIGHT;

function Section(props: { collapsed: boolean }) {
  const viewportRef = useDoneViewportReveal(props.collapsed);
  return (
    <div data-testid="column">
      <div data-testid="section">
        <div ref={viewportRef} data-testid="viewport" />
      </div>
    </div>
  );
}

/** Renders collapsed, then stubs the mounted elements' layout for the open. */
function renderCollapsed(options: { viewportHeight: number; reducedMotion?: boolean }) {
  const view = render(<Section collapsed />);
  const animation = {
    playState: "running" as AnimationPlayState,
    pause: vi.fn<() => void>(),
    cancel: vi.fn<() => void>(),
  };
  const animate = vi.fn<(keyframes: Keyframe[], timing: KeyframeAnimationOptions) => Animation>(
    () => animation as unknown as Animation,
  );
  const viewport = screen.getByTestId("viewport");
  viewport.animate = animate;
  viewport.getBoundingClientRect = () => ({ height: options.viewportHeight }) as DOMRect;
  screen.getByTestId("section").getBoundingClientRect = () =>
    ({ height: options.viewportHeight + HEADER_HEIGHT }) as DOMRect;
  Object.defineProperty(screen.getByTestId("column"), "clientHeight", { value: COLUMN_HEIGHT });
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: options.reducedMotion ?? false,
  } as MediaQueryList);
  return { ...view, animate, animation };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useDoneViewportReveal", () => {
  it("eases the viewport from its pre-open height up to the section cap", () => {
    const { rerender, animate } = renderCollapsed({ viewportHeight: 48 });

    rerender(<Section collapsed={false} />);

    expect(animate).toHaveBeenCalledExactlyOnceWith(
      [{ maxHeight: "48px" }, { maxHeight: `${CAP}px` }],
      expect.objectContaining({ duration: 200 }),
    );
  });

  it("holds the bound while the rows close when collapsed mid-reveal", () => {
    vi.useFakeTimers();
    const { rerender, animation } = renderCollapsed({ viewportHeight: 0 });
    rerender(<Section collapsed={false} />);

    rerender(<Section collapsed />);

    expect(animation.pause).toHaveBeenCalledOnce();
    expect(animation.cancel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(animation.cancel).toHaveBeenCalledOnce();
  });

  it("leaves a finished reveal alone on collapse", () => {
    const { rerender, animation } = renderCollapsed({ viewportHeight: 0 });
    rerender(<Section collapsed={false} />);
    animation.playState = "finished";

    rerender(<Section collapsed />);

    expect(animation.pause).not.toHaveBeenCalled();
  });

  it("does not animate rows that already fill the cap", () => {
    const { rerender, animate } = renderCollapsed({ viewportHeight: CAP });

    rerender(<Section collapsed={false} />);

    expect(animate).not.toHaveBeenCalled();
  });

  it("respects reduced motion", () => {
    const { rerender, animate } = renderCollapsed({ viewportHeight: 0, reducedMotion: true });

    rerender(<Section collapsed={false} />);

    expect(animate).not.toHaveBeenCalled();
  });
});
