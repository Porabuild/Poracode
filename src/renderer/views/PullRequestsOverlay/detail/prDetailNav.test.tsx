// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { PrDetailNavProvider, usePrDetailNav } from "./prDetailNav";

function setup(resetKey = "review-1") {
  return renderHook(() => usePrDetailNav(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <PrDetailNavProvider resetKey={resetKey}>{children}</PrDetailNavProvider>
    ),
  });
}

describe("PrDetailNavProvider", () => {
  it("opening a file switches to Changes focused on it and leaves any commit scope", () => {
    const { result } = setup();
    act(() => result.current.setCommitScope("abc1234"));

    act(() => result.current.openFile("src/a.ts", 12));

    expect(result.current.tab).toBe("changes");
    expect(result.current.focusedFile).toEqual({ path: "src/a.ts", line: 12 });
    expect(result.current.commitScope).toBeNull();
  });

  it("keeps the old side when opening a review thread", () => {
    const { result } = setup();

    act(() => result.current.openFile("README.md", 1, "LEFT"));

    expect(result.current.tab).toBe("changes");
    expect(result.current.focusedFile).toEqual({ path: "README.md", line: 1, side: "LEFT" });
  });

  it("leaving a tab drops the one-shot file focus", () => {
    const { result } = setup();
    act(() => result.current.openFile("src/a.ts"));

    act(() => result.current.setTab("summary"));
    act(() => result.current.setTab("changes"));

    expect(result.current.focusedFile).toBeNull();
  });

  it("starts over when another review is selected", () => {
    const { result, rerender } = renderHook(() => usePrDetailNav(), {
      initialProps: { key: "review-1" },
      wrapper: ({ children }: { children: ReactNode }) => (
        <PrDetailNavProvider resetKey="review-1">{children}</PrDetailNavProvider>
      ),
    });
    act(() => result.current.openFile("src/a.ts"));
    rerender({ key: "review-1" });
    expect(result.current.tab).toBe("changes");

    const next = setup("review-2");
    expect(next.result.current.tab).toBe("summary");
    expect(next.result.current.focusedFile).toBeNull();
  });
});
