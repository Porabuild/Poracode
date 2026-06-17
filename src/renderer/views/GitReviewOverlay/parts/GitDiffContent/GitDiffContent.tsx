import { useEffect, useRef, useState } from "react";
import { setEnableFastDiffTemplate } from "@git-diff-view/react";
import { Trans } from "@lingui/react/macro";
import "@git-diff-view/react/styles/diff-view.css";

// Must match worker setting — enables pre-rendered HTML templates (dangerouslySetInnerHTML)
setEnableFastDiffTemplate(true);
import type { GitStatusResult, Project } from "@/shared/contracts";
import type { DiffBuildItem } from "@/renderer/workers/diffBuildWorker";

// Suppress noisy dev-only warnings from @git-diff-view/core
{
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("@git-diff-view/core")) return;
    origWarn.apply(console, args);
  };
}
import { readBridge } from "@/renderer/bridge";
import { PixelLoader } from "@/renderer/components/common";
import { buildInWorker, diffFileFromBundle, useDiffTheme } from "../diffBuildClient";
import { DiffSection } from "./parts/DiffSection";
import { SingleFileDiff } from "./parts/SingleFileDiff";
import {
  buildEntry,
  buildGitStatusKey,
  entryKey,
  getBatchDiff,
  skeletonEntry,
  type DiffEntry,
} from "./parts/diffHelpers";

export type DiffFilter = "changes" | "staged";

export function GitDiffContent(props: {
  project: Project;
  gitStatus: GitStatusResult | undefined;
  selectedFile: string | null;
  selectedStaged: boolean;
  diffMode: number;
  diffFilter: DiffFilter;
  refreshKey: number;
}) {
  const { project, gitStatus, selectedFile, selectedStaged, diffMode, diffFilter, refreshKey } =
    props;
  const theme = useDiffTheme();
  const [entries, setEntries] = useState<DiffEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [panelReady, setPanelReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const statusKeyRef = useRef<string | null>(null);
  const refreshKeyRef = useRef(refreshKey);

  // Load batch diffs, then build DiffFile instances in a Web Worker
  useEffect(() => {
    let cancelled = false;
    const forceRefresh = refreshKeyRef.current !== refreshKey;
    refreshKeyRef.current = refreshKey;

    async function loadDiffs() {
      if (!gitStatus?.isRepo) {
        if (!cancelled) {
          statusKeyRef.current = buildGitStatusKey(gitStatus);
          setEntries([]);
          setLoading(false);
        }
        return;
      }

      const statusKey = buildGitStatusKey(gitStatus);
      if (!forceRefresh && statusKeyRef.current === statusKey) {
        return;
      }

      const isFirstLoad = statusKeyRef.current === null;
      if (isFirstLoad) {
        setLoading(true);
        const skeletons = [
          ...gitStatus.staged.map((f) => skeletonEntry(f.path, true, f.insertions, f.deletions)),
          ...gitStatus.unstaged.map((f) => skeletonEntry(f.path, false, f.insertions, f.deletions)),
        ];
        if (!cancelled) setEntries(skeletons);
      }

      const untrackedPaths = gitStatus.unstaged.filter((f) => f.status === "?").map((f) => f.path);

      try {
        const batch = await readBridge().getGitDiffBatch({
          projectLocation: project.location,
          untrackedPaths,
        });
        if (cancelled) return;

        // Build lightweight entries (no DiffFile yet)
        const populated = [
          ...gitStatus.staged.map((f) =>
            buildEntry(f.path, true, getBatchDiff(batch.staged, f.path), f.insertions, f.deletions),
          ),
          ...gitStatus.unstaged.map((f) =>
            buildEntry(
              f.path,
              false,
              getBatchDiff(batch.unstaged, f.path),
              f.insertions,
              f.deletions,
            ),
          ),
        ];

        // Build DiffFile instances in the worker before showing entries
        const workerItems: DiffBuildItem[] = populated
          .filter((e) => !e.tooLarge && e.rawDiff.trim())
          .map((e) => ({
            key: entryKey(e),
            diff: e.rawDiff,
            oldName: e.oldName,
            newName: e.newName,
            fileLang: e.fileLang,
          }));

        if (workerItems.length > 0) {
          const results = await buildInWorker(workerItems);
          if (cancelled) return;
          const resultMap = new Map(results.map((r) => [r.key, r]));
          for (const e of populated) {
            const r = resultMap.get(entryKey(e));
            if (r?.bundle) e.diffFile = diffFileFromBundle(r.data, r.bundle);
          }
        }

        if (!cancelled) {
          statusKeyRef.current = statusKey;
          setEntries(populated);
        }
      } catch {
        if (!cancelled) {
          setEntries((prev) => prev.map((e) => ({ ...e, loading: false })));
        }
      }

      if (!cancelled && isFirstLoad) setLoading(false);
    }

    void loadDiffs();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, project.location, gitStatus]);

  const filtered =
    diffFilter === "staged" ? entries.filter((e) => e.staged) : entries.filter((e) => !e.staged);

  // Track staggered mount progress — loader hides when last DiffSection mounts
  const mountedCountRef = useRef(0);
  const expectedCountRef = useRef(0);
  const onSectionMounted = () => {
    mountedCountRef.current++;
    if (mountedCountRef.current >= expectedCountRef.current) {
      setPanelReady(true);
    }
  };

  const filteredWithDiffs = filtered.filter((e) => e.diffFile);
  useEffect(() => {
    mountedCountRef.current = 0;
    expectedCountRef.current = filteredWithDiffs.length;
    if (filteredWithDiffs.length === 0) setPanelReady(!loading);
    else setPanelReady(false);
  }, [filteredWithDiffs.length, loading]);

  if (!gitStatus?.isRepo) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        <Trans>Not a git repository</Trans>
      </div>
    );
  }

  const showLoader = (loading || !panelReady) && filtered.length > 0;

  return (
    <div className="lightcode-git-diff-content relative h-full min-h-0">
      {showLoader && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--content-background)]">
          <PixelLoader size="lg" />
        </div>
      )}

      <div ref={scrollRef} className="h-full min-h-0 overflow-y-auto px-4">
        {filtered.length === 0 && !loading && (
          <div className="flex items-center justify-center py-8 text-sm text-muted">
            {diffFilter === "staged" ? (
              <Trans>No staged changes</Trans>
            ) : (
              <Trans>No changes to display</Trans>
            )}
          </div>
        )}
        <div className="space-y-4">
          {filtered.map((entry, i) => (
            <DiffSection
              key={entryKey(entry)}
              entry={entry}
              mode={diffMode}
              theme={theme}
              projectLocation={project.location}
              mountDelay={i * 4}
              onMounted={onSectionMounted}
            />
          ))}
        </div>
      </div>

      {selectedFile && (
        <SingleFileDiff
          project={project}
          filePath={selectedFile}
          staged={selectedStaged}
          diffMode={diffMode}
          refreshKey={refreshKey}
        />
      )}
    </div>
  );
}
