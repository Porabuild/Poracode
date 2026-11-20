// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import {
  auxiliaryThreadIds,
  hasOwnWindow,
  setAuxiliaryThreadIds,
  setOwnWindowThreadIds,
  useAuxiliaryThreadWindows,
} from "./auxiliaryThreadWindows";
afterEach(() => {
  setAuxiliaryThreadIds([], []);
  setOwnWindowThreadIds([]);
});
it("keeps a pending disposal hidden when hydration refreshes only live ownership", () => {
  setAuxiliaryThreadIds(["live"], ["live", "disposing"]);
  setAuxiliaryThreadIds(["live"]);
  expect([...auxiliaryThreadIds()]).toEqual(["live"]);
  expect([...useAuxiliaryThreadWindows.getState().hiddenThreadIds]).toEqual(["live", "disposing"]);
  setAuxiliaryThreadIds([], ["disposing"]);
  setAuxiliaryThreadIds([]);
  expect(auxiliaryThreadIds().size).toBe(0);
  expect([...useAuxiliaryThreadWindows.getState().hiddenThreadIds]).toEqual(["disposing"]);
});
it("retains threads in their own window without hiding their sidebar rows", () => {
  setAuxiliaryThreadIds(["side-chat"]);
  setOwnWindowThreadIds(["popped-out"]);
  expect([...auxiliaryThreadIds()]).toEqual(["side-chat", "popped-out"]);
  expect(hasOwnWindow("popped-out")).toBe(true);
  expect(hasOwnWindow("side-chat")).toBe(false);
  const state = useAuxiliaryThreadWindows.getState();
  expect([...state.hiddenThreadIds]).toEqual(["side-chat"]);
  expect([...state.ownWindowThreadIds]).toEqual(["popped-out"]);
  setOwnWindowThreadIds([]);
  expect([...auxiliaryThreadIds()]).toEqual(["side-chat"]);
});
