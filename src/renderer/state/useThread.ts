import { useShallow } from "zustand/shallow";
import { useAppStore } from "./appStore";

/**
 * Subscribe to a single thread by ID.
 *
 * The appStore's `updateThreadRuntime` preserves object identity for threads
 * that were not modified, so Zustand's default `Object.is` check will skip
 * re-renders for components whose thread did not change.
 */
export function useThread(threadId: string | undefined) {
  return useAppStore((s) => (threadId ? s.threads.find((t) => t.id === threadId) : undefined));
}

/**
 * Subscribe to the ordered list of thread IDs.
 *
 * Uses `useShallow` so the selector only triggers a re-render when threads
 * are added, removed, or reordered — not when an existing thread's status
 * changes.
 */
export function useThreadIds() {
  return useAppStore(useShallow((s) => s.threads.map((t) => t.id)));
}
