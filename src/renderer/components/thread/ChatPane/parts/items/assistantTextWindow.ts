import type { RuntimeStreamRetention } from "@/renderer/state/slices/runtimeStreamRetention";
import { HEAD_CHARS } from "@/shared/runtimeStreamRetentionPolicy";
import { plainTextWindow } from "./longPlainText";

interface WindowSource {
  headLimit: number;
  replacementRevision: number;
  length: number;
  elidedChars: number;
}

export interface DetachedAssistantTextPage {
  /** Absolute source boundaries, excluding the locally generated notice. */
  start: number;
  end: number;
  text: string;
  source: WindowSource;
}

function sourceOffset(offset: number, retention?: RuntimeStreamRetention): number {
  if (!retention || retention.elidedChars === 0 || offset <= retention.headChars) return offset;
  // A page starting within the notice must continue backwards into the head.
  if (offset < retention.tailStart) return retention.headChars;
  return offset - retention.tailStart + retention.headChars + retention.elidedChars;
}

function projectedEnd(sourceEnd: number, retention?: RuntimeStreamRetention): number {
  if (!retention || retention.elidedChars === 0 || sourceEnd <= retention.headChars) {
    return sourceEnd;
  }
  // An unavailable source position shows the retained head and its notice;
  // clamping to the live tail would silently move the reader forwards.
  return retention.tailStart + Math.max(0, sourceEnd - retention.headChars - retention.elidedChars);
}

function windowSource(text: string, retention?: RuntimeStreamRetention): WindowSource {
  return {
    headLimit: retention?.headLimit ?? HEAD_CHARS,
    replacementRevision: retention?.replacementRevision ?? 0,
    length: sourceOffset(text.length, retention),
    elidedChars: retention?.elidedChars ?? 0,
  };
}

/** The latest page is transient; only explicit Earlier navigation detaches a copy. */
export function latestAssistantTextWindow(text: string, retention?: RuntimeStreamRetention) {
  const window = plainTextWindow(text, text.length);
  return {
    ...window,
    start: sourceOffset(window.start, retention),
    end: sourceOffset(window.end, retention),
  };
}

export function earlierAssistantTextPage(
  text: string,
  sourceEnd: number,
  retention?: RuntimeStreamRetention,
): DetachedAssistantTextPage {
  const window = plainTextWindow(text, projectedEnd(sourceEnd, retention));
  // A substring may keep the entire old multi-megabyte projection alive.
  // Reconstruct at most 8,193 UTF-16 units from numbers, preserving surrogate
  // pairs AND lone units without relying on engine-specific string flattening.
  const units: number[] = [];
  for (let index = 0; index < window.text.length; index += 1) {
    units.push(window.text.charCodeAt(index));
  }
  return {
    start: sourceOffset(window.start, retention),
    end: sourceOffset(window.end, retention),
    text: String.fromCharCode(...units),
    source: windowSource(text, retention),
  };
}

/** Fresh hydration or replacement must not leave an old detached page visible. */
export function isCurrentAssistantTextPage(
  page: DetachedAssistantTextPage,
  text: string,
  retention?: RuntimeStreamRetention,
): boolean {
  const source = windowSource(text, retention);
  return (
    page.source.replacementRevision === source.replacementRevision &&
    page.source.headLimit === source.headLimit &&
    page.source.length <= source.length &&
    page.source.elidedChars <= source.elidedChars
  );
}
