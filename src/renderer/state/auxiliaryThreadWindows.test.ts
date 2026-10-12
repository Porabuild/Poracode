// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import {
  auxiliaryThreadIds,
  setAuxiliaryThreadIds,
  useAuxiliaryThreadWindows,
} from "./auxiliaryThreadWindows";
afterEach(() => setAuxiliaryThreadIds([], []));
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
