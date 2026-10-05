/** Existing caller-visible diagnostic limit, in UTF-16 code units. */
export const ONE_SHOT_STDERR_TAIL_CHARS = 2_000;
/** Compact tiny writes in batches; this is a storage bound, not exposed output. */
export const ONE_SHOT_STDERR_PENDING_CHARS = 32_768;

/**
 * At most 2,000 suffix code units plus fewer than 32,768 pending decoded units
 * and at most 32,768 fragments after append returns. Large chunks never stay
 * referenced. Batches join only the fragments needed for the diagnostic suffix;
 * obsolete prefixes and the old suffix need no flattening. Each batch clears
 * its fragment array instead of keeping a spliced backing store.
 * These are logical bounds, not heap/native-memory limits (including Buffer pools).
 * Stdout/full-output evidence has a separate owner and is never truncated here.
 */
export class OneShotStderrTail {
  private text = "";
  private readonly pending: string[] = [];
  private pendingLength = 0;

  get retainedCodeUnits(): number {
    return Math.min(ONE_SHOT_STDERR_TAIL_CHARS, this.text.length + this.pendingLength);
  }

  get retainedSourceCodeUnits(): number {
    return this.text.length + this.pendingLength;
  }

  get retainedFragments(): number {
    return this.pending.length + (this.text ? 1 : 0);
  }

  append(data: Buffer): void {
    const chunk = data.toString();
    if (!chunk) return;
    if (chunk.length >= ONE_SHOT_STDERR_PENDING_CHARS) {
      this.pending.length = 0;
      this.pendingLength = 0;
      this.text = copySuffix(chunk);
      return;
    }
    this.pending.push(chunk);
    this.pendingLength += chunk.length;
    if (this.pendingLength >= ONE_SHOT_STDERR_PENDING_CHARS) {
      this.text = copySuffix(joinSuffix(this.pending));
      this.pending.length = 0;
      this.pendingLength = 0;
    }
  }

  consume(): string {
    const text = (this.text + this.pending.join("")).slice(-ONE_SHOT_STDERR_TAIL_CHARS).trim();
    this.text = "";
    this.pending.length = 0;
    this.pendingLength = 0;
    return text;
  }
}

/** Called only when pending input alone exceeds the visible diagnostic limit. */
function joinSuffix(chunks: readonly string[]): string {
  let start = chunks.length;
  let length = 0;
  while (length < ONE_SHOT_STDERR_TAIL_CHARS) length += chunks[--start]!.length;
  return chunks.slice(start).join("");
}

function copySuffix(text: string): string {
  // Own the suffix: a V8 substring can otherwise pin an oversized decode.
  // UTF-16 preserves lone surrogates at the released reader's slice boundary.
  return Buffer.from(text.slice(-ONE_SHOT_STDERR_TAIL_CHARS), "utf16le").toString("utf16le");
}
