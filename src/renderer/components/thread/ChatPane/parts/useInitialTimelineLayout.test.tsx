import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useInitialTimelineLayout } from "./useInitialTimelineLayout";

it("requires a new layout proof when returning through an empty thread and ignores old visit callbacks", () => {
  const { result, rerender } = renderHook(({ threadId }) => useInitialTimelineLayout(threadId), {
    initialProps: { threadId: "history-a" },
  });
  const firstVisitReady = result.current.markReady;
  act(firstVisitReady);
  expect(result.current.ready).toBe(true);

  rerender({ threadId: "empty-b" });
  expect(result.current.ready).toBe(false);
  const emptyVisitReady = result.current.markReady;
  act(firstVisitReady);
  expect(result.current.ready).toBe(false);

  rerender({ threadId: "history-a" });
  expect(result.current.ready).toBe(false);
  act(() => {
    firstVisitReady();
    emptyVisitReady();
  });
  expect(result.current.ready).toBe(false);
  act(result.current.markReady);
  expect(result.current.ready).toBe(true);
});
