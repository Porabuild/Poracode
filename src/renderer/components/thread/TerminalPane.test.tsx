import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture XTermSurface props across renders so we can inspect them.
let latestProps: Record<string, unknown> = {};

vi.mock("../terminal/XTermSurface", () => ({
  XTermSurface: (props: Record<string, unknown>) => {
    latestProps = props;
    return <div data-testid="xterm-surface" data-enabled={String(props.enabled)} />;
  },
}));

import { TerminalPane } from "./TerminalPane";

describe("TerminalPane", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    latestProps = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Initial state ─────────────────────────────────────────────

  it("enables the surface immediately for a non-inactive thread", () => {
    render(<TerminalPane threadId="t-1" status="idle" />);
    expect(screen.getByTestId("xterm-surface")).toHaveAttribute("data-enabled", "true");
  });

  it("starts visible (opacity-100) for a non-inactive thread", () => {
    const { container } = render(<TerminalPane threadId="t-1" status="idle" />);
    expect(container.firstElementChild!.className).toContain("opacity-100");
  });

  it("disables the surface for an inactive thread", () => {
    render(<TerminalPane threadId="t-1" status="inactive" />);
    expect(screen.getByTestId("xterm-surface")).toHaveAttribute("data-enabled", "false");
  });

  // ── Reveal sequence (inactive → active) ───────────────────────

  it("enables the surface immediately when transitioning from inactive to active", () => {
    const { rerender } = render(<TerminalPane threadId="t-1" status="inactive" />);
    expect(screen.getByTestId("xterm-surface")).toHaveAttribute("data-enabled", "false");

    rerender(<TerminalPane threadId="t-1" status="launching" />);

    expect(screen.getByTestId("xterm-surface")).toHaveAttribute("data-enabled", "true");
  });

  it("reveals visibility shortly after becoming active", () => {
    const { container, rerender } = render(<TerminalPane threadId="t-1" status="inactive" />);

    rerender(<TerminalPane threadId="t-1" status="launching" />);

    // Still invisible
    expect(container.firstElementChild!.className).toContain("opacity-0");

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(container.firstElementChild!.className).toContain("opacity-100");
  });

  // ── onReset behaviour ─────────────────────────────────────────

  it("keeps the surface enabled after onReset fires", () => {
    render(<TerminalPane threadId="t-1" status="idle" />);
    expect(screen.getByTestId("xterm-surface")).toHaveAttribute("data-enabled", "true");

    // Simulate the thread-reset callback from XTermSurface
    act(() => {
      (latestProps.onReset as () => void)();
    });

    // The surface MUST stay enabled — disposing it creates a gap
    // where supervisor events are lost.
    expect(screen.getByTestId("xterm-surface")).toHaveAttribute("data-enabled", "true");
  });

  it("re-reveals visibility after onReset fires", () => {
    const { container } = render(<TerminalPane threadId="t-1" status="idle" />);
    expect(container.firstElementChild!.className).toContain("opacity-100");

    act(() => {
      (latestProps.onReset as () => void)();
    });

    // Should be invisible after reset
    expect(container.firstElementChild!.className).toContain("opacity-0");

    // After the POST_MOUNT_REVEAL_DELAY_MS (50ms), visibility restores
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(container.firstElementChild!.className).toContain("opacity-100");
  });
});
