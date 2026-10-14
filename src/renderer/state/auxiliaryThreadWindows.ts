import { create } from "zustand";

// Volatile native-window ownership, independent of the persisted main panes.
let nativeThreadIds = new Set<string>();
let nativeHiddenIds = new Set<string>();
const retainedHere = new Map<string, number>();
export const useAuxiliaryThreadWindows = create<{
  threadIds: ReadonlySet<string>;
  hiddenThreadIds: ReadonlySet<string>;
}>(() => ({
  threadIds: new Set(),
  hiddenThreadIds: new Set(),
}));
function publish() {
  useAuxiliaryThreadWindows.setState({
    threadIds: auxiliaryThreadIds(),
    hiddenThreadIds: new Set([...nativeHiddenIds, ...retainedHere.keys()]),
  });
}
export function setAuxiliaryThreadIds(ids: readonly string[], hiddenIds?: readonly string[]): void {
  // Hydration reads live retention separately; preserve pending-disposal hiding.
  nativeHiddenIds = new Set(
    hiddenIds ?? [...ids, ...[...nativeHiddenIds].filter((id) => !nativeThreadIds.has(id))],
  );
  nativeThreadIds = new Set(ids);
  publish();
}
export function retainAuxiliaryThreadId(threadId: string): () => void {
  retainedHere.set(threadId, (retainedHere.get(threadId) ?? 0) + 1);
  publish();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = retainedHere.get(threadId) ?? 0;
    if (count <= 1) retainedHere.delete(threadId);
    else retainedHere.set(threadId, count - 1);
    publish();
  };
}
export function auxiliaryThreadIds(): ReadonlySet<string> {
  return new Set([...nativeThreadIds, ...retainedHere.keys()]);
}
