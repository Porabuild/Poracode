import { useState } from "react";

/** A readiness proof belongs to this visit's virtualizer, never a previous mount. */
export function useInitialTimelineLayout(threadId: string) {
  const [layout, setLayout] = useState(() => ({ threadId, ready: false }));
  if (layout.threadId !== threadId) setLayout({ threadId, ready: false });

  const markReady = () => {
    setLayout((current) => (current === layout ? { ...current, ready: true } : current));
  };
  return { ready: layout.threadId === threadId && layout.ready, markReady };
}
