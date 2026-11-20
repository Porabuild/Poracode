/**
 * Synchronous notice fired before a thread row is deleted, while its
 * transcript is still readable. The memory service registers the capture
 * spool. A throw must not block the delete.
 */
type MemoryThreadDeleteHook = (threadId: string) => void;

let hook: MemoryThreadDeleteHook | undefined;

export function setMemoryThreadDeleteHook(next: MemoryThreadDeleteHook | undefined): void {
  hook = next;
}

export function notifyMemoryThreadDeleting(threadId: string): void {
  try {
    hook?.(threadId);
  } catch (error) {
    console.error("[memory] pre-delete capture failed:", error);
  }
}
