import { act } from "@testing-library/react";
import { expect } from "vitest";
import { useEffect } from "react";
import { useDragDropManager } from "@dnd-kit/react";

// jsdom (as configured by vitest) has no requestAnimationFrame; the dnd-kit
// accessibility plugin defers its attribute writes through an rAF scheduler.
if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0)) as unknown as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => {
    clearTimeout(id);
  }) as unknown as typeof cancelAnimationFrame;
}

// jsdom also has no Web Animations API; dnd-kit finishes running animations on
// a drag start. There are none under jsdom, so an empty list is accurate.
if (typeof document.getAnimations !== "function") {
  document.getAnimations = () => [];
  Element.prototype.getAnimations = () => [];
}

// dnd-kit's scroller detection observes scroll ancestors on drag start.
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

// Hit-testing during a drag has no layout to consult under jsdom.
if (typeof document.elementFromPoint !== "function") {
  document.elementFromPoint = () => null;
}

/** Runs a few animation frames inside act so dnd-kit's scheduled writes land. */
export async function settleDndAttributes() {
  for (let frame = 0; frame < 3; frame += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

/** Attributes only dnd-kit's accessibility plugin writes onto a drag activator. */
const DND_SIGNATURE_SELECTOR = [
  '[aria-roledescription="draggable"]',
  '[aria-describedby^="dnd-kit"]',
  "[aria-grabbed]",
].join(", ");

export function queryDndActivatorArtifacts(scope: Element): Element[] {
  // The HeroUI tooltip trigger around the pane title is its own `role="button"`
  // element — pre-existing app chrome, not a dnd-kit activator.
  return Array.from(scope.querySelectorAll(DND_SIGNATURE_SELECTOR)).filter(
    (element) => !element.closest('[data-slot="tooltip-trigger"]'),
  );
}

/**
 * The live-Chrome defect the pane suites guard: the whole pane used to be one
 * `role="button" aria-disabled="true"`, so assistive tech reported every
 * control — the composer included — as unusable. Assert no interactive element
 * still sits inside such an ancestor.
 */
export function expectNoDisabledDraggableAncestor(scope: Element) {
  for (const interactive of scope.querySelectorAll('[role="textbox"], button, input, textarea')) {
    expect(interactive.closest('[role="button"][aria-disabled="true"]')).toBeNull();
  }
}

/**
 * Reads a pane's droppable registration from the live manager registry so the
 * tests assert real registration state, not DOM guessing. The pane must stay
 * an attached drop target in every layout state — dropping a sidebar thread
 * onto a lone pane is a supported interaction. dnd-kit registers entities in a
 * microtask, so tests poll the snapshot after settling.
 */
export function PaneDropRegistryProbe(props: {
  paneId: string;
  snapshotRef: { current: () => string | null };
}) {
  const manager = useDragDropManager();
  const snapshotRef = props.snapshotRef;
  useEffect(() => {
    snapshotRef.current = () => {
      const droppable = Array.from(manager?.registry.droppables.value ?? []).find(
        (entry) => String(entry.id) === `pane-drop:${props.paneId}`,
      );
      return droppable ? (droppable.element ? "attached" : "detached") : null;
    };
    return () => {
      snapshotRef.current = () => null;
    };
  });
  return null;
}
