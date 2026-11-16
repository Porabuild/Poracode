import { useEffect, useRef } from "react";
import { useShallow } from "zustand/shallow";
import { useAppStore } from "@/renderer/state/appStore";
import { startThreadImagePrefetch } from "@/renderer/state/runningThreadImagePrefetch";
import { runningThreadIds } from "./useRunningThreadRuntime";

/**
 * Starts bounded image prefetch for every running thread, including one already
 * on screen (its mounted cards take over at foreground priority), and stops it
 * when the thread leaves the running set.
 */
export function useRunningThreadImagePrefetch(enabled: boolean): void {
  const runningIds = useAppStore(useShallow((state) => runningThreadIds(state.threads)));
  const stops = useRef(new Map<string, () => void>());

  useEffect(() => {
    const wanted = new Set(enabled ? runningIds : []);
    for (const [threadId, stop] of stops.current) {
      if (wanted.has(threadId)) continue;
      stops.current.delete(threadId);
      stop();
    }
    for (const threadId of wanted) {
      if (stops.current.has(threadId)) continue;
      stops.current.set(threadId, startThreadImagePrefetch(threadId));
    }
  }, [enabled, runningIds]);

  useEffect(() => {
    const retained = stops.current;
    return () => {
      for (const stop of retained.values()) stop();
      retained.clear();
    };
  }, []);
}
