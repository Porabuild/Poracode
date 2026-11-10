import type { RuntimeEvent } from "./contracts";
import { estimateRuntimeEventBytes } from "./runtimeEventSize";
import { utf16SafeSliceEnd } from "./runtimeStreamRetentionPolicy";

type ContentDelta = Extract<RuntimeEvent, { type: "content.delta" }>;

/**
 * Splits a `content.delta` whose estimate exceeds `maxEventBytes` into
 * consecutive deltas of the same stream, each within `maxEventBytes`. The first
 * fragment keeps `replace`; the rest append, so applying the fragments in order
 * yields exactly the original text. A fragment never ends between the halves of
 * a surrogate pair. Any other event, or one that fits, is returned unchanged.
 * Callers that already measured the event can reuse that estimate.
 */
export function splitContentDelta(
  event: RuntimeEvent,
  maxEventBytes: number,
  estimatedBytes?: number,
): RuntimeEvent[] {
  if (event.type !== "content.delta") return [event];
  const totalBytes = estimatedBytes ?? estimateRuntimeEventBytes(event);
  if (totalBytes <= maxEventBytes) return [event];
  const appendTemplate: ContentDelta = { ...event };
  delete appendTemplate.replace;
  // A budget that barely covers the envelope would degrade into one event per
  // character; such a budget is a caller error, so keep the event whole.
  if (estimateRuntimeEventBytes({ ...appendTemplate, delta: "" }) * 2 > maxEventBytes) {
    return [event];
  }

  const text = event.delta;
  const fragments: ContentDelta[] = [];
  let start = 0;
  let span = Math.max(1, Math.floor((text.length * maxEventBytes) / totalBytes));
  while (start < text.length) {
    const fitted = fitFragment(
      fragments.length === 0 ? event : appendTemplate,
      text,
      start,
      start + span,
      maxEventBytes,
    );
    fragments.push(fitted.fragment);
    span = fitted.end - start;
    start = fitted.end;
  }
  return fragments;
}

function fitFragment(
  template: ContentDelta,
  text: string,
  start: number,
  proposedEnd: number,
  maxEventBytes: number,
): { fragment: ContentDelta; end: number } {
  let end = Math.min(text.length, proposedEnd);
  for (;;) {
    if (end - start > 1) end = utf16SafeSliceEnd(text, end);
    const fragment: ContentDelta = { ...template, delta: text.slice(start, end) };
    const bytes = estimateRuntimeEventBytes(fragment);
    if (bytes <= maxEventBytes || end - start <= 1) return { fragment, end };
    end = start + Math.max(1, Math.floor(((end - start) * maxEventBytes * 0.95) / bytes));
  }
}
