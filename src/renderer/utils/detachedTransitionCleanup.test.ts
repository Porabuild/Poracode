import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAfterTransition } from "react-aria/private/utils/runAfterTransition";
import { scheduleDetachedTransitionCleanup } from "./detachedTransitionCleanup";

function dispatchTransitionEvent(
  target: EventTarget,
  type: "transitionrun" | "transitionend" | "transitioncancel",
  propertyName: string,
): void {
  const event = new Event(type, { bubbles: type !== "transitioncancel" });
  Object.defineProperty(event, "propertyName", { value: propertyName });
  target.dispatchEvent(event);
}

describe("scheduleDetachedTransitionCleanup", () => {
  let rafQueue: FrameRequestCallback[];
  let originalRaf: typeof globalThis.requestAnimationFrame;

  function flushAnimationFrames(): void {
    const batch = rafQueue.splice(0);
    for (const callback of batch) {
      callback(16);
    }
  }

  beforeEach(() => {
    rafQueue = [];
    originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn<typeof requestAnimationFrame>((callback) => {
      rafQueue.push(callback);
      return rafQueue.length;
    });
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    document.body.innerHTML = "";
  });

  it("purges detached multi-property elements and flushes stranded runAfterTransition callbacks", () => {
    const detached = document.createElement("button");
    document.body.appendChild(detached);

    dispatchTransitionEvent(detached, "transitionrun", "border-top-color");
    dispatchTransitionEvent(detached, "transitionrun", "border-bottom-color");

    const stranded = vi.fn<() => void>();
    runAfterTransition(stranded);
    flushAnimationFrames();
    expect(stranded).not.toHaveBeenCalled();

    // Unmounting cancels only the first property via react-aria's { once: true } listener.
    detached.remove();
    dispatchTransitionEvent(detached, "transitioncancel", "border-top-color");
    expect(stranded).not.toHaveBeenCalled();

    scheduleDetachedTransitionCleanup();
    flushAnimationFrames();

    expect(stranded).toHaveBeenCalledTimes(1);
  });

  it("does not recurse or prematurely flush callbacks while a live connected element is still transitioning", () => {
    const live = document.createElement("div");
    const detached = document.createElement("button");
    document.body.append(live, detached);

    dispatchTransitionEvent(live, "transitionrun", "opacity");
    dispatchTransitionEvent(detached, "transitionrun", "background-color");
    detached.remove();

    const waitingOnLive = vi.fn<() => void>();
    runAfterTransition(waitingOnLive);
    flushAnimationFrames();
    expect(waitingOnLive).not.toHaveBeenCalled();

    // Schedule cleanup across multiple frames while `live` remains in-flight.
    scheduleDetachedTransitionCleanup();
    flushAnimationFrames();
    scheduleDetachedTransitionCleanup();
    flushAnimationFrames();

    // `live` is still transitioning, so callbacks must wait until `live` finishes.
    expect(waitingOnLive).not.toHaveBeenCalled();

    // Completing the live transition must invoke callbacks exactly once without recursion.
    expect(() => {
      dispatchTransitionEvent(live, "transitionend", "opacity");
    }).not.toThrow();
    expect(waitingOnLive).toHaveBeenCalledTimes(1);
  });
});
