import { useEffectEvent, useLayoutEffect, useRef, type RefObject } from "react";

/** Observe the actual virtualizer nodes, including content attached after mount. */
export function useChatScrollResizeObserver({
  scrollRef,
  contentRef,
  threadId,
  onResize,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  threadId: string;
  onResize: () => void;
}) {
  const observerRef = useRef<ResizeObserver | null>(null);
  const observedElementsRef = useRef<HTMLDivElement[]>([]);
  const handleResize = useEffectEvent(onResize);

  function observeCurrentElements() {
    const observer = observerRef.current;
    if (!observer) return;
    const elements = [scrollRef.current, contentRef.current].filter(
      (element): element is HTMLDivElement => element !== null,
    );
    for (const element of observedElementsRef.current) {
      if (!elements.includes(element)) observer.unobserve(element);
    }
    for (const element of elements) {
      if (!observedElementsRef.current.includes(element)) observer.observe(element);
    }
    observedElementsRef.current = elements;
  }

  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => handleResize());
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
      observedElementsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- observer lifetime follows the owning thread and ref identities.
  }, [scrollRef, contentRef, threadId]);

  // Ref assignments do not trigger renders. Also check from the structural
  // fallback frame / height notification, after the virtualizer attaches them.
  useLayoutEffect(() => {
    observeCurrentElements();
  });

  return observeCurrentElements;
}
