// Volatile native-window ownership, independent of the persisted main panes.
let nativeThreadIds = new Set<string>();
const retainedHere = new Map<string, number>();
export function setAuxiliaryThreadIds(ids: readonly string[]): void {
  nativeThreadIds = new Set(ids);
}
export function retainAuxiliaryThreadId(threadId: string): () => void {
  retainedHere.set(threadId, (retainedHere.get(threadId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = retainedHere.get(threadId) ?? 0;
    if (count <= 1) retainedHere.delete(threadId);
    else retainedHere.set(threadId, count - 1);
  };
}
export function auxiliaryThreadIds(): ReadonlySet<string> {
  return new Set([...nativeThreadIds, ...retainedHere.keys()]);
}
