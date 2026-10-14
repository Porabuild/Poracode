import { createEvent } from "@testing-library/react";

/** Model native press/replay identity without relying on jsdom's coarse clock. */
export function keyDownAt(target: HTMLElement, init: KeyboardEventInit, timeStamp: number): Event {
  const event = createEvent.keyDown(target, init);
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  return event;
}
