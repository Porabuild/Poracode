import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiscoveryCardMotion } from "./useDiscoveryCardMotion";

function mediaQueryList(query: string, matches: boolean): MediaQueryList {
  return {
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn<MediaQueryList["addEventListener"]>(),
    removeEventListener: vi.fn<MediaQueryList["removeEventListener"]>(),
    addListener: vi.fn<MediaQueryList["addListener"]>(),
    removeListener: vi.fn<MediaQueryList["removeListener"]>(),
    dispatchEvent: vi.fn<MediaQueryList["dispatchEvent"]>(() => false),
  };
}

/** Each card's slot comes from its `data-left` / `data-top` (jsdom has no layout). */
function Cards(props: {
  cards: { key: string; left: number; top: number }[];
  withSurface?: boolean;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  useDiscoveryCardMotion(listRef);
  return (
    <div>
      <ul ref={listRef}>
        {props.cards.map((card) => (
          <li key={card.key} data-motion-key={card.key} data-left={card.left} data-top={card.top}>
            {props.withSurface ? <div className="agent-discovery-row" /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe("useDiscoveryCardMotion", () => {
  type Animate = (keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Partial<Animation>;
  let animate: ReturnType<typeof vi.fn<Animate>>;
  let reducedMotion: boolean;

  beforeEach(() => {
    reducedMotion = false;
    vi.spyOn(window, "matchMedia").mockImplementation((query) =>
      mediaQueryList(query, reducedMotion),
    );
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return Number(this.dataset.left ?? 0);
    });
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return Number(this.dataset.top ?? 0);
    });
    animate = vi.fn<Animate>(() => ({ cancel: vi.fn<() => void>(), onfinish: null }));
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  });

  it("slides a card from its old slot when a commit moves it", () => {
    const { rerender } = render(<Cards cards={[{ key: "a", left: 200, top: 0 }]} />);
    expect(animate).not.toHaveBeenCalled();

    rerender(
      <Cards
        cards={[
          { key: "a", left: 0, top: 0 },
          { key: "b", left: 400, top: 0 },
        ]}
      />,
    );

    // Only the moved card slides; the newly arrived one has no old slot.
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { transform: "translate(200px, 0px)" },
      { transform: "none" },
    ]);
  });

  it("does not slide cards that stayed put", () => {
    const { rerender } = render(<Cards cards={[{ key: "a", left: 0, top: 0 }]} />);
    rerender(
      <Cards
        cards={[
          { key: "a", left: 0, top: 0 },
          { key: "b", left: 400, top: 0 },
        ]}
      />,
    );
    expect(animate).not.toHaveBeenCalled();
  });

  it("snaps instead of sliding under reduced motion", () => {
    reducedMotion = true;
    const { rerender } = render(<Cards cards={[{ key: "a", left: 200, top: 0 }]} />);
    rerender(<Cards cards={[{ key: "a", left: 0, top: 0 }]} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it("keeps an in-flight slide uninterrupted when unrelated commits leave the slot unchanged", () => {
    const cancel = vi.fn<() => void>();
    animate.mockImplementationOnce(() => ({ cancel, onfinish: null }));
    const { rerender } = render(<Cards cards={[{ key: "a", left: 200, top: 0 }]} />);
    rerender(<Cards cards={[{ key: "a", left: 0, top: 0 }]} />);
    expect(animate).toHaveBeenCalledTimes(1);

    rerender(
      <Cards
        cards={[
          { key: "a", left: 0, top: 0 },
          { key: "b", left: 400, top: 0 },
        ]}
      />,
    );
    expect(cancel).not.toHaveBeenCalled();
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("ignores list container shifts because slots are measured in list-local coordinates", () => {
    let listTop = 200;
    vi.spyOn(HTMLUListElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
      x: 0,
      y: listTop,
      top: listTop,
      left: 0,
      right: 800,
      bottom: listTop + 200,
      width: 800,
      height: 200,
      toJSON: () => ({}),
    }));
    const { rerender } = render(<Cards cards={[{ key: "a", left: 0, top: 0 }]} />);
    listTop = 140;
    rerender(
      <Cards
        cards={[
          { key: "a", left: 0, top: 0 },
          { key: "b", left: 400, top: 0 },
        ]}
      />,
    );
    expect(animate).not.toHaveBeenCalled();
  });

  it("assigns monotonic staggered entrance delays across burst arrivals and skips them under reduced motion", () => {
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { container, rerender } = render(
      <Cards
        withSurface
        cards={[
          { key: "a", left: 0, top: 0 },
          { key: "b", left: 400, top: 0 },
          { key: "c", left: 0, top: 60 },
          { key: "d", left: 400, top: 60 },
        ]}
      />,
    );
    const delays = [...container.querySelectorAll<HTMLElement>(".agent-discovery-row")].map((el) =>
      Number.parseInt(el.style.getPropertyValue("--discovery-enter-delay") || "0", 10),
    );
    expect(delays).toEqual([0, 52, 104, 156]);

    now = 1020;
    rerender(
      <Cards
        withSurface
        cards={[
          { key: "a", left: 0, top: 0 },
          { key: "b", left: 400, top: 0 },
          { key: "c", left: 0, top: 60 },
          { key: "d", left: 400, top: 60 },
          { key: "e", left: 0, top: 120 },
          { key: "f", left: 400, top: 120 },
        ]}
      />,
    );
    const nextDelays = [...container.querySelectorAll<HTMLElement>(".agent-discovery-row")].map(
      (el) => Number.parseInt(el.style.getPropertyValue("--discovery-enter-delay") || "0", 10),
    );
    expect(nextDelays.slice(0, 4)).toEqual([0, 52, 104, 156]);
    expect(nextDelays[4]).toBeGreaterThan(nextDelays[3]!);
    expect(nextDelays[5]).toBeGreaterThan(nextDelays[4]!);

    reducedMotion = true;
    const reduced = render(<Cards withSurface cards={[{ key: "g", left: 0, top: 0 }]} />);
    const reducedRow = reduced.container.querySelector<HTMLElement>(".agent-discovery-row");
    expect(reducedRow?.style.getPropertyValue("--discovery-enter-delay")).toBe("");
  });
});
