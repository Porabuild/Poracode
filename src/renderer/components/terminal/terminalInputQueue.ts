export const MAX_TERMINAL_INPUT_UNITS = 64 * 1024;

/** One acknowledged write at a time; shell input must never be retried. */
export class TerminalInputQueue {
  private pending = "";
  private bufferedUnits = 0;
  private writing = false;
  private failed = false;
  private disposed = false;
  private errorReported = false;
  private epoch = 0;
  private drainCompletion: Promise<void> | null = null;
  private previousWrite: Promise<void> | null = null;

  constructor(
    private readonly write: (data: string) => Promise<void>,
    private readonly isCurrent: () => boolean,
    private readonly onError: () => void,
  ) {}

  get pendingWrite(): Promise<void> | null {
    return this.drainCompletion ?? this.previousWrite;
  }

  waitFor(previous: TerminalInputQueue): void {
    this.previousWrite = previous.pendingWrite;
  }

  enqueue(data: string): boolean {
    if (this.disposed || !data) return false;
    if (this.failed) {
      this.reportError();
      return true;
    }
    if (!this.isCurrent() || this.bufferedUnits + data.length > MAX_TERMINAL_INPUT_UNITS) {
      this.stop();
      return true;
    }
    this.pending += data;
    this.bufferedUnits += data.length;
    if (!this.writing) {
      const completion = this.drain();
      this.drainCompletion = completion;
      void completion.then(() => {
        if (this.drainCompletion === completion) this.drainCompletion = null;
      });
    }
    return true;
  }

  stop(report = true): void {
    if (this.disposed || this.failed || (!report && this.bufferedUnits === 0)) return;
    this.failed = true;
    this.pending = "";
    if (report || this.bufferedUnits > 0) this.reportError();
  }

  reset(): void {
    this.epoch += 1;
    this.pending = "";
    this.bufferedUnits = 0;
    this.failed = false;
    this.disposed = false;
    this.errorReported = false;
  }

  dispose(): void {
    this.disposed = true;
    this.pending = "";
  }

  private reportError(): void {
    if (this.errorReported) return;
    this.errorReported = true;
    this.onError();
  }

  private async drain(): Promise<void> {
    this.writing = true;
    try {
      if (this.previousWrite) {
        await this.previousWrite;
        this.previousWrite = null;
      }
      while (!this.disposed && !this.failed && this.pending) {
        if (!this.isCurrent()) {
          this.stop();
          break;
        }
        const data = this.pending;
        const epoch = this.epoch;
        this.pending = "";
        try {
          await this.write(data);
        } catch {
          // A lost response may still mean the PTY consumed these bytes.
          if (epoch === this.epoch) this.stop();
        } finally {
          if (epoch === this.epoch) this.bufferedUnits -= data.length;
        }
      }
    } finally {
      this.writing = false;
    }
  }
}

const queues = new Map<string, TerminalInputQueue>();

export function registerTerminalInputQueue(id: string, queue: TerminalInputQueue): () => void {
  const previous = queues.get(id);
  if (previous) queue.waitFor(previous);
  queues.set(id, queue);
  return () => {
    queue.dispose();
    const clear = () => {
      if (queues.get(id) === queue) queues.delete(id);
    };
    // Keep only the acknowledgement barrier across a surface handoff; dispose
    // already discarded its unsent input and detached its error reporting.
    if (queue.pendingWrite) void queue.pendingWrite.then(clear);
    else clear();
  };
}

/** Accessory keys share the mounted xterm's queue and lifetime. */
export function sendTerminalInput(id: string, data: string): boolean {
  return queues.get(id)?.enqueue(data) ?? false;
}
