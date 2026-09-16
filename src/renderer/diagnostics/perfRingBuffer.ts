/**
 * Count-capped FIFO ring with drop-oldest eviction for renderer performance
 * evidence. The ring exists so a diagnostics consumer can never grow memory
 * with the traffic it observes: once `capacity` records are retained, every
 * insertion drops the oldest record instead of resizing. The number of
 * silently dropped records is tracked so a snapshot can state its own loss
 * instead of implying completeness.
 */
export class PerfRingBuffer<T> {
  private readonly records: T[] = [];
  private dropped = 0;

  constructor(private readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw new Error("PerfRingBuffer capacity must be a positive integer.");
  }

  push(record: T): void {
    if (this.records.length >= this.capacity) {
      this.records.shift();
      this.dropped += 1;
    }
    this.records.push(record);
  }

  /** Oldest-to-newest snapshot of the retained records. */
  toArray(): T[] {
    return [...this.records];
  }

  get size(): number {
    return this.records.length;
  }

  /** Records evicted by the capacity bound since construction. */
  get droppedCount(): number {
    return this.dropped;
  }

  clear(): void {
    this.records.length = 0;
  }
}
