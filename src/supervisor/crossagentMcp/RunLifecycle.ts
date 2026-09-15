export type RunLifecycleEvent = "changed" | "closed";

/** Internal notifications for queued work; never injects a parent model message. */
export class RunLifecycle {
  private readonly listeners = new Map<string, Set<(event: RunLifecycleEvent) => void>>();

  subscribe(parentId: string, listener: (event: RunLifecycleEvent) => void): () => void {
    const listeners = this.listeners.get(parentId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(parentId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(parentId);
    };
  }

  emit(parentId: string, event: RunLifecycleEvent): void {
    for (const listener of [...(this.listeners.get(parentId) ?? [])]) listener(event);
    if (event === "closed") this.listeners.delete(parentId);
  }
}
