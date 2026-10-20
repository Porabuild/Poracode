import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeVisualViewport } from "./NativeVisualViewport";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("native visual fit to width", () => {
  it("fits intrinsic diagram size including enclosing padding, follows resize and disconnects", () => {
    let available = 210;
    const observers: { callback: () => void; disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => available);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        disconnect = vi.fn<() => void>();
        observe = vi.fn<(element: Element) => void>();
        constructor(callback: () => void) {
          observers.push({ callback, disconnect: this.disconnect });
        }
      },
    );
    const result = render(
      <NativeVisualViewport zoom={200} fitToWidth label="Visual">
        <div style={{ padding: 12 }}>
          <div style={{ padding: 4 }}>
            <svg width={528} height={300} role="img" aria-label="Dependencies" />
          </div>
        </div>
      </NativeVisualViewport>,
    );
    const content = result.container.querySelector<HTMLElement>("[data-native-visual-zoom]")!;
    expect(content.style.width).toBe("560px");
    expect(result.getByRole("region", { name: "Visual" })).not.toHaveAttribute("tabindex");
    expect(Number(content.style.zoom)).toBe(210 / 560);
    available = 840;
    act(() => observers.at(-1)!.callback());
    expect(content.style.width).toBe("840px");
    expect(Number(content.style.zoom)).toBe(1);
    result.unmount();
    expect(observers.every((observer) => observer.disconnect.mock.calls.length > 0)).toBe(true);
  });

  it("fits actual intrinsic numeric controls and returns to manual zoom without an observer", () => {
    const disconnect = vi.fn<() => void>();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn<(element: Element) => void>();
        disconnect = disconnect;
      },
    );
    const children = (
      <div style={{ padding: 12 }}>
        <div style={{ padding: 12 }}>
          <div className="number-field">-999,999,999,999.875</div>
        </div>
      </div>
    );
    const result = render(
      <NativeVisualViewport zoom={100} fitToWidth label="Visual">
        {children}
      </NativeVisualViewport>,
    );
    const content = result.container.querySelector<HTMLElement>("[data-native-visual-zoom]")!;
    expect(content.style.width).toBe("348px");
    expect(Number(content.style.zoom)).toBe(200 / 348);
    result.rerender(
      <NativeVisualViewport zoom={125} fitToWidth={false} label="Visual">
        {children}
      </NativeVisualViewport>,
    );
    expect(disconnect).toHaveBeenCalled();
    expect(content.style.width).toBe("");
    expect(Number(content.style.zoom)).toBe(1.25);
    expect(result.getByRole("region", { name: "Visual" })).toHaveAttribute("tabindex", "0");
  });
});
