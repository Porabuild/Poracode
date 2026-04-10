import { useEffect, useRef, useState } from "react";
import { DiffFile, DiffView, highlighter, getLang, setEnableFastDiffTemplate } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";

// Must match worker setting — enables pre-rendered HTML templates (dangerouslySetInnerHTML)
setEnableFastDiffTemplate(true);
import { Spinner } from "@heroui/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Project, GitStatusResult } from "../../../shared/contracts";
import type { DiffBuildItem, DiffBuildRequest, DiffBuildResponse } from "../../workers/diffBuildWorker";

// Suppress noisy dev-only warnings from @git-diff-view/core
{
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("@git-diff-view/core")) return;
    origWarn.apply(console, args);
  };
}
import { readBridge } from "../../bridge";
import { useSharedSettings } from "../../state/sharedSettingsStore";

// ── Worker singleton ─────────────────────────────────────────

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (results: DiffBuildResponse["results"]) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../../workers/diffBuildWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<DiffBuildResponse>) => {
      const resolve = pending.get(e.data.id);
      if (resolve) {
        pending.delete(e.data.id);
        resolve(e.data.results);
      }
    };
  }
  return worker;
}

function buildInWorker(items: DiffBuildItem[], theme?: "light" | "dark"): Promise<DiffBuildResponse["results"]> {
  // Fallback to main-thread building when Worker is unavailable (e.g. tests)
  if (typeof Worker === "undefined") {
    return Promise.resolve(
      items.map((item) => {
        const data = {
          newFile: { fileName: item.newName, fileLang: item.fileLang, content: item.newContent ?? null },
          hunks: [item.diff],
        };
        if (!item.diff.trim()) return { key: item.key, data, bundle: null };
        try {
          const instance = DiffFile.createInstance({
            oldFile: { fileName: item.oldName, fileLang: item.fileLang, content: item.oldContent ?? null },
            ...data,
          });
          instance.initTheme(theme ?? "dark");
          instance.initRaw();
          instance.initSyntax({ registerHighlighter: highlighter });
          instance.buildSplitDiffLines();
          instance.buildUnifiedDiffLines();
          const bundle = instance._getFullBundle();
          instance.clear();
          return { key: item.key, data, bundle };
        } catch {
          return { key: item.key, data, bundle: null };
        }
      }),
    );
  }
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    getWorker().postMessage({ id, items, theme: theme ?? "dark" } satisfies DiffBuildRequest);
  });
}

/** Reconstruct a DiffFile on the main thread from a worker-built full bundle. No parsing. */
function diffFileFromBundle(
  data: DiffBuildResponse["results"][number]["data"],
  bundle: ReturnType<DiffFile["_getFullBundle"]>,
): DiffFile {
  return DiffFile.createInstance(data, bundle);
}

// ── Helpers ──────────────────────────────────────────────────

function useDiffTheme(): "light" | "dark" {
  const themeMode = useSharedSettings((s) => s.themeMode);
  if (themeMode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return themeMode;
}

/** Skip rendering diffs larger than this many lines changed */
const LARGE_DIFF_THRESHOLD = 5000;

interface DiffEntry {
  filePath: string;
  staged: boolean;
  rawDiff: string;
  oldName: string;
  newName: string;
  fileLang: string;
  diffFile: DiffFile | null;
  loading: boolean;
  tooLarge: boolean;
  insertions: number;
  deletions: number;
}

function entryKey(e: { staged: boolean; filePath: string }): string {
  return `${e.staged ? "s" : "u"}:${e.filePath}`;
}

function normalizeDiffLookupPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function getBatchDiff(section: Record<string, string>, filePath: string): string {
  return section[filePath] ?? section[normalizeDiffLookupPath(filePath)] ?? "";
}

function buildGitStatusKey(gitStatus: GitStatusResult | undefined): string {
  if (!gitStatus?.isRepo) {
    return "not-repo";
  }

  const serialize = (entries: GitStatusResult["staged"]) =>
    entries
      .map((entry) =>
        [
          normalizeDiffLookupPath(entry.path),
          entry.oldPath ? normalizeDiffLookupPath(entry.oldPath) : "",
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

function extractDiffNames(raw: string): { oldName: string; newName: string } {
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
  return { oldName, newName };
}

function buildEntry(
  filePath: string,
  staged: boolean,
  diff: string,
  insertions: number,
  deletions: number,
): DiffEntry {
  const tooLarge = insertions + deletions > LARGE_DIFF_THRESHOLD;
  const { oldName, newName } = diff.trim() ? extractDiffNames(diff) : { oldName: "", newName: "" };
  return {
    filePath,
    staged,
    rawDiff: diff,
    oldName,
    newName,
    fileLang: getLang(newName || filePath),
    diffFile: null,
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
    oldName: "",
    newName: "",
    fileLang: "",
    diffFile: null,
    loading: true,
    tooLarge: false,
    insertions,
    deletions,
  };
}

// ── Components ───────────────────────────────────────────────

function FileHeader(props: {
  entry: DiffEntry;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const { entry, collapsed, onToggleCollapse } = props;
  return (
    <div
      role="button"
      tabIndex={0}
      className="sticky top-0 z-10 flex cursor-pointer select-none items-center gap-2 border-b border-border bg-surface px-3 py-1.5 text-xs"
      onClick={onToggleCollapse}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleCollapse();
        }
      }}
    >
      {collapsed ? (
        <ChevronRight className="size-3 shrink-0 text-muted" />
      ) : (
        <ChevronDown className="size-3 shrink-0 text-muted" />
      )}
      <span className={entry.staged ? "text-success" : "text-warning"}>
        {entry.staged ? "staged" : "unstaged"}
      </span>
      <span className="min-w-0 truncate font-medium text-foreground">{entry.filePath}</span>
      <span className="ml-auto flex shrink-0 gap-2">
        {entry.insertions > 0 && <span className="text-success">+{entry.insertions}</span>}
        {entry.deletions > 0 && <span className="text-danger">-{entry.deletions}</span>}
      </span>
    </div>
  );
}

function DiffSection(props: {
  entry: DiffEntry;
  mode: number;
  theme: "light" | "dark";
  projectLocation: Project["location"];
  mountDelay: number;
  onMounted?: () => void;
}) {
  const { entry, mode, theme, projectLocation, mountDelay, onMounted } = props;
  const [collapsed, setCollapsed] = useState(false);
  const onToggleCollapse = () => setCollapsed((c) => !c);

  // Stagger DiffView mount so files render progressively behind the loader
  const [mounted, setMounted] = useState(mountDelay === 0);
  useEffect(() => {
    if (mounted) {
      onMounted?.();
      return;
    }
    const id = setTimeout(() => setMounted(true), mountDelay);
    return () => clearTimeout(id);
  }, [mounted, mountDelay, onMounted]);

  // DiffFile with full file content (enables hunk expand buttons)
  const [contentDiffFile, setContentDiffFile] = useState<DiffFile | null>(null);
  const activeDiffFile = contentDiffFile ?? entry.diffFile;

  // Load file content once expanded, build DiffFile with content in worker
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
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mounted, entry.filePath, entry.staged, entry.loading, entry.tooLarge, entry.rawDiff, entry.oldName, entry.newName, entry.fileLang, projectLocation]);

  if (entry.loading) {
    return (
      <div className="rounded border border-border">
        <FileHeader entry={entry} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
        <div className="flex h-16 items-center justify-center text-xs text-muted/40">
          <div className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
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
            Large diff not rendered ({(entry.insertions + entry.deletions).toLocaleString()} lines
            changed)
          </div>
        )}
      </div>
    );
  }

  if (!activeDiffFile) {
    return (
      <div className="rounded border border-border px-4 py-3 text-xs text-muted">
        No diff available for {entry.filePath}
      </div>
    );
  }

  return (
    <div className="rounded border border-border">
      <FileHeader entry={entry} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      {mounted ? (
        <div style={collapsed ? { display: "none" } : undefined}>
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
            <div className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
          </div>
        )
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
  const [diffFile, setDiffFile] = useState<DiffFile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDiffFile(null);

    async function load() {
      try {
        const result = await readBridge().getGitDiff({
          projectLocation: project.location,
          filePath,
          staged,
        });
        if (cancelled) return;
        const { oldName, newName } = extractDiffNames(result.diff);
        const results = await buildInWorker([
          {
            key: `single:${filePath}`,
            diff: result.diff,
            oldName,
            newName,
            fileLang: getLang(newName || filePath),
          },
        ]);
        if (cancelled) return;
        const r = results[0];
        if (r?.bundle) setDiffFile(diffFileFromBundle(r.data, r.bundle));
      } catch {
        /* empty */
      }
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [filePath, staged, project.id, project.location]);

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-background px-4">
      {loading && (
        <div className="flex items-center justify-center py-8 text-sm text-muted">
          Loading diff...
        </div>
      )}
      {!loading && !diffFile && (
        <div className="flex items-center justify-center py-8 text-sm text-muted">
          No changes to display
        </div>
      )}
      {diffFile && (
        <div className="space-y-4">
          <div className="rounded border border-border">
            <DiffView
              diffFile={diffFile}
              diffViewMode={diffMode}
              diffViewTheme={theme}
              diffViewFontSize={12}
              diffViewHighlight={true}
              diffViewWrap={false}
            />
          </div>
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
  const [panelReady, setPanelReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const statusKeyRef = useRef<string | null>(null);

  // Load batch diffs, then build DiffFile instances in a Web Worker
  useEffect(() => {
    let cancelled = false;

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
      if (statusKeyRef.current === statusKey) {
        return;
      }

      const isFirstLoad = statusKeyRef.current === null;
      if (isFirstLoad) {
        setLoading(true);
        const skeletons = [
          ...gitStatus.staged.map((f) => skeletonEntry(f.path, true, f.insertions, f.deletions)),
          ...gitStatus.unstaged.map((f) =>
            skeletonEntry(f.path, false, f.insertions, f.deletions),
          ),
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

  if (!gitStatus?.isRepo) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Not a git repository
      </div>
    );
  }

  const filtered =
    diffFilter === "staged" ? entries.filter((e) => e.staged) : entries.filter((e) => !e.staged);

  // Track staggered mount progress — loader hides when last DiffSection mounts
  const mountedCountRef = useRef(0);
  const expectedCountRef = useRef(0);
  const onSectionMounted = () => {
    mountedCountRef.current++;
    if (mountedCountRef.current >= expectedCountRef.current) {
      setTimeout(() => setPanelReady(true), 50);
    }
  };

  // Reset when entries change
  const filteredWithDiffs = filtered.filter((e) => e.diffFile);
  useEffect(() => {
    mountedCountRef.current = 0;
    expectedCountRef.current = filteredWithDiffs.length;
    if (filteredWithDiffs.length === 0) setPanelReady(!loading);
    else setPanelReady(false);
  }, [filteredWithDiffs.length, loading]);

  const showLoader = (loading || !panelReady) && filtered.length > 0;

  return (
    <div className="relative h-full min-h-0">
      {/* Full-panel loader — diffs mount behind it */}
      {showLoader && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background">
          <Spinner size="lg" />
        </div>
      )}

      {/* All-files view */}
      <div ref={scrollRef} className="h-full min-h-0 overflow-y-auto px-4">
        {filtered.length === 0 && !loading && (
          <div className="flex items-center justify-center py-8 text-sm text-muted">
            {diffFilter === "staged" ? "No staged changes" : "No changes to display"}
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

      {/* Single-file overlay */}
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
