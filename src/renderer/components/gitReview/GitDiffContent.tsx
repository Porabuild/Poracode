import { useEffect, useRef, useState } from "react";
import { DiffView, DiffFile } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";
import type { Project, GitStatusResult } from "../../../shared/contracts";

// Suppress noisy dev-only warning from @git-diff-view/core about syntax highlight threshold.
// The library logs this before checking our diffViewHighlight={false} prop.
{
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("@git-diff-view/core")) return;
    origWarn.apply(console, args);
  };
}
import { readBridge } from "../../bridge";
import { useSharedSettings } from "../../state/sharedSettingsStore";

function useDiffTheme(): "light" | "dark" {
  const themeMode = useSharedSettings((s) => s.themeMode);
  if (themeMode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return themeMode;
}

/** Skip rendering diffs larger than this many lines changed */
const LARGE_DIFF_THRESHOLD = 5000;

/** Unified mode value from DiffModeEnum */
const UNIFIED_MODE = 4;

interface DiffEntry {
  filePath: string;
  staged: boolean;
  rawDiff: string;
  diffFile: DiffFile | null;
  isNewFile: boolean;
  plainContent: string | null;
  loading: boolean;
  tooLarge: boolean;
  insertions: number;
  deletions: number;
}

function buildGitStatusKey(gitStatus: GitStatusResult | undefined): string {
  if (!gitStatus?.isRepo) {
    return "not-repo";
  }

  const serialize = (entries: GitStatusResult["staged"]) =>
    entries
      .map((entry) =>
        [
          entry.path,
          entry.oldPath ?? "",
          entry.status,
          entry.staged ? "1" : "0",
          entry.insertions,
          entry.deletions,
        ].join("|"),
      )
      .join("\n");

  return [
    gitStatus.branch,
    gitStatus.totalInsertions,
    gitStatus.totalDeletions,
    serialize(gitStatus.staged),
    serialize(gitStatus.unstaged),
  ].join("\n---\n");
}

function parseDiffFile(raw: string, mode: number): DiffFile | null {
  if (!raw.trim()) return null;

  let oldName = "";
  let newName = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("--- ")) {
      oldName = line.slice(4).replace(/^a\//, "");
    } else if (line.startsWith("+++ ")) {
      newName = line.slice(4).replace(/^b\//, "");
      break;
    }
  }

  const instance = DiffFile.createInstance({
    oldFile: { fileName: oldName },
    newFile: { fileName: newName },
    hunks: [raw],
  });
  instance.init();
  if (mode === UNIFIED_MODE) {
    instance.buildUnifiedDiffLines();
  } else {
    instance.buildSplitDiffLines();
  }
  return instance;
}

function isNewFileDiff(raw: string): boolean {
  return raw.includes("--- /dev/null");
}

function extractPlainContent(raw: string): string {
  const lines: string[] = [];
  let inHunk = false;
  for (const line of raw.split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("+")) {
      lines.push(line.slice(1));
    } else if (!line.startsWith("-") && !line.startsWith("\\")) {
      lines.push(line.startsWith(" ") ? line.slice(1) : line);
    }
  }
  return lines.join("\n");
}

function buildEntry(
  filePath: string,
  staged: boolean,
  diff: string,
  insertions: number,
  deletions: number,
  mode: number,
): DiffEntry {
  const newFile = diff.trim() ? isNewFileDiff(diff) : false;
  const tooLarge = insertions + deletions > LARGE_DIFF_THRESHOLD;
  return {
    filePath,
    staged,
    rawDiff: diff,
    diffFile: !tooLarge && diff.trim() && !newFile ? parseDiffFile(diff, mode) : null,
    isNewFile: newFile,
    plainContent: !tooLarge && newFile ? extractPlainContent(diff) : null,
    loading: false,
    tooLarge,
    insertions,
    deletions,
  };
}

function skeletonEntry(
  filePath: string,
  staged: boolean,
  insertions: number,
  deletions: number,
): DiffEntry {
  return {
    filePath,
    staged,
    rawDiff: "",
    diffFile: null,
    isNewFile: false,
    plainContent: null,
    loading: true,
    tooLarge: false,
    insertions,
    deletions,
  };
}

function FileHeader(props: { entry: DiffEntry }) {
  const { entry } = props;
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5 text-xs">
      <span className={entry.isNewFile || entry.staged ? "text-success" : "text-warning"}>
        {entry.isNewFile ? "new" : entry.staged ? "staged" : "unstaged"}
      </span>
      <span className="font-medium text-foreground">{entry.filePath}</span>
    </div>
  );
}

function DiffSection(props: { entry: DiffEntry; mode: number; theme: "light" | "dark" }) {
  const { entry, mode, theme } = props;

  if (entry.tooLarge) {
    return (
      <div className="overflow-hidden rounded border border-border">
        <FileHeader entry={entry} />
        <div className="px-4 py-3 text-xs text-muted">
          Large diff not rendered ({(entry.insertions + entry.deletions).toLocaleString()} lines
          changed)
        </div>
      </div>
    );
  }

  if (entry.isNewFile && entry.plainContent != null) {
    const lines = entry.plainContent.split("\n");
    return (
      <div className="overflow-hidden rounded border border-border">
        <FileHeader entry={entry} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-xs leading-[1.6]">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="hover:bg-white/[0.02]">
                  <td className="w-[1%] select-none whitespace-nowrap border-r border-border px-3 text-right text-muted/40">
                    {i + 1}
                  </td>
                  <td className="whitespace-pre px-3">{line}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!entry.diffFile) {
    return (
      <div className="rounded border border-border px-4 py-3 text-xs text-muted">
        No diff available for {entry.filePath}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded border border-border">
      <FileHeader entry={entry} />
      <DiffView
        diffFile={entry.diffFile}
        diffViewMode={mode}
        diffViewTheme={theme}
        diffViewFontSize={12}
        diffViewHighlight={false}
        diffViewWrap={false}
      />
    </div>
  );
}

function estimateHeight(insertions: number, deletions: number): number {
  return Math.max(60, (insertions + deletions) * 20 + 36);
}

function DiffPlaceholder(props: { entry: DiffEntry }) {
  const { entry } = props;
  const h = estimateHeight(entry.insertions, entry.deletions);
  return (
    <div className="overflow-hidden rounded border border-border">
      <FileHeader entry={entry} />
      <div className="flex items-center justify-center text-xs text-muted/40" style={{ height: h }}>
        {entry.loading ? <div className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" /> : null}
      </div>
    </div>
  );
}

function LazyDiffSection(props: {
  entry: DiffEntry;
  mode: number;
  theme: "light" | "dark";
  scrollRoot: HTMLElement | null;
}) {
  const { entry, mode, theme, scrollRoot } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !scrollRoot) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: scrollRoot, rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRoot]);

  return (
    <div ref={ref}>
      {visible && !entry.loading ? (
        <DiffSection entry={entry} mode={mode} theme={theme} />
      ) : (
        <DiffPlaceholder entry={entry} />
      )}
    </div>
  );
}

/** Overlay that shows a single file diff on top of the all-files view */
function SingleFileDiff(props: {
  project: Project;
  filePath: string;
  staged: boolean;
  diffMode: number;
}) {
  const { project, filePath, staged, diffMode } = props;
  const theme = useDiffTheme();
  const [entry, setEntry] = useState<DiffEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const diffModeRef = useRef(diffMode);
  diffModeRef.current = diffMode;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEntry(null);

    async function load() {
      try {
        const result = await readBridge().getGitDiff({
          projectLocation: project.location,
          filePath,
          staged,
        });
        if (cancelled) return;
        setEntry(buildEntry(filePath, staged, result.diff, 0, 0, diffModeRef.current));
      } catch {
        if (!cancelled) setEntry(null);
      }
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [filePath, staged, project.id, project.location]);

  // Re-parse on mode change
  const prevModeRef = useRef(diffMode);
  useEffect(() => {
    if (prevModeRef.current === diffMode) return;
    prevModeRef.current = diffMode;

    setEntry((prev) => {
      if (!prev || prev.isNewFile || prev.tooLarge || !prev.rawDiff.trim()) return prev;
      return { ...prev, diffFile: parseDiffFile(prev.rawDiff, diffMode) };
    });
  }, [diffMode]);

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-background px-4">
      {loading && (
        <div className="flex items-center justify-center py-8 text-sm text-muted">
          Loading diff...
        </div>
      )}
      {!loading && !entry && (
        <div className="flex items-center justify-center py-8 text-sm text-muted">
          No changes to display
        </div>
      )}
      {entry && (
        <div className="space-y-4">
          <DiffSection entry={entry} mode={diffMode} theme={theme} />
        </div>
      )}
    </div>
  );
}

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const statusKeyRef = useRef<string | null>(null);
  const diffModeRef = useRef(diffMode);
  diffModeRef.current = diffMode;

  // Load all-files batch diff (independent of selectedFile)
  useEffect(() => {
    let cancelled = false;

    async function loadDiffs() {
      setLoading(true);

      if (!gitStatus?.isRepo) {
        if (!cancelled) {
          statusKeyRef.current = buildGitStatusKey(gitStatus);
          setEntries([]);
          setLoading(false);
        }
        return;
      }

      const statusKey = buildGitStatusKey(gitStatus);
      if (statusKeyRef.current === statusKey) {
        setLoading(false);
        return;
      }

      const skeletons = [
        ...gitStatus.staged.map((f) => skeletonEntry(f.path, true, f.insertions, f.deletions)),
        ...gitStatus.unstaged.map((f) => skeletonEntry(f.path, false, f.insertions, f.deletions)),
      ];
      if (!cancelled) setEntries(skeletons);

      const untrackedPaths = gitStatus.unstaged.filter((f) => f.status === "?").map((f) => f.path);

      try {
        const batch = await readBridge().getGitDiffBatch({
          projectLocation: project.location,
          untrackedPaths,
        });
        if (cancelled) return;

        const populated: DiffEntry[] = [
          ...gitStatus.staged.map((f) =>
            buildEntry(
              f.path,
              true,
              batch.staged[f.path] ?? "",
              f.insertions,
              f.deletions,
              diffModeRef.current,
            ),
          ),
          ...gitStatus.unstaged.map((f) =>
            buildEntry(
              f.path,
              false,
              batch.unstaged[f.path] ?? "",
              f.insertions,
              f.deletions,
              diffModeRef.current,
            ),
          ),
        ];
        if (!cancelled) {
          statusKeyRef.current = statusKey;
          setEntries(populated);
        }
      } catch {
        if (!cancelled) {
          setEntries((prev) => prev.map((e) => ({ ...e, loading: false })));
        }
      }

      if (!cancelled) setLoading(false);
    }

    void loadDiffs();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, project.location, gitStatus]);

  // Re-parse diff lines when the view mode changes (no re-fetch needed)
  const prevModeRef = useRef(diffMode);
  useEffect(() => {
    if (prevModeRef.current === diffMode) return;
    prevModeRef.current = diffMode;

    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.loading || entry.isNewFile || entry.tooLarge || !entry.rawDiff.trim())
          return entry;
        return {
          ...entry,
          diffFile: parseDiffFile(entry.rawDiff, diffMode),
        };
      }),
    );
  }, [diffMode]);

  if (!gitStatus?.isRepo) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Not a git repository
      </div>
    );
  }

  const filtered =
    diffFilter === "staged" ? entries.filter((e) => e.staged) : entries.filter((e) => !e.staged);

  return (
    <div className="relative h-full min-h-0">
      {/* All-files view — always mounted */}
      <div ref={scrollRef} className="h-full min-h-0 overflow-y-auto px-4">
        {filtered.length === 0 && !loading && (
          <div className="flex items-center justify-center py-8 text-sm text-muted">
            {diffFilter === "staged" ? "No staged changes" : "No changes to display"}
          </div>
        )}
        <div className="space-y-4">
          {filtered.map((entry) => (
            <LazyDiffSection
              key={`${entry.staged ? "s" : "u"}:${entry.filePath}`}
              entry={entry}
              mode={diffMode}
              theme={theme}
              scrollRoot={scrollRef.current}
            />
          ))}
        </div>
      </div>

      {/* Single-file overlay — renders on top, all-files stays mounted underneath */}
      {selectedFile && (
        <SingleFileDiff
          project={project}
          filePath={selectedFile}
          staged={selectedStaged}
          diffMode={diffMode}
        />
      )}
    </div>
  );
}
