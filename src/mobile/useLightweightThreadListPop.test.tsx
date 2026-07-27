// @vitest-environment jsdom
import { StrictMode, useRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIGHTWEIGHT_THREAD_LIST_POP_ANIMATION,
  LIGHTWEIGHT_THREAD_LIST_POP_CLASS,
  LIGHTWEIGHT_SUBAGENT_PUSH_ANIMATION,
  LIGHTWEIGHT_SUBAGENT_PUSH_CLASS,
  LIGHTWEIGHT_SUBAGENT_POP_ANIMATION,
  LIGHTWEIGHT_SUBAGENT_POP_CLASS,
  LIGHTWEIGHT_FULLSCREEN_PUSH_ANIMATION,
  LIGHTWEIGHT_FULLSCREEN_PUSH_CLASS,
  LIGHTWEIGHT_FULLSCREEN_POP_ANIMATION,
  LIGHTWEIGHT_FULLSCREEN_POP_CLASS,
} from "./lightweightThreadListPop";
import { useLightweightThreadListPop } from "./useLightweightThreadListPop";

function Harness(props: { readonly pathname: string }) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  useLightweightThreadListPop(shellRef, props.pathname);
  return (
    <div ref={shellRef} data-testid="shell">
      <header className="m-topbar" />
      <main className="m-main" />
      <div className="m-home-compose-actions" />
    </div>
  );
}

describe("useLightweightThreadListPop", () => {
  beforeEach(() => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    );
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("iPhone");
    vi.stubGlobal("Capacitor", undefined);
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn<MediaQueryList["addEventListener"]>(),
        removeEventListener: vi.fn<MediaQueryList["removeEventListener"]>(),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts before paint on a thread-to-list commit and clears after the animation", () => {
    const view = render(
      <StrictMode>
        <Harness pathname="/thread/long" />
      </StrictMode>,
    );
    const shell = view.getByTestId("shell");
    expect(shell).not.toHaveClass(LIGHTWEIGHT_THREAD_LIST_POP_CLASS);

    view.rerender(
      <StrictMode>
        <Harness pathname="/threads" />
      </StrictMode>,
    );
    expect(shell).toHaveClass(LIGHTWEIGHT_THREAD_LIST_POP_CLASS);

    const animationEnd = new Event("animationend", { bubbles: true });
    Object.defineProperty(animationEnd, "animationName", {
      value: LIGHTWEIGHT_THREAD_LIST_POP_ANIMATION,
    });
    fireEvent(shell, animationEnd);
    expect(shell).not.toHaveClass(LIGHTWEIGHT_THREAD_LIST_POP_CLASS);
  });

  it("does not animate when the user requests reduced motion", () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn<MediaQueryList["addListener"]>(),
      removeListener: vi.fn<MediaQueryList["removeListener"]>(),
      addEventListener: vi.fn<MediaQueryList["addEventListener"]>(),
      removeEventListener: vi.fn<MediaQueryList["removeEventListener"]>(),
      dispatchEvent: vi.fn<MediaQueryList["dispatchEvent"]>(),
    });
    const view = render(<Harness pathname="/thread/long" />);
    view.rerender(<Harness pathname="/threads" />);
    expect(view.getByTestId("shell")).not.toHaveClass(LIGHTWEIGHT_THREAD_LIST_POP_CLASS);
  });

  it("animates only the lightweight subagent layer on a thread-to-subagent commit", () => {
    const view = render(<Harness pathname="/thread/thread-1" />);
    const shell = view.getByTestId("shell");

    view.rerender(<Harness pathname="/subagent/thread-1/parent-1" />);
    expect(shell).toHaveClass(LIGHTWEIGHT_SUBAGENT_PUSH_CLASS);

    const animationEnd = new Event("animationend", { bubbles: true });
    Object.defineProperty(animationEnd, "animationName", {
      value: LIGHTWEIGHT_SUBAGENT_PUSH_ANIMATION,
    });
    fireEvent(shell, animationEnd);
    expect(shell).not.toHaveClass(LIGHTWEIGHT_SUBAGENT_PUSH_CLASS);
  });

  it("animates only the mounted parent shell on a subagent-to-thread commit", () => {
    const view = render(<Harness pathname="/subagent/thread-1/parent-1" />);
    const shell = view.getByTestId("shell");

    view.rerender(<Harness pathname="/thread/thread-1" />);
    expect(shell).toHaveClass(LIGHTWEIGHT_SUBAGENT_POP_CLASS);

    const animationEnd = new Event("animationend", { bubbles: true });
    Object.defineProperty(animationEnd, "animationName", {
      value: LIGHTWEIGHT_SUBAGENT_POP_ANIMATION,
    });
    fireEvent(shell, animationEnd);
    expect(shell).not.toHaveClass(LIGHTWEIGHT_SUBAGENT_POP_CLASS);
  });

  it("animates only the incoming overlay on a thread-to-fullscreen commit", () => {
    const view = render(<Harness pathname="/thread/thread-1" />);
    const shell = view.getByTestId("shell");

    view.rerender(<Harness pathname="/workspace/thread-1" />);
    expect(shell).toHaveClass(LIGHTWEIGHT_FULLSCREEN_PUSH_CLASS);

    const animationEnd = new Event("animationend", { bubbles: true });
    Object.defineProperty(animationEnd, "animationName", {
      value: LIGHTWEIGHT_FULLSCREEN_PUSH_ANIMATION,
    });
    fireEvent(shell, animationEnd);
    expect(shell).not.toHaveClass(LIGHTWEIGHT_FULLSCREEN_PUSH_CLASS);
  });

  it("animates only the incoming shell on a fullscreen-to-thread commit", () => {
    const view = render(<Harness pathname="/workspace/thread-1" />);
    const shell = view.getByTestId("shell");

    view.rerender(<Harness pathname="/thread/thread-1" />);
    expect(shell).toHaveClass(LIGHTWEIGHT_FULLSCREEN_POP_CLASS);

    const animationEnd = new Event("animationend", { bubbles: true });
    Object.defineProperty(animationEnd, "animationName", {
      value: LIGHTWEIGHT_FULLSCREEN_POP_ANIMATION,
    });
    fireEvent(shell, animationEnd);
    expect(shell).not.toHaveClass(LIGHTWEIGHT_FULLSCREEN_POP_CLASS);
  });
});
