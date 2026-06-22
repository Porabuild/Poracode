import { useEffect, useState } from "react";
import { DiffFile, DiffView, highlighter } from "@git-diff-view/react";
import { Plural, Trans } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { buildInWorker, diffFileFromBundle } from "../../diffBuildClient";
import { FileHeader } from "./FileHeader";
import type { DiffEntry } from "./diffHelpers";

export function DiffSection(props: {
  entry: DiffEntry;
  mode: number;
  theme: "light" | "dark";
  projectLocation: Project["location"];
  mountDelay: number;
  onMounted?: () => void;
}) {
  const { entry, mode: rawMode, theme, projectLocation, mountDelay, onMounted } = props;
  // New files have no old side — force unified mode so content renders full-width
  const isNewFile = entry.deletions === 0 && (!entry.oldName || entry.oldName === "/dev/null");
  const mode = isNewFile ? 4 : rawMode; // 4 = Unified
  const [collapsed, setCollapsed] = useState(false);
  const onToggleCollapse = () => setCollapsed((c) => !c);

  // Stagger DiffView mount so files render progressively behind the loader
  const [mounted, setMounted] = useState(mountDelay === 0);
  useEffect(() => {
    if (!mounted) {
      const id = setTimeout(() => setMounted(true), mountDelay);
      return () => clearTimeout(id);
    }
  }, [mounted, mountDelay]);

  // DiffFile with full file content (enables hunk expand buttons)
  const [contentDiffFile, setContentDiffFile] = useState<DiffFile | null>(null);
  const activeDiffFile = contentDiffFile ?? entry.diffFile;

  // Load file content once mounted, build DiffFile with content in worker
  useEffect(() => {
    if (!mounted || entry.loading || entry.tooLarge || !entry.rawDiff.trim()) return;
    let cancelled = false;
    readBridge()
      .getGitFileContent({
        projectLocation,
        filePath: entry.filePath,
        staged: entry.staged,
      })
      .then(({ oldContent, newContent }) => {
        if (cancelled) return;
        const key = `${entry.staged ? "s" : "u"}:${entry.filePath}`;
        return buildInWorker([
          {
            key,
            diff: entry.rawDiff,
            oldName: entry.oldName,
            newName: entry.newName,
            fileLang: entry.fileLang,
            oldContent,
            newContent,
          },
        ]);
      })
      .then((results) => {
        if (cancelled || !results) return;
        const r = results[0];
        if (r?.bundle) setContentDiffFile(diffFileFromBundle(r.data, r.bundle));
      })
      .catch(() => {
        if (!cancelled) setContentDiffFile(entry.diffFile);
      });
    return () => {
      cancelled = true;
    };
  }, [
    mounted,
    entry.diffFile,
    entry.filePath,
    entry.staged,
    entry.loading,
    entry.tooLarge,
    entry.rawDiff,
    entry.oldName,
    entry.newName,
    entry.fileLang,
    projectLocation,
  ]);

  // Signal ready after content DiffFile is loaded (expand buttons ready, no layout shift).
  const hasRenderable = !entry.loading && !entry.tooLarge && entry.rawDiff.trim();
  useEffect(() => {
    if (!mounted) return;
    if (!hasRenderable || contentDiffFile) onMounted?.();
  }, [mounted, hasRenderable, contentDiffFile, onMounted]);

  if (entry.loading) {
    return (
      <div className="rounded border border-border">
        <FileHeader entry={entry} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
        <div className="flex h-16 items-center justify-center text-xs text-muted/40">
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--row-hover)]" />
        </div>
      </div>
    );
  }

  if (entry.tooLarge) {
    return (
      <div className="rounded border border-border">
        <FileHeader entry={entry} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
        {!collapsed && (
          <div className="px-4 py-3 text-xs text-muted">
            <Trans>
              File too large to display (
              <Plural
                value={entry.insertions + entry.deletions}
                one="# line changed"
                other="# lines changed"
              />
              )
            </Trans>
          </div>
        )}
      </div>
    );
  }

  if (!activeDiffFile) {
    return (
      <div className="rounded border border-border px-4 py-3 text-xs text-muted">
        <Trans>No diff available for {entry.filePath}</Trans>
      </div>
    );
  }

  return (
    <div className="rounded border border-border">
      <FileHeader entry={entry} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      {mounted ? (
        <div
          className={`lightcode-git-diff-body${isNewFile ? " diff-new-file" : ""}`}
          style={collapsed ? { display: "none" } : undefined}
        >
          <DiffView
            diffFile={activeDiffFile}
            diffViewMode={mode}
            diffViewTheme={theme}
            diffViewFontSize={12}
            registerHighlighter={highlighter}
            diffViewHighlight={true}
            diffViewWrap={false}
          />
        </div>
      ) : (
        !collapsed && (
          <div className="flex h-16 items-center justify-center text-xs text-muted/40">
            <div className="h-3 w-24 animate-pulse rounded bg-[var(--row-hover)]" />
          </div>
        )
      )}
    </div>
  );
}
