/**
 * Shared text-search + highlight primitives for the in-content Find feature.
 *
 * Highlighting uses the CSS Custom Highlight API (`CSS.highlights` + `Highlight`
 * + `Range`) rather than wrapping matches in `<mark>` elements. That matters
 * here because the chat transcript is virtualized and React-managed: injecting
 * DOM nodes would fight the reconciler and get wiped on the next render, while
 * Ranges live outside the DOM tree and simply re-resolve. The registry is
 * document-global and keyed by name; only one Find surface is active at a time,
 * so the two fixed names below are shared and cleared on close.
 */

export const FIND_HIGHLIGHT_NAME = "lc-find";
export const FIND_HIGHLIGHT_CURRENT_NAME = "lc-find-current";

/** Case-insensitive (or sensitive) count of non-overlapping occurrences. */
export function countOccurrences(haystack: string, needle: string, caseSensitive: boolean): number {
  if (!needle) return 0;
  const hay = caseSensitive ? haystack : haystack.toLowerCase();
  const ndl = caseSensitive ? needle : needle.toLowerCase();
  let count = 0;
  let index = hay.indexOf(ndl);
  while (index !== -1) {
    count += 1;
    index = hay.indexOf(ndl, index + ndl.length);
  }
  return count;
}

interface TextSpan {
  node: Text;
  start: number;
  end: number;
}

function collectTextSpans(root: Element): { combined: string; spans: TextSpan[] } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      // Skip text inside elements the user can't see (collapsed disclosures,
      // hidden tabs) so highlight ranges never point at invisible content.
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[hidden], [aria-hidden='true']")) return NodeFilter.FILTER_REJECT;
      return (node as Text).data.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const spans: TextSpan[] = [];
  let combined = "";
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    spans.push({ node: text, start: combined.length, end: combined.length + text.data.length });
    combined += text.data;
    current = walker.nextNode();
  }
  return { combined, spans };
}

function locate(spans: readonly TextSpan[], offset: number): { node: Text; offset: number } | null {
  for (const span of spans) {
    if (offset >= span.start && offset <= span.end) {
      return { node: span.node, offset: offset - span.start };
    }
  }
  return null;
}

/**
 * Build a {@link Range} for every occurrence of `needle` within `root`'s text,
 * spanning element boundaries (so a match split across `<strong>`/`<code>` still
 * highlights). Document order.
 */
export function buildMatchRanges(root: Element, needle: string, caseSensitive: boolean): Range[] {
  if (!needle) return [];
  const { combined, spans } = collectTextSpans(root);
  if (spans.length === 0) return [];
  const hay = caseSensitive ? combined : combined.toLowerCase();
  const ndl = caseSensitive ? needle : needle.toLowerCase();
  const ranges: Range[] = [];
  let index = hay.indexOf(ndl);
  while (index !== -1) {
    const start = locate(spans, index);
    const end = locate(spans, index + ndl.length);
    if (start && end) {
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      ranges.push(range);
    }
    index = hay.indexOf(ndl, index + ndl.length);
  }
  return ranges;
}

interface HighlightConstructor {
  new (...ranges: Range[]): object;
}
interface HighlightRegistryLike {
  set(name: string, highlight: object): void;
  delete(name: string): void;
}

/**
 * Access the CSS Custom Highlight API through `globalThis` so this module never
 * depends on whether the TS DOM lib ships the `Highlight` type. Returns null
 * when the runtime lacks support (highlighting silently degrades; navigation
 * still scrolls matches into view).
 */
function highlightApi(): {
  Highlight: HighlightConstructor;
  registry: HighlightRegistryLike;
} | null {
  const scope = globalThis as unknown as {
    Highlight?: HighlightConstructor;
    CSS?: { highlights?: HighlightRegistryLike };
  };
  if (!scope.Highlight || !scope.CSS?.highlights) return null;
  return { Highlight: scope.Highlight, registry: scope.CSS.highlights };
}

/**
 * Publish the find highlights. `current` (if present) is registered under a
 * second name with higher paint priority so the active match is styled
 * distinctly even though it also sits in the base set (CSS highlights overlap;
 * priority decides which paints on top).
 */
export function setFindHighlights(ranges: readonly Range[], current: Range | null): void {
  const api = highlightApi();
  if (!api) return;
  api.registry.set(FIND_HIGHLIGHT_NAME, new api.Highlight(...ranges));
  if (current) {
    const highlight = new api.Highlight(current) as { priority?: number };
    highlight.priority = 1;
    api.registry.set(FIND_HIGHLIGHT_CURRENT_NAME, highlight as object);
  } else {
    api.registry.delete(FIND_HIGHLIGHT_CURRENT_NAME);
  }
}

export function clearFindHighlights(): void {
  const api = highlightApi();
  if (!api) return;
  api.registry.delete(FIND_HIGHLIGHT_NAME);
  api.registry.delete(FIND_HIGHLIGHT_CURRENT_NAME);
}

/**
 * Nudge `container`'s scroll so `range` sits comfortably inside the viewport.
 * Used to bring the active match fully into view after the virtualizer has
 * scrolled its row into range. No-op when the range has no layout box yet.
 */
export function scrollRangeIntoView(container: HTMLElement, range: Range): void {
  const rect = range.getBoundingClientRect();
  if (rect.height === 0 && rect.width === 0) return;
  const view = container.getBoundingClientRect();
  const margin = 56;
  if (rect.top < view.top + margin) {
    container.scrollTop -= view.top + margin - rect.top;
  } else if (rect.bottom > view.bottom - margin) {
    container.scrollTop += rect.bottom - (view.bottom - margin);
  }
}
