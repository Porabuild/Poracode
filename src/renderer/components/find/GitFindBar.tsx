import { useEffect, useEffectEvent, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import { useGitFindStore } from "@/renderer/state/gitFindStore";
import { FindBar } from "./FindBar";
import { useFindBarChrome } from "./useFindBarChrome";
import {
  buildMatchRanges,
  clearFindHighlights,
  scrollRangeIntoView,
  setFindHighlights,
} from "./findText";

interface GitFindBarProps {
  /** Scroll container holding the rendered diff text. */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/** Find bar for the Git diff viewer. The diff is fully rendered (not
 * virtualized), so matches are counted directly from the DOM and highlighted via
 * the CSS Custom Highlight API. */
export function GitFindBar({ containerRef }: GitFindBarProps) {
  const isOpen = useGitFindStore((state) => state.isOpen);
  const openToken = useGitFindStore((state) => state.openToken);
  if (!isOpen) return null;
  // Remount per open so a reopened session rescans + refocuses through a
  // fresh mount instead of a re-run trigger.
  return <ActiveGitFind key={openToken} containerRef={containerRef} />;
}

function ActiveGitFind({ containerRef }: GitFindBarProps) {
  const { t } = useLingui();
  const inputRef = useRef<HTMLInputElement>(null);
  const rangesRef = useRef<Range[]>([]);

  const query = useGitFindStore((state) => state.query);
  const caseSensitive = useGitFindStore((state) => state.caseSensitive);
  const currentIndex = useGitFindStore((state) => state.currentIndex);
  const matchCount = useGitFindStore((state) => state.matchCount);
  const setQuery = useGitFindStore((state) => state.setQuery);
  const toggleCaseSensitive = useGitFindStore((state) => state.toggleCaseSensitive);
  const next = useGitFindStore((state) => state.next);
  const prev = useGitFindStore((state) => state.prev);
  const close = useGitFindStore((state) => state.close);
  const setMatchCount = useGitFindStore((state) => state.setMatchCount);

  const paint = useEffectEvent((index: number) => {
    const ranges = rangesRef.current;
    const current = ranges[index] ?? null;
    setFindHighlights(ranges, current);
    const container = containerRef.current;
    if (current && container) scrollRangeIntoView(container, current);
  });

  // Re-scans the diff DOM for the given query. The active index is read from
  // the store (not passed in) so stepping through matches repaints without
  // re-scanning; see the paint effect below.
  const rebuild = useEffectEvent((searchQuery: string, matchCase: boolean) => {
    const container = containerRef.current;
    if (!container || !searchQuery) {
      rangesRef.current = [];
      clearFindHighlights();
      setMatchCount(0);
      return;
    }
    rangesRef.current = buildMatchRanges(container, searchQuery, matchCase);
    setMatchCount(rangesRef.current.length);
    paint(useGitFindStore.getState().currentIndex);
  });

  useEffect(() => {
    rebuild(query, caseSensitive);
  }, [query, caseSensitive]);

  useEffect(() => {
    paint(currentIndex);
  }, [currentIndex]);

  // The diff mounts in staggered chunks and re-renders on refresh; re-scan when
  // its DOM changes so the match set stays accurate.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let raf: number | null = null;
    const observer = new MutationObserver(() => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const { query: latestQuery, caseSensitive: latestCase } = useGitFindStore.getState();
        rebuild(latestQuery, latestCase);
      });
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [containerRef]);

  useFindBarChrome(inputRef, close);

  return (
    <div className="pointer-events-auto absolute right-4 top-2 z-30">
      <FindBar
        ref={inputRef}
        query={query}
        onQueryChange={setQuery}
        caseSensitive={caseSensitive}
        onToggleCaseSensitive={toggleCaseSensitive}
        matchCount={matchCount}
        currentIndex={currentIndex}
        onNext={next}
        onPrev={prev}
        onClose={close}
        placeholder={t`Find in diff`}
      />
    </div>
  );
}
