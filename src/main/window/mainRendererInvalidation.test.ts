import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { describe, expect, it } from "vitest";
import { installMainRendererInvalidation } from "./mainRendererInvalidation";

function setup() {
  const contents = new EventEmitter();
  const state = { current: true, ready: true, interests: new Set(["thread-a"]) };
  installMainRendererInvalidation(contents as unknown as Pick<WebContents, "on">, {
    isCurrent: () => state.current,
    invalidate: () => {
      state.ready = false;
      state.interests.clear();
    },
  });
  return { contents, state };
}

describe("main renderer invalidation", () => {
  it("preserves readiness and interests for loading indicators, subframes, and same-document navigation", () => {
    const { contents, state } = setup();
    contents.emit("did-start-loading");
    contents.emit("did-start-navigation", { isMainFrame: false, isSameDocument: false });
    contents.emit("did-start-navigation", { isMainFrame: true, isSameDocument: true });
    expect(state.ready).toBe(true);
    expect([...state.interests]).toEqual(["thread-a"]);
  });

  it("requires a new readiness acknowledgement after a main-frame document navigation", () => {
    const { contents, state } = setup();
    contents.emit("did-start-navigation", { isMainFrame: true, isSameDocument: false });
    expect(state.ready).toBe(false);
    expect(state.interests.size).toBe(0);

    // A newly mounted main renderer acknowledges readiness and registers again.
    state.ready = true;
    state.interests.add("thread-b");
    contents.emit("did-start-navigation", { isMainFrame: false, isSameDocument: false });
    expect(state.ready).toBe(true);
    expect([...state.interests]).toEqual(["thread-b"]);
  });

  it.each(["render-process-gone", "destroyed"])(
    "invalidates the current renderer on %s",
    (event) => {
      const { contents, state } = setup();
      contents.emit(event);
      expect(state.ready).toBe(false);
      expect(state.interests.size).toBe(0);
    },
  );

  it("ignores navigation, crash, and destruction from a retired renderer", () => {
    const { contents, state } = setup();
    state.current = false;
    contents.emit("did-start-navigation", { isMainFrame: true, isSameDocument: false });
    contents.emit("render-process-gone");
    contents.emit("destroyed");
    expect(state.ready).toBe(true);
    expect([...state.interests]).toEqual(["thread-a"]);
  });
});
