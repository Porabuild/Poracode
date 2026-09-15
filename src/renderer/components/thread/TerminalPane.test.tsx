import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    latestProps = {};
  });

  // ── Initial state ─────────────────────────────────────────────

  it("enables the surface immediately for a non-inactive thread", async () => {
    render(<TerminalPane threadId="t-1" status="idle" />);
    expect(await screen.findByTestId("xterm-surface")).toHaveAttribute("data-enabled", "true");
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

  it("keeps opacity-0 during launching (spinner overlay is shown instead)", () => {
    const { container, rerender } = render(<TerminalPane threadId="t-1" status="inactive" />);

    rerender(<TerminalPane threadId="t-1" status="launching" />);

    expect(container.firstElementChild!.className).toContain("opacity-0");
  });

  it("does not hide visibility on reset", () => {
    const { container } = render(<TerminalPane threadId="t-1" status="idle" />);
    expect(container.firstElementChild!.className).toContain("opacity-100");
    expect(latestProps.onReset).toBeUndefined();
    expect(screen.getByTestId("xterm-surface")).toHaveAttribute("data-enabled", "true");
    expect(container.firstElementChild!.className).toContain("opacity-100");
  });
});
