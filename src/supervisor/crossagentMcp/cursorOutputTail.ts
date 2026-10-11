interface CursorOutputEdit {
  start: number;
  end: number;
  key: string;
  replacement: string;
}

interface StringSpan {
  text: string;
  start: number;
  end: number;
  next?: StringSpan;
}

/**
 * Project the corrected suffix without materializing its discarded prefix.
 * `totalChars` counts the complete corrected suffix, while `tail` contains at
 * most `maxChars` UTF-16 units. Exceptional numeric inputs use the legacy reader.
 */
export function cursorOutputTail(
  raw: string,
  edits: readonly CursorOutputEdit[],
  requestedOffset: number,
  maxChars: number,
): { tail: string; totalChars: number } | undefined {
  if (
    !Number.isInteger(requestedOffset) ||
    !Number.isInteger(maxChars) ||
    maxChars <= 0 ||
    edits.some(
      (edit) =>
        !Number.isInteger(edit.start) ||
        !Number.isInteger(edit.end) ||
        edit.start < 0 ||
        edit.start > edit.end ||
        edit.end > raw.length,
    )
  ) {
    return undefined;
  }

  const offset = Math.min(Math.max(0, requestedOffset), raw.length);
  if (offset === raw.length) return { tail: "", totalChars: 0 };
  if (edits.length === 0) {
    return {
      tail: raw.slice(Math.max(offset, raw.length - maxChars)),
      totalChars: raw.length - offset,
    };
  }

  let head: StringSpan | undefined;
  let tail: StringSpan | undefined;
  let retainedChars = 0;
  let totalChars = 0;

  function appendSpan(text: string, start = 0, end = text.length): void {
    const length = end - start;
    totalChars += length;
    if (length === 0) return;
    if (length >= maxChars) {
      head = tail = { text, start: end - maxChars, end };
      retainedChars = maxChars;
      return;
    }
    const next: StringSpan = { text, start, end };
    if (tail) tail.next = next;
    else head = next;
    tail = next;
    retainedChars += length;
    while (head && retainedChars > maxChars) {
      const dropped = Math.min(retainedChars - maxChars, head.end - head.start);
      head.start += dropped;
      retainedChars -= dropped;
      if (head.start === head.end) head = head.next;
    }
  }

  let position = offset;
  const emitted = new Set<string>();
  // Preserve stable tied starts and the first qualifying replacement per key,
  // including empty replacements. A reverse walk changes those semantics.
  for (const edit of [...edits].sort((left, right) => left.start - right.start)) {
    if (edit.end <= position) continue;
    if (edit.start > position) appendSpan(raw, position, edit.start);
    if (!emitted.has(edit.key)) {
      appendSpan(edit.replacement);
      emitted.add(edit.key);
    }
    position = Math.max(position, edit.end);
  }
  appendSpan(raw, position);

  // The deque holds suffix_maxChars of every logically appended span. Only
  // these retained spans are sliced or joined; their total length is bounded.
  const parts: string[] = [];
  for (let span = head; span; span = span.next) {
    parts.push(span.text.slice(span.start, span.end));
  }
  return { tail: parts.join(""), totalChars };
}
