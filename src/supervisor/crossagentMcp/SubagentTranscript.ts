interface OutputSegment {
  position: number;
  text: string;
  cursorRanges: Array<{ start: number; end: number }>;
}

interface CursorOutputEdit {
  key: string;
  start: number;
  end: number;
  replacement: string;
}

/**
 * Current-attempt display bookkeeping plus run-wide append-only cursor evidence.
 * Deltas append in arrival order; authoritative updates project item order.
 * Item indexes and raw ranges are needed only until the attempt/run ends.
 */
export class SubagentTranscript {
  private segments: OutputSegment[] = [];
  private readonly segmentsByItem = new Map<string, OutputSegment>();
  private displayOutput = "";
  private displayDirty = false;
  private projectionSegmentCount = 0;
  private readonly projectionSnapshots = new Map<OutputSegment, string>();
  private displayTail = "";
  private cursorText = "";
  private completedEdits: CursorOutputEdit[] = [];
  private readonly editsByItem = new Map<string, CursorOutputEdit[]>();
  private cursorEdits: CursorOutputEdit[] = [];
  private editsDirty = false;

  get output(): string {
    if (this.displayDirty) {
      const parts: string[] = [];
      for (let index = 0; index < this.projectionSegmentCount; index += 1) {
        const segment = this.segments[index]!;
        parts.push(this.projectionSnapshots.get(segment) ?? segment.text);
      }
      this.displayOutput = parts.join("") + this.displayTail;
      this.projectionSnapshots.clear();
      this.displayTail = "";
      this.displayDirty = false;
    }
    return this.displayOutput;
  }

  get cursorOutput(): string {
    return this.cursorText;
  }

  get cursorOutputEdits(): CursorOutputEdit[] {
    if (this.editsDirty) {
      const edits = this.completedEdits.slice();
      for (const ranges of this.editsByItem.values()) {
        for (const edit of ranges) edits.push(edit);
      }
      this.cursorEdits = edits;
      this.editsDirty = false;
    }
    return this.cursorEdits;
  }

  append(itemId: string, delta: string): void {
    const cursorStart = this.cursorText.length;
    this.cursorText += delta;
    const segment = this.segmentsByItem.get(itemId);
    if (segment) {
      // Preserve the item projection as of the last authoritative update.
      // Later deltas belong at the display tail, even when an old id recurs.
      if (
        this.displayDirty &&
        segment.position < this.projectionSegmentCount &&
        !this.projectionSnapshots.has(segment)
      ) {
        this.projectionSnapshots.set(segment, segment.text);
      }
      segment.text += delta;
      const lastRange = segment.cursorRanges.at(-1);
      if (lastRange?.end === cursorStart) lastRange.end += delta.length;
      else segment.cursorRanges.push({ start: cursorStart, end: cursorStart + delta.length });
    } else {
      this.addSegment(itemId, delta, [{ start: cursorStart, end: cursorStart + delta.length }]);
    }
    if (this.displayDirty) this.displayTail += delta;
    else this.displayOutput += delta;
  }

  replace(itemId: string, text: string, attemptIndex: number): void {
    const segment = this.segmentsByItem.get(itemId);
    if (segment) {
      // Superseded raw segment text is never read again; the cursor keeps the
      // original stream independently, and later appends extend this display.
      segment.text = text;
      const key = `${attemptIndex}:${itemId}`;
      // Reinsert to preserve the released edit order, including equal starts.
      this.editsByItem.delete(key);
      this.editsByItem.set(
        key,
        segment.cursorRanges.map((range) => ({ key, ...range, replacement: text })),
      );
      this.cursorEdits = this.completedEdits;
      this.editsDirty = true;
    } else {
      this.addSegment(itemId, text, []);
    }
    this.displayDirty = true;
    this.projectionSegmentCount = this.segments.length;
    this.projectionSnapshots.clear();
    this.displayTail = "";
    this.displayOutput = "";
  }

  /** Compact reports need item starts, independently of arrival-order output. */
  displayMessages(): string[] {
    return this.segments.map((segment) => segment.text);
  }

  /** Freeze prior-attempt cursor corrections before reusing child item ids. */
  resetAttempt(): void {
    this.releaseSegments("");
  }

  /** Call only after the terminal guard, report parsing and final projection. */
  releaseSegments(finalOutput: string): void {
    this.completedEdits = this.cursorOutputEdits;
    this.editsByItem.clear();
    this.segments = [];
    this.segmentsByItem.clear();
    this.projectionSnapshots.clear();
    this.projectionSegmentCount = 0;
    this.displayDirty = false;
    this.displayTail = "";
    this.displayOutput = finalOutput;
  }

  private addSegment(
    itemId: string,
    text: string,
    cursorRanges: OutputSegment["cursorRanges"],
  ): void {
    const segment = { position: this.segments.length, text, cursorRanges };
    this.segments.push(segment);
    this.segmentsByItem.set(itemId, segment);
  }
}
