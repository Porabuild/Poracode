import { open, type FileHandle } from "node:fs/promises";

const MAX_RECORD_BYTES = 16_384;
const FINAL_RECORD_RESERVE = 4_096;
const MAX_PENDING_RECORDS = 4;

interface EvidenceFile {
  writeFile: FileHandle["writeFile"];
  close(): Promise<void>;
}

export interface PerformanceWriterStats {
  acceptedRecords: number;
  writtenRecords: number;
  writtenBytes: number;
  droppedRecords: number;
  budgetExceeded: boolean;
  error: "open" | "write" | "close" | null;
}

/** One append at a time, four pending records, bounded disk usage; no synchronous filesystem work. */
export class PerformanceEvidenceWriter {
  private readonly file: Promise<EvidenceFile | null>;
  private readonly maxBytes: number;
  private readonly queue: string[] = [];
  private queuedBytes = 0;
  private writing: Promise<void> | null = null;
  private closing = false;
  private completion: Promise<PerformanceWriterStats> | null = null;
  private readonly state: PerformanceWriterStats = {
    acceptedRecords: 0,
    writtenRecords: 0,
    writtenBytes: 0,
    droppedRecords: 0,
    budgetExceeded: false,
    error: null,
  };

  constructor(
    path: string,
    maxBytes: number,
    openFile: () => Promise<EvidenceFile> = () => open(path, "wx", 0o600),
  ) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < MAX_RECORD_BYTES + FINAL_RECORD_RESERVE)
      throw new Error("Performance evidence file budget is too small.");
    this.maxBytes = maxBytes;
    this.file = openFile().catch(() => {
      this.state.error = "open";
      return null;
    });
  }

  append(record: unknown): boolean {
    if (this.closing) return false;
    const line = `${JSON.stringify(record)}\n`;
    const bytes = Buffer.byteLength(line);
    if (this.state.error || bytes > MAX_RECORD_BYTES || this.queue.length >= MAX_PENDING_RECORDS) {
      this.state.droppedRecords += 1;
      return false;
    }
    if (this.state.writtenBytes + this.queuedBytes + bytes > this.maxBytes - FINAL_RECORD_RESERVE) {
      this.state.budgetExceeded = true;
      this.state.droppedRecords += 1;
      return false;
    }
    this.queue.push(line);
    this.queuedBytes += bytes;
    this.state.acceptedRecords += 1;
    this.pump();
    return true;
  }

  stats(): PerformanceWriterStats {
    return { ...this.state };
  }

  finish(reason: "shutdown" | "budget" | "error"): Promise<PerformanceWriterStats> {
    if (this.completion) return this.completion;
    this.closing = true;
    this.completion = this.close(reason);
    return this.completion;
  }

  private pump(): void {
    if (this.writing) return;
    this.writing = this.drain().finally(() => {
      this.writing = null;
      if (this.queue.length && !this.state.error) this.pump();
    });
  }

  private async drain(): Promise<void> {
    const file = await this.file;
    if (!file) return;
    while (this.queue.length && !this.state.error) {
      const line = this.queue[0]!;
      try {
        await file.writeFile(line, "utf8");
        this.state.writtenRecords += 1;
        this.state.writtenBytes += Buffer.byteLength(line);
      } catch {
        this.state.error = "write";
      }
      this.queue.shift();
      this.queuedBytes -= Buffer.byteLength(line);
    }
  }

  private async close(reason: "shutdown" | "budget" | "error"): Promise<PerformanceWriterStats> {
    while (this.writing) await this.writing;
    const file = await this.file;
    if (file) {
      try {
        if (!this.state.error) {
          const final = `${JSON.stringify({
            kind: "end",
            reason,
            complete: reason === "shutdown" && this.state.droppedRecords === 0,
            beforeFinal: this.stats(),
          })}\n`;
          await file.writeFile(final, "utf8");
          this.state.writtenBytes += Buffer.byteLength(final);
        }
      } catch {
        this.state.error = "write";
      } finally {
        await file.close().catch(() => {
          this.state.error ??= "close";
        });
      }
    }
    this.queue.length = 0;
    this.queuedBytes = 0;
    return this.stats();
  }
}
