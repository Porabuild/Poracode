import { useEffect, useRef, useState } from "react";
import { DiffFile, DiffView, highlighter, setEnableFastDiffTemplate } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";

setEnableFastDiffTemplate(true);

import { PathDisplay, PixelLoader } from "@/renderer/components/common";
import {
  ChevronDown,
  ChevronRight,
  CircleMinus,
  CirclePlus,
  FileEdit,
  Lock,
  Minus,
  Plus,
  Undo2,
} from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { GitFileChange, Project } from "@/shared/contracts";
import { isLockFile } from "@/shared/gitUtils";
import { getFileIconUrl } from "@/renderer/components/common/fileIcons";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import { buildInWorker, diffFileFromBundle, extractDiffNames, getLang } from "./diffBuildClient";
import { handleKeyActivate } from "@/renderer/utils/a11y";
import { openFileInEditor } from "@/renderer/utils/gitHelpers";
import { ConfirmDialog } from "@/renderer/components/common/ConfirmDialog";
import { useGitReviewRowPadX } from "./GitReviewSidebar/gitReviewPadXContext";
import { reconcileStagingStatus } from "./GitReviewSidebar/parts/reconcileStagingStatus";

// ── Helpers ──────────────────────────────────────────────────

const LARGE_DIFF_THRESHOLD = 500;
const COMPOSER_FILE_DRAG_TYPE = "application/poracode-composer-file";

function FileIcon(props: { path: string }) {
  const name = props.path.split(/[\\/]/).pop() ?? props.path;
  return <img src={getFileIconUrl(name)} alt="" className="size-4 shrink-0" />;
}

function FileStatusBadge(props: { status: string }) {
  const cls = "ml-1 inline-block size-3 align-[-0.15em]";
  switch (props.status) {
    case "A":
    case "?":
      return <CirclePlus className={`${cls} text-success`} />;
    case "D":
      return <CircleMinus className={`${cls} text-danger`} />;
    default:
      return null;
  }
}

// ── Single file card ─────────────────────────────────────────

export function StackedFileCard(props: {
  file: GitFileChange;
  project: Project;
  theme: "light" | "dark";
  wrapLines: boolean;
  onRefresh: () => void;
  storeKey?: string;
  isWorktree?: boolean;
  worktreePath?: string | undefined;
  worktreeBranch?: string | undefined;
}) {
  const {
    file,
    project,
    theme,
    wrapLines,
    onRefresh,
    storeKey,
    isWorktree,
    worktreePath,
    worktreeBranch,
  } = props;
  const { t } = useLingui();
  const rowPadX = useGitReviewRowPadX();
  const [expanded, setExpanded] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [diffFile, setDiffFile] = useState<DiffFile | null>(null);
  const [loading, setLoading] = useState(false);
  const loadedKeyRef = useRef<string | null>(null);
  const tooLarge = file.insertions + file.deletions > LARGE_DIFF_THRESHOLD;

  // Theme is intentionally excluded from the fetch key — DiffView re-styles without re-fetching.
  const fetchKey = `${file.path}|${file.staged ? "s" : "u"}|${file.status}|${file.insertions}|${file.deletions}`;

  useEffect(() => {
    if (!expanded || tooLarge) return;
    if (loadedKeyRef.current === fetchKey) return;
    loadedKeyRef.current = fetchKey;
    let cancelled = false;

    setLoading(true);

    async function load() {
      try {
        const [result, { oldContent, newContent }] = await Promise.all([
          readBridge().getGitDiff({
            projectLocation: project.location,
            filePath: file.path,
            staged: file.staged,
          }),
          readBridge().getGitFileContent({
            projectLocation: project.location,
            filePath: file.path,
            staged: file.staged,
          }),
        ]);
        if (cancelled) return;

        const rawDiff = result.diff;
        if (!rawDiff.trim()) {
          setLoading(false);
          return;
        }

        const { oldName, newName } = extractDiffNames(rawDiff);
        const fileLang = getLang(newName || file.path);

        const results = await buildInWorker(
          [
            {
              key: `stacked:${file.staged ? "s" : "u"}:${file.path}`,
              diff: rawDiff,
              oldName,
              newName,
              fileLang,
              oldContent,
              newContent,
            },
          ],
          theme,
        );
        if (cancelled) return;

        const r = results[0];
        if (r?.bundle) {
          setDiffFile(diffFileFromBundle(r.data, r.bundle));
        }
      } catch {
        // Diff unavailable
      }
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [expanded, tooLarge, fetchKey, file.path, file.staged, project.location, theme]);

  async function handleStageToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (storeKey) {
      const store = useGitStore.getState();
      if (file.staged) {
        store.optimisticUnstageFile(storeKey, file.path, isWorktree ?? false);
      } else {
        store.optimisticStageFile(storeKey, file.path, isWorktree ?? false);
      }
    }
    if (file.staged) {
      await readBridge()
        .gitUnstage({ projectLocation: project.location, filePath: file.path })
        .then(
          () =>
            storeKey
              ? reconcileStagingStatus({
                  projectLocation: project.location,
                  storeKey,
                  isWorktree: isWorktree ?? false,
                })
              : undefined,
          () => onRefresh(),
        );
    } else {
      await readBridge()
        .gitStage({ projectLocation: project.location, filePath: file.path })
        .then(
          () =>
            storeKey
              ? reconcileStagingStatus({
                  projectLocation: project.location,
                  storeKey,
                  isWorktree: isWorktree ?? false,
                })
              : undefined,
          () => onRefresh(),
        );
    }
  }

  function handleRevertClick(e: React.MouseEvent) {
    e.stopPropagation();
    setRevertOpen(true);
  }

  async function handleRevert() {
    await readBridge().gitRevert({ projectLocation: project.location, filePath: file.path });
    if (storeKey) {
      const status = await readBridge()
        .getGitStatus({ projectLocation: project.location })
        .catch(() => undefined);
      if (status) {
        const store = useGitStore.getState();
        if (isWorktree) store.setWorktreeStatus(storeKey, status);
        else store.setStatus(storeKey, status);
      } else {
        onRefresh();
      }
    } else {
      onRefresh();
    }
    setRevertOpen(false);
  }

  function handleOpenInEditor() {
    void openFileInEditor(project, worktreePath, worktreeBranch, file.path, {
      gitDiff: { staged: file.staged, status: file.status },
    });
  }

  const isNewFile = file.deletions === 0 && file.status !== "M" && file.status !== "D";

  return (
    <>
      <div className="min-w-0">
        {/* File header */}
        <div
          role="button"
          tabIndex={0}
          draggable
          className={`sticky top-0 z-10 bg-[var(--content-background)] group flex cursor-pointer select-none items-center gap-1.5 py-1 text-xs transition-colors hover:bg-content2 ${rowPadX}`}
          onClick={() => setExpanded((v) => !v)}
          onDragStart={(event) => {
            event.dataTransfer.setData(
              COMPOSER_FILE_DRAG_TYPE,
              JSON.stringify({ path: file.path, type: "file" }),
            );
            event.dataTransfer.effectAllowed = "copy";
          }}
          onKeyDown={(e) => handleKeyActivate(e, () => setExpanded((v) => !v))}
        >
          {expanded ? (
            <ChevronDown className="size-3 shrink-0 text-muted" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted" />
          )}
          <FileIcon path={file.path} />
          <PathDisplay
            path={file.path}
            className="flex-1"
            basenameClassName="font-medium text-foreground"
            trailing={
              <>
                {isLockFile(file.path) && (
                  <Lock className="ml-1 inline-block size-2 shrink-0 text-muted/40" />
                )}
                <FileStatusBadge status={file.status} />
              </>
            }
          />
          <span className="relative w-14 shrink-0">
            {/* Stats — visible when not hovering */}
            <span className="flex items-center justify-end text-[10px] leading-4 font-medium transition-opacity group-hover:opacity-0">
              {file.insertions > 0 && <span className="text-success">+{file.insertions}</span>}
              {file.deletions > 0 && <span className="ml-0.5 text-danger">-{file.deletions}</span>}
            </span>
            {/* Action buttons — visible on hover */}
            <span className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <div
                role="button"
                tabIndex={0}
                className="rounded p-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
                title={t`Open in editor`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenInEditor();
                }}
                onKeyDown={(e) =>
                  handleKeyActivate(e, handleOpenInEditor, { stopPropagation: true })
                }
              >
                <FileEdit className="size-3" />
              </div>
              <div
                role="button"
                tabIndex={0}
                className="rounded p-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
                title={file.staged ? t`Unstage` : t`Stage`}
                onClick={(event) => void handleStageToggle(event)}
                onKeyDown={(e) =>
                  handleKeyActivate(
                    e,
                    () => void handleStageToggle(e as unknown as React.MouseEvent),
                    { stopPropagation: true },
                  )
                }
              >
                {file.staged ? <Minus className="size-3" /> : <Plus className="size-3" />}
              </div>
              {!file.staged && (
                <div
                  role="button"
                  tabIndex={0}
                  className="rounded p-0.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  title={t`Revert changes`}
                  onClick={handleRevertClick}
                  onKeyDown={(e) =>
                    handleKeyActivate(e, () => setRevertOpen(true), { stopPropagation: true })
                  }
                >
                  <Undo2 className="size-3" />
                </div>
              )}
            </span>
          </span>
        </div>

        {/* Diff content */}
        {expanded && (
          <div className="border-t border-border">
            {loading && (
              <div className="flex items-center justify-center py-6">
                <PixelLoader size="md" />
              </div>
            )}
            {!loading && tooLarge && (
              <div className="px-4 py-3 text-xs text-muted">
                <Trans>
                  File too large to display (
                  <Plural
                    value={file.insertions + file.deletions}
                    one="# line changed"
                    other="# lines changed"
                  />
                  )
                </Trans>
              </div>
            )}
            {!loading && !tooLarge && !diffFile && loadedKeyRef.current !== null && (
              <div className="px-4 py-3 text-xs text-muted">
                <Trans>No changes to display</Trans>
              </div>
            )}
            {diffFile && (
              <div className={isNewFile ? "diff-new-file" : undefined}>
                <DiffView
                  diffFile={diffFile}
                  diffViewMode={4}
                  diffViewTheme={theme}
                  diffViewFontSize={12}
                  registerHighlighter={highlighter}
                  diffViewHighlight={true}
                  diffViewWrap={wrapLines}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={revertOpen}
        title={t`Revert changes`}
        body={
          <Trans>
            Are you sure you want to revert <strong>{file.path}</strong>? This cannot be undone.
          </Trans>
        }
        confirmLabel={t`Revert`}
        onConfirm={() => void handleRevert()}
        onClose={() => setRevertOpen(false)}
      />
    </>
  );
}
