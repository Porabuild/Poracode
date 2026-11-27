import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useGitFindStore } from "@/renderer/state/gitFindStore";
import { FindBar } from "./FindBar";
import { useFindBarChrome } from "./useFindBarChrome";
import {
  buildMatchRanges,
  countOccurrences,
  clearFindHighlights,
  scrollRangeIntoView,
  setFindHighlights,
} from "./findText";
import {
  findOversizedDiffMatches,
  gitDiffSearchLines,
  readGitDiffSearchLines,
  type GitDiffSearchEntry,
  type GitDiffSearchLine,
  type OversizedDiffMatch,
} from "./gitDiffSearch";

interface GitFindBarProps {
  /** Scroll container holding the rendered diff text. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  entries?: GitDiffSearchEntry[];
  diffMode?: number;
  /** Full-content identity, including location and explicit refreshes. */
  contentKey?: string;
}

interface OversizedFindHit extends OversizedDiffMatch {
  readonly filePath: string;
}

interface OversizedFindResult {
  readonly entries: GitDiffSearchEntry[];
  readonly query: string;
  readonly matchCase: boolean;
  readonly revision: string;
  readonly matches: ReadonlyMap<string, readonly OversizedFindHit[]>;
  /** A bounded oversized scan reached its cap, so the result is incomplete. */
  readonly capped: boolean;
}

/** Aggregate diffs are searched from patch data; single-file views use the DOM. */
export function GitFindBar(props: GitFindBarProps) {
  const isOpen = useGitFindStore((state) => state.isOpen);
  const openToken = useGitFindStore((state) => state.openToken);
  if (!isOpen) return null;
  // Remount per open so a reopened session rescans + refocuses through a
  // fresh mount instead of a re-run trigger.
  return <ActiveGitFind key={openToken} {...props} />;
}

function ActiveGitFind({ containerRef, entries, diffMode = 1, contentKey = "" }: GitFindBarProps) {
  const { t } = useLingui();
  const inputRef = useRef<HTMLInputElement>(null);
  const rangesRef = useRef<Range[]>([]);
  const matchesRef = useRef<
    { key: string; selector: string | null; occurrence: number; preview?: OversizedFindHit }[]
  >([]);
  const snapshotsRef = useRef(
    new Map<
      string,
      { rawDiff: string; mode: number; contentKey: string; lines: GitDiffSearchLine[] }
    >(),
  );
  const pendingRevealRef = useRef(false);
  const [preview, setPreview] = useState<OversizedFindHit | null>(null);
  const [largeSearch, setLargeSearch] = useState<OversizedFindResult | null>(null);

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

  const currentLargeSearch =
    largeSearch?.entries === entries &&
    largeSearch?.query === query &&
    largeSearch.matchCase === caseSensitive &&
    largeSearch.revision === contentKey
      ? largeSearch
      : null;
  const searchingLargeDiffs =
    !!query && !currentLargeSearch && !!entries?.some((entry) => entry.tooLarge && entry.rawDiff);

  const paint = useEffectEvent((index: number) => {
    const container = containerRef.current;
    if (entries && container) {
      const match = matchesRef.current[index];
      setPreview(match?.preview ?? null);
      const section = match
        ? container.querySelector(`[data-diff-key="${CSS.escape(match.key)}"]`)
        : null;
      const line = match?.selector ? section?.querySelector(match.selector) : null;
      const current =
        line && match
          ? (buildMatchRanges(line, query, caseSensitive)[match.occurrence] ?? null)
          : null;
      setFindHighlights(buildMatchRanges(container, query, caseSensitive), current);
      if (pendingRevealRef.current && section) {
        section.dispatchEvent(new Event("poracode-reveal-diff"));
        if (current) {
          scrollRangeIntoView(container, current);
        } else {
          section.scrollIntoView({ block: "start" });
        }
      }
      return;
    }
    const ranges = rangesRef.current;
    const current = ranges[index] ?? null;
    setFindHighlights(ranges, current);
    if (current && container) scrollRangeIntoView(container, current);
  });

  // Re-scans the diff DOM for the given query. The active index is read from
  // the store (not passed in) so stepping through matches repaints without
  // re-scanning; see the paint effect below.
  const rebuild = useEffectEvent(
    (
      searchQuery: string,
      matchCase: boolean,
      searchEntries: GitDiffSearchEntry[] | undefined,
      mode: number,
      revision: string,
      preserveMatch = false,
    ) => {
      const container = containerRef.current;
      if (!container || !searchQuery) {
        rangesRef.current = [];
        matchesRef.current = [];
        setPreview(null);
        clearFindHighlights();
        setMatchCount(0);
        return;
      }
      if (searchEntries) {
        const previousMatch = preserveMatch
          ? matchesRef.current[useGitFindStore.getState().currentIndex]
          : undefined;
        const matches: typeof matchesRef.current = [];
        for (const entry of searchEntries) {
          const key = `${entry.staged ? "s" : "u"}:${entry.filePath}`;
          const section = container.querySelector(`[data-diff-key="${CSS.escape(key)}"]`);
          const rendered =
            section && readGitDiffSearchLines(section, `${mode}\0${revision}\0${entry.rawDiff}`);
          const cached = snapshotsRef.current.get(key);
          const lines =
            rendered ??
            (cached?.rawDiff === entry.rawDiff &&
            cached.mode === mode &&
            cached.contentKey === revision
              ? cached.lines
              : gitDiffSearchLines(entry, mode));
          snapshotsRef.current.set(key, {
            rawDiff: entry.rawDiff,
            mode,
            contentKey: revision,
            lines,
          });
          for (const line of lines) {
            const count = countOccurrences(line.text, searchQuery, matchCase);
            for (let occurrence = 0; occurrence < count; occurrence++)
              matches.push({ key, selector: line.selector, occurrence });
          }
          for (const hit of currentLargeSearch?.matches.get(key) ?? []) {
            matches.push({
              key,
              selector: null,
              occurrence: 0,
              preview: hit,
            });
          }
        }
        matchesRef.current = matches;
        setMatchCount(matches.length);
        if (previousMatch) {
          const index = matches.findIndex(
            (match) =>
              match.key === previousMatch.key &&
              match.selector === previousMatch.selector &&
              match.preview?.side === previousMatch.preview?.side &&
              match.preview?.line === previousMatch.preview?.line &&
              match.occurrence === previousMatch.occurrence,
          );
          if (index >= 0) useGitFindStore.setState({ currentIndex: index });
        }
      } else {
        rangesRef.current = buildMatchRanges(container, searchQuery, matchCase);
        setMatchCount(rangesRef.current.length);
      }
      paint(useGitFindStore.getState().currentIndex);
    },
  );

  useEffect(() => {
    if (!query || !entries?.some((entry) => entry.tooLarge && entry.rawDiff)) return;
    const controller = new AbortController();
    void (async () => {
      const matches = new Map<string, readonly OversizedFindHit[]>();
      let capped = false;
      for (const entry of entries) {
        if (!entry.tooLarge || !entry.rawDiff) continue;
        const result = await findOversizedDiffMatches(
          entry.rawDiff,
          query,
          caseSensitive,
          controller.signal,
        );
        capped = capped || result.capped;
        matches.set(
          `${entry.staged ? "s" : "u"}:${entry.filePath}`,
          result.matches.map((hit) => ({ ...hit, filePath: entry.filePath })),
        );
      }
      if (!controller.signal.aborted)
        setLargeSearch({
          entries,
          query,
          matchCase: caseSensitive,
          revision: contentKey,
          matches,
          capped,
        });
    })().catch(() => {
      if (!controller.signal.aborted)
        setLargeSearch({
          entries,
          query,
          matchCase: caseSensitive,
          revision: contentKey,
          matches: new Map(),
          capped: false,
        });
    });
    return () => controller.abort();
  }, [entries, query, caseSensitive, contentKey]);

  useEffect(() => {
    pendingRevealRef.current = true;
    rebuild(query, caseSensitive, entries, diffMode, contentKey, currentLargeSearch !== null);
  }, [query, caseSensitive, entries, diffMode, contentKey, currentLargeSearch]);

  useEffect(() => {
    pendingRevealRef.current = true;
    paint(currentIndex);
  }, [currentIndex]);

  // Re-resolve highlights when deferred bodies mount or context is expanded.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Nearby sections can change height after the match first appears. Keep
    // it in view until the user takes over scrolling or interacts with a row.
    const stopRevealing = () => {
      pendingRevealRef.current = false;
    };
    container.addEventListener("wheel", stopRevealing, { passive: true });
    container.addEventListener("pointerdown", stopRevealing);
    container.addEventListener("keydown", stopRevealing);
    let raf: number | null = null;
    const observer = new MutationObserver(() => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const { query: latestQuery, caseSensitive: latestCase } = useGitFindStore.getState();
        rebuild(latestQuery, latestCase, entries, diffMode, contentKey, true);
      });
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    return () => {
      container.removeEventListener("wheel", stopRevealing);
      container.removeEventListener("pointerdown", stopRevealing);
      container.removeEventListener("keydown", stopRevealing);
      observer.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [containerRef, entries, diffMode, contentKey]);

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
        matchCountCapped={currentLargeSearch?.capped ?? false}
        currentIndex={currentIndex}
        onNext={next}
        onPrev={prev}
        onClose={close}
        placeholder={t`Find in diff`}
      />
      {searchingLargeDiffs ? (
        <div
          role="status"
          className="mt-1 rounded-lg border border-border bg-overlay px-3 py-2 text-xs text-muted"
        >
          <Trans>Searching large diffs…</Trans>
        </div>
      ) : null}
      {preview && currentLargeSearch ? (
        <aside
          aria-live="polite"
          className="mt-1 max-w-[min(24rem,80vw)] rounded-lg border border-border bg-overlay px-3 py-2 text-xs"
        >
          <p className="break-words font-medium">
            {preview.side === "old" ? (
              <Trans>
                {preview.filePath}, old line {preview.line}
              </Trans>
            ) : (
              <Trans>
                {preview.filePath}, new line {preview.line}
              </Trans>
            )}
          </p>
          <p className="mt-1 break-words font-mono text-muted">{preview.hunk}</p>
          <p className="mt-1 whitespace-pre-wrap break-words font-mono">{preview.text}</p>
        </aside>
      ) : null}
    </div>
  );
}
