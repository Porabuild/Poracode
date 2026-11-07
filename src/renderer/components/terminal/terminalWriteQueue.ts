import type { Terminal } from "@xterm/xterm";

export const MAX_TERMINAL_WRITE_BUFFER_UNITS = 1_000_000;
const TERMINAL_WRITE_BATCH_UNITS = 65_536;

/** Bounds live output, including UTF-16 units already submitted to xterm's async parser. */
export class TerminalWriteQueue {
  private chunks: string[] = [];
  private queuedUnits = 0;
  private pendingUnits = 0;
  private inFlight = 0;
  private stopped = false;

  constructor(private readonly terminal: Pick<Terminal, "write">) {}

  get idle(): boolean {
    return this.pendingUnits === 0;
  }

  get disposed(): boolean {
    return this.stopped;
  }

  /** False requires an authoritative resnapshot; never append a partial suffix. */
  write(data: string): boolean {
    if (this.stopped) return false;
    if (this.pendingUnits + data.length > MAX_TERMINAL_WRITE_BUFFER_UNITS) return false;
    if (data.length === 0) return true;
    this.chunks.push(data);
    this.queuedUnits += data.length;
    this.pendingUnits += data.length;
    this.pump();
    return true;
  }

  /** Put accepted output ahead of a replay barrier or exit notification. */
  flush(): void {
    if (this.stopped) return;
    while (this.queuedUnits > 0) this.submit(this.takeBatch());
  }

  /** In-flight writes still drain before the caller's xterm reset barrier. */
  clear(): void {
    this.pendingUnits -= this.queuedUnits;
    this.queuedUnits = 0;
    this.chunks = [];
  }

  dispose(): void {
    this.stopped = true;
    this.clear();
  }

  private pump(): void {
    if (this.stopped || this.inFlight > 0 || this.queuedUnits === 0) return;
    this.submit(this.takeBatch());
  }

  private takeBatch(): string {
    const parts: string[] = [];
    let units = 0;
    let consumed = 0;
    while (consumed < this.chunks.length && units < TERMINAL_WRITE_BATCH_UNITS) {
      const chunk = this.chunks[consumed]!;
      const remaining = TERMINAL_WRITE_BATCH_UNITS - units;
      if (chunk.length <= remaining) {
        parts.push(chunk);
        units += chunk.length;
        consumed += 1;
      } else {
        parts.push(chunk.slice(0, remaining));
        this.chunks[consumed] = chunk.slice(remaining);
        units += remaining;
      }
    }
    this.chunks.splice(0, consumed);
    this.queuedUnits -= units;
    return parts.join("");
  }

  private submit(data: string): void {
    this.inFlight += 1;
    this.terminal.write(data, () => {
      this.pendingUnits -= data.length;
      this.inFlight -= 1;
      if (!this.stopped && this.inFlight === 0 && this.queuedUnits > 0) {
        queueMicrotask(() => this.pump());
      }
    });
  }
}
