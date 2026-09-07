import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useTwoRafReady } from "./useTwoRafReady";

afterEach(() => vi.unstubAllGlobals());

it("cancels pending frames and waits two fresh frames when reopened", () => {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  const frame = () => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    act(() => pending.forEach((callback) => callback(0)));
  };
  const { result, rerender } = renderHook(({ active }) => useTwoRafReady(active), {
    initialProps: { active: true },
  });
  frame();
  expect(result.current).toBe(false);
  rerender({ active: false });
  expect(callbacks.size).toBe(0);
  rerender({ active: true });
  frame();
  expect(result.current).toBe(false);
  frame();
  expect(result.current).toBe(true);
  rerender({ active: false });
  expect(result.current).toBe(false);
  rerender({ active: true });
  expect(result.current).toBe(false);
});
