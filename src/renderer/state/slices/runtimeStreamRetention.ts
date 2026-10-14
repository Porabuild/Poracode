import { HEAD_CHARS, TAIL_CHARS, elisionNotice } from "@/shared/runtimeStreamRetentionPolicy";

/**
 * Host history is an opaque string. Its one generated elision notice lies
 * entirely after at most HEAD_CHARS + 1 source units, an optional newline,
 * and before this allowance ends (including any finite JS number's spelling).
 * Protect that whole prefix without parsing notice-looking provider text.
 */
export const HYDRATED_STREAM_HEAD_CHARS = HEAD_CHARS + 128;

/**
 * Item-owned, session-local offsets into the accompanying projected string.
 * Never serialize this metadata or the local projection back into history.
 * No source strings are retained here, including through helper closures.
 */
export interface RuntimeStreamRetention {
  readonly headLimit: number;
  /** Source prefix length; zero until a local gap exists. */
  readonly headChars: number;
  /** Start of the retained source suffix after the local notice. */
  readonly tailStart: number;
  /** Only source units removed by this projection, excluding every notice. */
  readonly elidedChars: number;
  /** Item-local replacement epoch, including unelided replacements; absence means zero. */
  readonly replacementRevision?: number;
}

export interface RetainedRuntimeStream {
  readonly text: string;
  readonly retention?: RuntimeStreamRetention;
}

function result(text: string, retention?: RuntimeStreamRetention): RetainedRuntimeStream {
  return { text, ...(retention ? { retention } : {}) };
}

function charCodeAtAppend(text: string, delta: string, offset: number): number {
  return offset < text.length ? text.charCodeAt(offset) : delta.charCodeAt(offset - text.length);
}

/** Check across the delta boundary too: either half may have arrived alone. */
function splitsSurrogate(text: string, delta: string, offset: number): boolean {
  const before = charCodeAtAppend(text, delta, offset - 1);
  const after = charCodeAtAppend(text, delta, offset);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

/** Select a bounded range without ever concatenating an enormous input first. */
function sliceAppend(text: string, delta: string, start: number, end: number): string {
  if (end <= text.length) return text.slice(start, end);
  if (start >= text.length) return delta.slice(start - text.length, end - text.length);
  return text.slice(start) + delta.slice(0, end - text.length);
}

function project(
  head: string,
  tail: string,
  elidedChars: number,
  headLimit: number,
  replacementRevision: number,
): RetainedRuntimeStream {
  const separator = `${head.endsWith("\n") ? "" : "\n"}${elisionNotice(elidedChars)}\n`;
  // Prefixing before slicing flattens the bounded concatenation. Retaining a
  // plain substring of an enormous delta can otherwise keep that delta's
  // backing allocation alive. Metadata contains offsets, never those slices.
  const text = ` ${head}${separator}${tail}`.slice(1);
  return {
    text,
    retention: {
      headLimit,
      headChars: head.length,
      tailStart: head.length + separator.length,
      elidedChars,
      replacementRevision,
    },
  };
}

function retainAppend(
  text: string,
  delta: string,
  retention?: RuntimeStreamRetention,
): RetainedRuntimeStream {
  const headLimit = retention?.headLimit ?? HEAD_CHARS;
  const replacementRevision = retention?.replacementRevision ?? 0;
  if (retention && retention.elidedChars > 0) {
    const previousTail = text.slice(retention.tailStart);
    const tailChars = previousTail.length + delta.length;
    if (tailChars <= TAIL_CHARS) return result(text + delta, retention);
    let tailStart = tailChars - TAIL_CHARS;
    if (splitsSurrogate(previousTail, delta, tailStart)) tailStart += 1;
    return project(
      text.slice(0, retention.headChars),
      sliceAppend(previousTail, delta, tailStart, tailChars),
      retention.elidedChars + tailStart,
      headLimit,
      replacementRevision,
    );
  }

  const totalChars = text.length + delta.length;
  if (totalChars <= headLimit + TAIL_CHARS) return result(text + delta, retention);
  let headChars = headLimit;
  if (splitsSurrogate(text, delta, headChars)) headChars -= 1;
  let tailStart = totalChars - TAIL_CHARS;
  if (splitsSurrogate(text, delta, tailStart)) tailStart += 1;
  return project(
    sliceAppend(text, delta, 0, headChars),
    sliceAppend(text, delta, tailStart, totalChars),
    tailStart - headChars,
    headLimit,
    replacementRevision,
  );
}

/** Append source output; an empty delta changes neither content nor metadata. */
export function appendRuntimeStream(
  text: string,
  delta: string,
  retention?: RuntimeStreamRetention,
): RetainedRuntimeStream {
  return delta.length === 0 ? result(text, retention) : retainAppend(text, delta, retention);
}

/** A replacement resets gaps/policy, but keeps a numeric epoch even below the cap. */
export function replaceRuntimeStream(
  text: string,
  previous?: RuntimeStreamRetention,
): RetainedRuntimeStream {
  return retainAppend("", text, {
    headLimit: HEAD_CHARS,
    headChars: 0,
    tailStart: 0,
    elidedChars: 0,
    replacementRevision: (previous?.replacementRevision ?? 0) + 1,
  });
}

/**
 * Preserve the host's serialized prefix, including its preexisting notice.
 * Local clipping adds a separate gap with its own truthful count; it never
 * guesses or combines the host's count. Unlike the durable formatter, local
 * projection does not discard partial lines around either gap.
 *
 * Remount/prepend of an item with its metadata is idempotent. Real hydration
 * comes from host history, not from a serialized local renderer projection.
 */
export function hydrateRuntimeStream(
  text: string,
  retention?: RuntimeStreamRetention,
): RetainedRuntimeStream {
  if (retention) return result(text, retention);
  return retainAppend("", text, {
    headLimit: HYDRATED_STREAM_HEAD_CHARS,
    headChars: 0,
    tailStart: 0,
    elidedChars: 0,
  });
}
