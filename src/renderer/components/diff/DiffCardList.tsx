import { useEffect, useState } from "react";
import { DiffFile, DiffView, highlighter } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";
import { Trans } from "@lingui/react/macro";
import { ChevronDown, ChevronRight } from "lucide-react";
import { handleKeyActivate } from "@/renderer/utils/a11y";
import { PathDisplay } from "@/renderer/components/common/PathDisplay";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import {
  buildInWorker,
  diffFileFromBundle,
  extractDiffNames,
  getLang,
} from "@/renderer/views/GitReviewOverlay/parts/diffBuildClient";

export interface DiffCardEntry {
  path: string;
  patch: string;
  additions: number;
  deletions: number;
}

interface RenderedEntry extends DiffCardEntry {
  diffFile: DiffFile | null;
}

/**
 * Renders a list of pre-fetched per-file unified diffs as collapsible cards.
 *
 * Used by overlays that have already loaded the entire diff (e.g. `gh pr diff`)
 * and need to display many files in a single scrollable surface, in contrast to
 * `StackedFileCard` which lazily fetches each diff on expand.
 */
export function DiffCardList(props: {
  entries: DiffCardEntry[];
  visiblePath: string | null;
  diffMode: number;
  theme: "light" | "dark";
  loading: boolean;
}) {
  const { entries: input, visiblePath, diffMode, theme, loading } = props;
  const [rendered, setRendered] = useState<RenderedEntry[]>([]);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (input.length === 0) {
      setRendered([]);
      setBuilding(false);
      return;
    }

    const initial: RenderedEntry[] = input.map((e) => ({ ...e, diffFile: null }));
    setRendered(initial);
    const renderable = initial.filter((e) => e.patch.trim());
    if (renderable.length === 0) {
      setBuilding(false);
      return;
    }
    setBuilding(true);

    void buildInWorker(
      renderable.map((e) => {
        const { oldName, newName } = extractDiffNames(e.patch);
        return {
          key: e.path,
          diff: e.patch,
          oldName,
          newName,
          fileLang: getLang(newName || e.path),
        };
      }),
      theme,
    )
      .then((results) => {
        if (cancelled) return;
        const map = new Map(results.map((r) => [r.key, r]));
        setRendered(
          initial.map((e) => {
            const r = map.get(e.path);
            return r?.bundle ? { ...e, diffFile: diffFileFromBundle(r.data, r.bundle) } : e;
          }),
        );
      })
      .finally(() => {
        if (!cancelled) setBuilding(false);
      });

    return () => {
      cancelled = true;
    };
  }, [input, theme]);

  const visible = visiblePath ? rendered.filter((e) => e.path === visiblePath) : rendered;

  if (loading && rendered.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <PixelLoader size="lg" />
      </div>
    );
  }

  if (rendered.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        <Trans>No changes</Trans>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0">
      {building && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--content-background)]/80">
          <PixelLoader size="lg" />
        </div>
      )}
      <div className="h-full min-h-0 overflow-y-auto px-4 pb-3">
        <div className="space-y-4">
          {visible.map((entry) => (
            <DiffCard key={entry.path} entry={entry} mode={diffMode} theme={theme} />
          ))}
          {visible.length === 0 && !building && (
            <div className="flex items-center justify-center py-8 text-sm text-muted">
              <Trans>No diff for {visiblePath}</Trans>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffCard(props: { entry: RenderedEntry; mode: number; theme: "light" | "dark" }) {
  const { entry, mode, theme } = props;
  const [collapsed, setCollapsed] = useState(false);
  const onToggle = () => setCollapsed((c) => !c);

  return (
    <div className="rounded border border-border">
      <div
        role="button"
        tabIndex={0}
        className="sticky top-0 z-10 flex cursor-pointer select-none items-center gap-2 border-b border-border bg-[var(--content-background)] px-3 py-1.5 text-xs"
        onClick={onToggle}
        onKeyDown={(e) => handleKeyActivate(e, onToggle)}
      >
        {collapsed ? (
          <ChevronRight className="size-3 shrink-0 text-muted" />
        ) : (
          <ChevronDown className="size-3 shrink-0 text-muted" />
        )}
        <PathDisplay
          path={entry.path}
          className="min-w-0 flex-1"
          basenameClassName="font-medium text-foreground"
        />
        <span className="ml-auto flex shrink-0 gap-2 text-[10px] font-medium">
          {entry.additions > 0 && <span className="text-success">+{entry.additions}</span>}
          {entry.deletions > 0 && <span className="text-danger">-{entry.deletions}</span>}
        </span>
      </div>
      {!collapsed && (
        <>
          {entry.diffFile ? (
            <DiffView
              diffFile={entry.diffFile}
              diffViewMode={mode}
              diffViewTheme={theme}
              diffViewFontSize={12}
              registerHighlighter={highlighter}
              diffViewHighlight={true}
              diffViewWrap={false}
            />
          ) : entry.patch.trim() ? (
            <div className="px-4 py-3 text-xs text-muted">
              <Trans>Building diff…</Trans>
            </div>
          ) : (
            <div className="px-4 py-3 text-xs text-muted">
              <Trans>Binary file or no diff available</Trans>
            </div>
          )}
        </>
      )}
    </div>
  );
}
