import { useContext, useEffect, useRef, useState } from "react";
import type { EnvironmentImagePriority } from "@/shared/remote/clientEnvironmentImages";
import { PaneVisibility } from "@/renderer/paneVisibility";

const listeners = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;

function observeImage(element: Element, listener: (visible: boolean) => void): () => void {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
    },
    { rootMargin: "256px" },
  );
  listeners.set(element, listener);
  observer.observe(element);
  return () => {
    listeners.delete(element);
    observer?.unobserve(element);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = undefined;
    }
  };
}

/**
 * Virtual rows can remain mounted well outside the scroll viewport. Only the
 * visible cards hold foreground cache demand; the rest can be evicted safely.
 * One observer covers all cards and disappears when the last card unmounts.
 */
export function useImageViewportPriority(enabled: boolean) {
  const elementRef = useRef<HTMLElement | null>(null);
  const observation = useRef<{ element: HTMLElement; unsubscribe: () => void } | null>(null);
  const [visible, setVisible] = useState(false);
  const paneVisible = useContext(PaneVisibility);
  const canObserve = typeof IntersectionObserver === "function";
  const viewportRef = (element: HTMLElement | null) => {
    elementRef.current = element;
  };
  const onVisibilityChange = (nextVisible: boolean) => setVisible(nextVisible);
  // A loaded attachment can replace its skeleton node. Check the committed
  // root without recreating the observer for ordinary readiness renders.
  useEffect(() => {
    const element = enabled && canObserve ? elementRef.current : null;
    if ((observation.current?.element ?? null) === element) return;
    observation.current?.unsubscribe();
    observation.current = element
      ? { element, unsubscribe: observeImage(element, onVisibilityChange) }
      : null;
  });
  useEffect(
    () => () => {
      observation.current?.unsubscribe();
      observation.current = null;
    },
    [],
  );
  const priority: EnvironmentImagePriority =
    enabled && paneVisible && (!canObserve || visible) ? "foreground" : "background";
  return { viewportRef, priority };
}
