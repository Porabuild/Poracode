import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverlayShell } from "./OverlayShell";

function surface(container: HTMLElement) {
  return container.querySelector("[data-overlay-surface]")!;
}

async function flushFadeIn() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

describe("OverlayShell", () => {
  it("retains the open content until the exit transition finishes", () => {
    const onExited = vi.fn<() => void>();
    const { container, rerender } = render(
      <OverlayShell open onExited={onExited}>
        <div>GitHub Actions</div>
      </OverlayShell>,
    );

    // The GitHub Actions overlay clears its own context on close, so `open` and
    // `children` drop in the same render — the content must survive the fade.
    rerender(
      <OverlayShell open={false} onExited={onExited}>
        {null}
      </OverlayShell>,
    );

    expect(screen.getByText("GitHub Actions")).toBeInTheDocument();

    fireEvent.transitionEnd(surface(container), { propertyName: "opacity" });

    expect(screen.queryByText("GitHub Actions")).not.toBeInTheDocument();
    expect(onExited).toHaveBeenCalledOnce();

    rerender(
      <OverlayShell open onExited={onExited}>
        <div>GitHub Actions reopened</div>
      </OverlayShell>,
    );

    expect(screen.getByText("GitHub Actions reopened")).toBeInTheDocument();
  });

  it("ignores transitionEnd from content that bubbles up to the surface", async () => {
    const onExited = vi.fn<() => void>();
    const { container, rerender } = render(
      <OverlayShell open onExited={onExited}>
        <div data-testid="content">GitHub Actions</div>
      </OverlayShell>,
    );

    await flushFadeIn();
    rerender(
      <OverlayShell open={false} onExited={onExited}>
        <div data-testid="content">GitHub Actions</div>
      </OverlayShell>,
    );

    // A child's own fade bubbles to the surface — it must not cut the exit short.
    fireEvent.transitionEnd(screen.getByTestId("content"), { propertyName: "opacity" });
    expect(onExited).not.toHaveBeenCalled();
    // Neither may a non-opacity transition on the surface itself.
    fireEvent.transitionEnd(surface(container), { propertyName: "transform" });
    expect(onExited).not.toHaveBeenCalled();

    fireEvent.transitionEnd(surface(container), { propertyName: "opacity" });
    expect(onExited).toHaveBeenCalledOnce();
  });

  it("fades in by default", async () => {
    const { container } = render(
      <OverlayShell open>
        <div>Settings</div>
      </OverlayShell>,
    );

    expect(surface(container).className).toContain("opacity-0");

    await flushFadeIn();

    expect(surface(container).className).toContain("opacity-100");
  });

  it("appears fully opaque with instantEnter, and still fades out", () => {
    const onExited = vi.fn<() => void>();
    const { container, rerender } = render(
      <OverlayShell open instantEnter onExited={onExited}>
        <div>GitHub Actions</div>
      </OverlayShell>,
    );

    // Opaque on the first painted frame — no opacity-0 pass, so no frame
    // composites the overlay against bare desktop material.
    expect(surface(container).className).toContain("opacity-100");
    expect(surface(container).hasAttribute("data-overlay-visible")).toBe(true);

    rerender(
      <OverlayShell open={false} instantEnter onExited={onExited}>
        {null}
      </OverlayShell>,
    );

    expect(surface(container).className).toContain("opacity-0");
    expect(surface(container).className).toContain("pointer-events-none");
    expect(screen.getByText("GitHub Actions")).toBeInTheDocument();

    fireEvent.transitionEnd(surface(container), { propertyName: "opacity" });
    expect(onExited).toHaveBeenCalledOnce();
  });

  it("finishes an exit when the browser omits transitionend", async () => {
    vi.useFakeTimers();
    const onExited = vi.fn<() => void>();
    const { container, rerender } = render(
      <OverlayShell open instantEnter onExited={onExited}>
        <div>Settings</div>
      </OverlayShell>,
    );

    rerender(
      <OverlayShell open={false} instantEnter onExited={onExited}>
        {null}
      </OverlayShell>,
    );
    expect(surface(container)).toHaveClass("pointer-events-none", "opacity-0");

    await act(() => vi.advanceTimersByTimeAsync(200));

    expect(container.querySelector("[data-overlay-surface]")).toBeNull();
    expect(onExited).toHaveBeenCalledOnce();
    void vi.useRealTimers();
  });
});
