import { TerminalColumnHistory, type TerminalColumnChange } from "./terminalColumnHistory";

export class TranscriptBuffer {
  private readonly chunks: string[] = [];
  private totalLength = 0;
  private columnHistory?: TerminalColumnHistory;

  constructor(private readonly maxLength: number) {}

  append(chunk: string, columnChange?: TerminalColumnChange): void {
    if (!chunk) return;
    if (columnChange && (this.columnHistory || columnChange.columns !== null)) {
      const { fromCursor, columns } = columnChange;
      this.columnHistory ??= new TerminalColumnHistory();
      this.columnHistory.record(fromCursor, fromCursor + chunk.length, columns);
    }
    this.chunks.push(chunk);
    this.totalLength += chunk.length;
    this.trim();
  }

  readColumnChanges(fromCursor: number, toCursor: number): TerminalColumnChange[] | undefined {
    const changes = this.columnHistory?.snapshot(fromCursor, toCursor);
    return changes?.some(({ columns }) => columns !== null) ? changes : undefined;
  }

  readTail(limit: number): string {
    if (limit <= 0 || this.totalLength === 0) return "";
    if (limit >= this.totalLength) return this.chunks.join("");

    let remaining = limit;
    const selected: string[] = [];
    for (let index = this.chunks.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const chunk = this.chunks[index]!;
      if (chunk.length <= remaining) {
        selected.push(chunk);
        remaining -= chunk.length;
      } else {
        selected.push(chunk.slice(chunk.length - remaining));
        remaining = 0;
      }
    }
    return selected.reverse().join("");
  }

  private trim(): void {
    while (this.totalLength > this.maxLength && this.chunks.length > 0) {
      const first = this.chunks[0]!;
      const overflow = this.totalLength - this.maxLength;
      if (first.length <= overflow) {
        this.chunks.shift();
        this.totalLength -= first.length;
      } else {
        this.chunks[0] = first.slice(overflow);
        this.totalLength -= overflow;
      }
    }
  }
}
