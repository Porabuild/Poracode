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
  if (!isOpen) return null;
  return <ActiveGitFind containerRef={containerRef} />;
}

function ActiveGitFind({ containerRef }: GitFindBarProps) {
  const { t } = useLingui();
  const inputRef = useRef<HTMLInputElement>(null);
  const rangesRef = useRef<Range[]>([]);

  const query = useGitFindStore((state) => state.query);
  const caseSensitive = useGitFindStore((state) => state.caseSensitive);
  const currentIndex = useGitFindStore((state) => state.currentIndex);
  const matchCount = useGitFindStore((state) => state.matchCount);
  const openToken = useGitFindStore((state) => state.openToken);
  const setQuery = useGitFindStore((state) => state.setQuery);
  const toggleCaseSensitive = useGitFindStore((state) => state.toggleCaseSensitive);
  const next = useGitFindStore((state) => state.next);
  const prev = useGitFindStore((state) => state.prev);
  const close = useGitFindStore((state) => state.close);
  const setMatchCount = useGitFindStore((state) => state.setMatchCount);

  const paint = useEffectEvent(() => {
    const ranges = rangesRef.current;
    const current = ranges[currentIndex] ?? null;
    setFindHighlights(ranges, current);
    const container = containerRef.current;
    if (current && container) scrollRangeIntoView(container, current);
  });

  const rebuild = useEffectEvent(() => {
    const container = containerRef.current;
    if (!container || !query) {
      rangesRef.current = [];
      clearFindHighlights();
      setMatchCount(0);
      return;
    }
    rangesRef.current = buildMatchRanges(container, query, caseSensitive);
    setMatchCount(rangesRef.current.length);
    paint();
  });

  useEffect(() => {
    rebuild();
  }, [query, caseSensitive, openToken]);

  useEffect(() => {
    paint();
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
        rebuild();
      });
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [containerRef]);

  useFindBarChrome(inputRef, openToken, close);

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
