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
function Cards(props: { cards: { key: string; left: number; top: number }[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  useDiscoveryCardMotion(listRef);
  return (
    <div>
      <ul ref={listRef}>
        {props.cards.map((card) => (
          <li key={card.key} data-motion-key={card.key} data-left={card.left} data-top={card.top} />
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
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(
      function (this: HTMLElement) {
        return Number(this.dataset.left ?? 0);
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
      function (this: HTMLElement) {
        return Number(this.dataset.top ?? 0);
      },
    );
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
});
