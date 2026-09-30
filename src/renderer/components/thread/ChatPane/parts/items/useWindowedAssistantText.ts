import { useEffect, useRef, useState } from "react";
import { inspectPlainStream, MAX_RICH_TEXT_CHARS, plainTextWindow } from "./longPlainText";

/** Keep the full stream in its owning item; pass only the visible page into the body renderer. */
export function useWindowedAssistantText(text: string, isStreaming: boolean) {
  const [inspection, setInspection] = useState(() => inspectPlainStream(text, null, isStreaming));
  const previousRef = useRef(inspection);
  const mountedRef = useRef(false);
  const [fixedEnd, setFixedEnd] = useState<number | null>(null);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const next = inspectPlainStream(text, previousRef.current, isStreaming);
    previousRef.current = next;
    setInspection((current) => (current.plain === next.plain ? current : next));
  }, [text, isStreaming]);

  const isWindowed = inspection.plain || text.length >= MAX_RICH_TEXT_CHARS;
  const window = isWindowed ? plainTextWindow(text, fixedEnd ?? text.length) : null;
  return {
    window,
    isBrowsingEarlier: fixedEnd !== null,
    showEarlier: () => {
      if (window) setFixedEnd(window.start);
    },
    showLatest: () => setFixedEnd(null),
  };
}
