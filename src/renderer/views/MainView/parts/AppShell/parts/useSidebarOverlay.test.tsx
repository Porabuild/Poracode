import { useRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSidebarOverlayStore } from "@/renderer/state/sidebarOverlayStore";
import { useSidebarOverlayEffects } from "./useSidebarOverlay";

const originalResizeObserver = globalThis.ResizeObserver;

class MockResizeObserver {
  static instances = new Set<MockResizeObserver>();

  readonly #callback: ResizeObserverCallback;
  readonly #targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    MockResizeObserver.instances.add(this);
  }

  observe(target: Element) {
    this.#targets.add(target);
  }

  unobserve(target: Element) {
    this.#targets.delete(target);
  }

  disconnect() {
    this.#targets.clear();
    MockResizeObserver.instances.delete(this);
  }

  static reset() {
    MockResizeObserver.instances.clear();
  }

  static notify(target: Element, width: number) {
    const entry = {
      target,
      contentRect: { width },
    } as unknown as ResizeObserverEntry;

    for (const instance of MockResizeObserver.instances) {
      if (instance.#targets.has(target)) {
        instance.#callback([entry], instance as unknown as ResizeObserver);
      }
    }
  }
}

function resetSidebarOverlayStore() {
  useSidebarOverlayStore.setState({
    isCollapsed: false,
    userCollapsed: false,
    isAutoCollapsed: false,
    isNarrow: false,
    closingOverlay: false,
    overlayReady: false,
    skipTransition: false,
  });
}

function Harness() {
  const shellRef = useRef<HTMLDivElement>(null);

  useSidebarOverlayEffects({
    sidebarWidth: 350,
    shellRef,
  });

  return (
    <div ref={shellRef} data-testid="shell">
      <main data-testid="main" />
    </div>
  );
}

describe("useSidebarOverlayEffects", () => {
  beforeEach(() => {
    localStorage.clear();
    resetSidebarOverlayStore();
    MockResizeObserver.reset();
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    MockResizeObserver.reset();
    globalThis.ResizeObserver = originalResizeObserver;
    resetSidebarOverlayStore();
  });

  it("ignores transient zero-width sidebar measurements", () => {
    render(<Harness />);

    const shell = screen.getByTestId("shell");

    act(() => {
      MockResizeObserver.notify(shell, 1200);
    });
    expect(useSidebarOverlayStore.getState().isNarrow).toBe(false);

    act(() => {
      MockResizeObserver.notify(shell, 0);
    });
    expect(useSidebarOverlayStore.getState().isNarrow).toBe(false);
  });

  it("ignores disconnected overlay measurements during teardown", () => {
    render(<Harness />);

    const shell = screen.getByTestId("shell");

    act(() => {
      MockResizeObserver.notify(shell, 1200);
      Object.defineProperty(shell, "isConnected", {
        configurable: true,
        value: false,
      });
      MockResizeObserver.notify(shell, 0);
    });

    expect(useSidebarOverlayStore.getState().isNarrow).toBe(false);
  });

  it("does not auto-collapse from transient zero-width main content", () => {
    render(<Harness />);

    const main = screen.getByTestId("main");

    act(() => {
      MockResizeObserver.notify(main, 0);
    });

    expect(useSidebarOverlayStore.getState().isCollapsed).toBe(false);
  });

  it("restores the user preference when a wide shell remounts after auto-collapse", () => {
    const first = render(<Harness />);
    const firstShell = screen.getByTestId("shell");

    act(() => {
      MockResizeObserver.notify(firstShell, 700);
    });
    expect(useSidebarOverlayStore.getState()).toMatchObject({
      isCollapsed: true,
      userCollapsed: false,
      isAutoCollapsed: true,
      isNarrow: true,
    });

    first.unmount();
    render(<Harness />);
    const secondShell = screen.getByTestId("shell");

    act(() => {
      MockResizeObserver.notify(secondShell, 1200);
    });
    expect(useSidebarOverlayStore.getState()).toMatchObject({
      isCollapsed: false,
      userCollapsed: false,
      isAutoCollapsed: false,
      isNarrow: false,
    });
  });
});
