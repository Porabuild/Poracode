// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useKeyboardGeometry,
  useKeyboardOffset,
  useKeyboardVisibilityOffset,
} from "./useKeyboardOffset";

type ViewportListener = EventListenerOrEventListenerObject;
type MockVisualViewport = {
  height: number;
  offsetTop: number;
  pageTop: number;
  addEventListener: (type: string, listener: ViewportListener) => void;
  removeEventListener: (type: string, listener: ViewportListener) => void;
};

const originalInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
const originalClientHeight = Object.getOwnPropertyDescriptor(
  document.documentElement,
  "clientHeight",
);
const originalVisualViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");

function setWindowHeight(height: number): void {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function setDocumentHeight(height: number): void {
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: height,
  });
}

function installVisualViewport(input: { height: number; offsetTop?: number }) {
  const listeners = new Map<string, Set<ViewportListener>>();
  const viewport: MockVisualViewport = {
    height: input.height,
    offsetTop: input.offsetTop ?? 0,
    pageTop: input.offsetTop ?? 0,
    addEventListener(type: string, listener: ViewportListener) {
      const bucket = listeners.get(type) ?? new Set<ViewportListener>();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener(type: string, listener: ViewportListener) {
      listeners.get(type)?.delete(listener);
    },
  };

  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport as unknown as VisualViewport,
  });

  return {
    viewport,
    dispatch(type = "resize") {
      const event = new Event(type);
      for (const listener of listeners.get(type) ?? []) {
        if (typeof listener === "function") {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      }
    },
  };
}

const ANDROID_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

/** Platform detection is user-agent based, so Android tests stub the UA string. */
function useAndroidUserAgent(): void {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: ANDROID_USER_AGENT,
  });
}

describe("useKeyboardOffset", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--m-viewport-baseline-height");
    document.documentElement.style.removeProperty("--m-keyboard-visibility-offset");
    if (originalInnerHeight) {
      Object.defineProperty(window, "innerHeight", originalInnerHeight);
    } else {
      Reflect.deleteProperty(window, "innerHeight");
    }
    if (originalClientHeight) {
      Object.defineProperty(document.documentElement, "clientHeight", originalClientHeight);
    } else {
      Reflect.deleteProperty(document.documentElement, "clientHeight");
    }
    if (originalVisualViewport) {
      Object.defineProperty(window, "visualViewport", originalVisualViewport);
    } else {
      Reflect.deleteProperty(window, "visualViewport");
    }
    // Restores the jsdom prototype getter for the stubbed Android UA.
    Reflect.deleteProperty(window.navigator, "userAgent");
    vi.unstubAllGlobals();
  });

  it("reports the same visibility and lift offsets when the keyboard overlays the layout viewport", async () => {
    setWindowHeight(800);
    setDocumentHeight(800);
    const visualViewport = installVisualViewport({ height: 800 });
    const { result } = renderHook(() => useKeyboardGeometry());

    await waitFor(() => expect(result.current).toEqual({ liftOffset: 0, visibilityOffset: 0 }));

    act(() => {
      visualViewport.viewport.height = 500;
      visualViewport.dispatch();
    });

    expect(result.current).toEqual({ liftOffset: 300, visibilityOffset: 300 });
  });

  it("keeps manual lift at zero when the layout viewport resizes around the Android keyboard", async () => {
    setWindowHeight(800);
    setDocumentHeight(800);
    const visualViewport = installVisualViewport({ height: 800 });
    const { result: lift } = renderHook(() => useKeyboardOffset());
    const { result: visibility } = renderHook(() => useKeyboardVisibilityOffset());

    await waitFor(() => {
      expect(lift.current).toBe(0);
      expect(visibility.current).toBe(0);
    });

    act(() => {
      setDocumentHeight(500);
      visualViewport.viewport.height = 500;
      visualViewport.dispatch();
    });

    expect(lift.current).toBe(0);
    expect(visibility.current).toBe(300);
  });

  it("uses Android window innerHeight when documentElement keeps its pre-keyboard height", async () => {
    useAndroidUserAgent();
    setWindowHeight(923);
    setDocumentHeight(923);
    const visualViewport = installVisualViewport({ height: 923 });
    const { result } = renderHook(() => useKeyboardGeometry());

    await waitFor(() => expect(result.current).toEqual({ liftOffset: 0, visibilityOffset: 0 }));

    act(() => {
      setWindowHeight(587);
      setDocumentHeight(923);
      visualViewport.viewport.height = 587;
      visualViewport.dispatch();
    });

    expect(result.current).toEqual({ liftOffset: 0, visibilityOffset: 336 });
    expect(document.documentElement.style.getPropertyValue("--m-viewport-baseline-height")).toBe(
      "923px",
    );
    expect(document.documentElement.style.getPropertyValue("--m-keyboard-visibility-offset")).toBe(
      "336px",
    );
  });

  it("ignores Android visual viewport undershoot after the layout viewport has resized", async () => {
    useAndroidUserAgent();
    setWindowHeight(923);
    setDocumentHeight(923);
    const visualViewport = installVisualViewport({ height: 923 });
    const { result } = renderHook(() => useKeyboardGeometry());

    await waitFor(() => expect(result.current).toEqual({ liftOffset: 0, visibilityOffset: 0 }));

    act(() => {
      setWindowHeight(587);
      setDocumentHeight(587);
      visualViewport.viewport.height = 251;
      visualViewport.dispatch();
    });

    expect(result.current).toEqual({ liftOffset: 0, visibilityOffset: 336 });
  });

  it("suppresses Android manual lift during visual-viewport-only pre-resize frames", async () => {
    useAndroidUserAgent();
    setWindowHeight(923);
    setDocumentHeight(923);
    const visualViewport = installVisualViewport({ height: 923 });
    const { result } = renderHook(() => useKeyboardGeometry());

    await waitFor(() => expect(result.current).toEqual({ liftOffset: 0, visibilityOffset: 0 }));

    act(() => {
      visualViewport.viewport.height = 587;
      visualViewport.dispatch();
    });

    expect(result.current).toEqual({ liftOffset: 0, visibilityOffset: 336 });
  });

  it("keeps Android visual viewport reveal pan as visibility-only keyboard height", async () => {
    useAndroidUserAgent();
    setWindowHeight(800);
    setDocumentHeight(800);
    const visualViewport = installVisualViewport({ height: 800 });
    const { result } = renderHook(() => useKeyboardGeometry());

    await waitFor(() => expect(result.current).toEqual({ liftOffset: 0, visibilityOffset: 0 }));

    act(() => {
      visualViewport.viewport.height = 250;
      visualViewport.viewport.pageTop = 250;
      visualViewport.dispatch();
    });

    expect(result.current).toEqual({ liftOffset: 0, visibilityOffset: 300 });
  });
});
