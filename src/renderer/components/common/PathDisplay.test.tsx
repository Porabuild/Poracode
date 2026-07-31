import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PathDisplay } from "./PathDisplay";

const CHAR_WIDTH = 8;

vi.mock("@chenglou/pretext", () => ({
  prepare: (text: string) => ({ text, length: text.length }),
  layout: (prepared: { text: string }, maxWidth: number) => {
    const totalWidth = prepared.text.length * CHAR_WIDTH;
    const lineCount = Math.max(1, Math.ceil(totalWidth / Math.max(1, maxWidth)));
    return { lineCount, height: lineCount * 16 };
  },
}));

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  cb: ResizeObserverCallback;
  target: Element | null = null;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
    MockResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.target = target;
  }
  unobserve() {}
  disconnect() {}
  fire(width: number) {
    if (!this.target) return;
    this.cb(
      [{ contentRect: { width } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

beforeEach(() => {
  MockResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  Element.prototype.getBoundingClientRect = function () {
    return {
      width: 0,
      height: 16,
      top: 0,
      left: 0,
      right: 0,
      bottom: 16,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect;
  };
});

function fireWidths(container: number, fixed: number) {
  // Order: containerRef observer is added first, fixedRef observer second.
  act(() => {
    MockResizeObserver.instances[0]?.fire(container);
    MockResizeObserver.instances[1]?.fire(fixed);
  });
}

describe("PathDisplay", () => {
  it("can render without layout measurement for virtualized rows", () => {
    const { container } = render(<PathDisplay path="src/main/db.ts" measureOverflow={false} />);
    expect(container.textContent).toBe("db.tssrc/main");
    expect(MockResizeObserver.instances).toHaveLength(0);
  });

  it("renders only basename when path has no directory", () => {
    const { container, rerender } = render(<PathDisplay path="README.md" />);
    fireWidths(500, 80);
    rerender(<PathDisplay path="README.md" />);
    expect(container.textContent).toBe("README.md");
    expect(container.textContent).not.toContain("…");
  });

  it("renders basename followed by full directory when path fits", () => {
    const { container, rerender } = render(<PathDisplay path="src/main/db.ts" />);
    // Wide container, small fixed slot — dir "src/main" (8 chars * 8px = 64px) fits in remainder.
    fireWidths(500, 40);
    rerender(<PathDisplay path="src/main/db.ts" />);
    // Basename comes first, then dir (no trailing slash, separated visually by margin).
    expect(container.textContent).toBe("db.tssrc/main");
    expect(container.textContent).not.toContain("…");
  });

  it("head-truncates the directory with a leading ellipsis when it does not fit", () => {
    const path = "very/long/nested/path/inside/some/repo/db.ts";
    const { container, rerender } = render(<PathDisplay path={path} />);
    // Tight container so the dir cannot fit in full.
    fireWidths(120, 40);
    rerender(<PathDisplay path={path} />);
    expect(container.textContent).toContain("…");
    expect(container.textContent?.startsWith("db.ts")).toBe(true);
    expect(container.textContent?.indexOf("…")).toBeGreaterThan(0);
  });

  it("drops the directory when only a 1-char tail would fit (no '…_' noise)", () => {
    const path = "verylongdir/nested/here/db.ts";
    const { container, rerender } = render(<PathDisplay path={path} />);
    // dirAvailable = 100 - 80 - FIT_SLACK(4) = 16px → only "…" + one 8px char
    // fits, which is below MIN_DIR_TAIL, so the directory is dropped entirely.
    fireWidths(100, 80);
    rerender(<PathDisplay path={path} />);
    expect(container.textContent).toBe("db.ts");
    expect(container.textContent).not.toContain("…");
  });

  it("omits the directory (no lone ellipsis) when the basename fills the row", () => {
    const path = "src/components/views/useVeryLongFileNameComponent.tsx";
    const { container, rerender } = render(<PathDisplay path={path} />);
    // Basename consumes the whole container — zero room for any dir character.
    fireWidths(200, 200);
    rerender(<PathDisplay path={path} />);
    expect(container.textContent).toBe("useVeryLongFileNameComponent.tsx");
    expect(container.textContent).not.toContain("…");
  });
});
