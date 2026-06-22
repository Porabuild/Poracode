import { useState } from "react";
import { AlertDialog, Button } from "@heroui/react";
import { ChevronDown, ChevronRight, Minus, MoreVertical, Plus, Undo2 } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { GitFileChange, Project } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import { compareFilesByDirThenName } from "@/renderer/utils/gitHelpers";
import { StackedFileCard } from "../../GitStackedDiff";
import { useGitReviewRowPadX } from "../gitReviewPadXContext";
import { useGitTouch } from "../gitTouchContext";
import { FileRow } from "./FileRow";

export function FileGroup(props: {
  title: string;
  count: number;
  staged: boolean;
  files: GitFileChange[];
  project: Project;
  selectedFile: string | null;
  onSelectFile: (path: string, staged: boolean) => void;
  onRefresh: () => void;
  storeKey: string;
  isWorktree: boolean;
  worktreePath: string | undefined;
  worktreeBranch: string | undefined;
  mode?: "overlay" | "panel";
  diffTheme?: "light" | "dark";
  wrapLines?: boolean;
}) {
  const {
    title,
    count,
    staged,
    files,
    project,
    selectedFile,
    onSelectFile,
    onRefresh,
    storeKey,
    isWorktree,
    worktreePath,
    worktreeBranch,
    mode,
    diffTheme,
    wrapLines,
  } = props;
  const { t } = useLingui();
  const rowPadX = useGitReviewRowPadX();
  const touch = useGitTouch();
  const [expanded, setExpanded] = useState(true);
  const [revertAllOpen, setRevertAllOpen] = useState(false);
  const inlineDiffs = mode === "panel";
  const totalInsertions = files.reduce((s, f) => s + f.insertions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  async function handleStageAll() {
    useGitStore.getState().optimisticStageAll(storeKey, isWorktree);
    await readBridge()
      .gitStageAll({ projectLocation: project.location })
      .catch(() => onRefresh());
  }

  async function handleUnstageAll() {
    useGitStore.getState().optimisticUnstageAll(storeKey, isWorktree);
    await readBridge()
      .gitUnstageAll({ projectLocation: project.location })
      .catch(() => onRefresh());
  }

  async function handleRevertAll() {
    await readBridge().gitRevertAll({ projectLocation: project.location });
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
    setRevertAllOpen(false);
  }

  const sorted = files.toSorted(compareFilesByDirThenName);

  return (
    <div>
      <div
        className={`group/header flex w-full items-center gap-1 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted ${rowPadX}`}
      >
        <button
          type="button"
          className="flex cursor-default items-center gap-1"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {title}
          <span className="font-normal text-muted/60">({count})</span>
        </button>
        <span className="ml-auto flex items-center gap-0.5">
          {touch ? (
            <>
              <span className="mr-1 flex items-center gap-0.5 text-[11px] leading-4 font-medium font-normal tabular-nums">
                {totalInsertions > 0 && <span className="text-success">+{totalInsertions}</span>}
                {totalDeletions > 0 && <span className="text-danger">-{totalDeletions}</span>}
              </span>
              <button
                type="button"
                aria-label={`${title} actions`}
                className="rounded p-1 text-muted/70 active:bg-[var(--row-hover)]"
                onClick={() => touch.openGroupMenu({ title, staged })}
              >
                <MoreVertical className="size-4" />
              </button>
            </>
          ) : (
            <>
              <span className="mr-1.5 flex items-center gap-0.5 text-[10px] leading-4 font-medium font-normal group-hover/header:hidden">
                {totalInsertions > 0 && <span className="text-success">+{totalInsertions}</span>}
                {totalDeletions > 0 && <span className="text-danger">-{totalDeletions}</span>}
              </span>
              <span className="hidden items-center gap-0.5 group-hover/header:flex">
                {staged ? (
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
                    title={t`Unstage all`}
                    onClick={() => void handleUnstageAll()}
                  >
                    <Minus className="size-3" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
                      title={t`Stage all`}
                      onClick={() => void handleStageAll()}
                    >
                      <Plus className="size-3" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      title={t`Revert all`}
                      onClick={() => setRevertAllOpen(true)}
                    >
                      <Undo2 className="size-3" />
                    </button>
                  </>
                )}
              </span>
            </>
          )}
        </span>
      </div>

      {!staged && (
        <AlertDialog.Backdrop isOpen={revertAllOpen} onOpenChange={setRevertAllOpen}>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>
                  <Trans>Revert all changes</Trans>
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <Trans>
                  Are you sure you want to revert all unstaged changes? This cannot be undone.
                </Trans>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  <Trans>Cancel</Trans>
                </Button>
                <Button variant="danger" onPress={() => void handleRevertAll()}>
                  <Trans>Revert all</Trans>
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      )}
      {expanded && (
        <div className={inlineDiffs ? "min-w-0 divide-y divide-border" : "space-y-px"}>
          {inlineDiffs
            ? sorted.map((file) => (
                <StackedFileCard
                  key={`${file.staged ? "s" : "u"}:${file.path}`}
                  file={file}
                  project={project}
                  theme={diffTheme ?? "dark"}
                  wrapLines={wrapLines ?? false}
                  onRefresh={onRefresh}
                  storeKey={storeKey}
                  isWorktree={isWorktree}
                  worktreePath={worktreePath}
                  worktreeBranch={worktreeBranch}
                />
              ))
            : sorted.map((file) => (
                <FileRow
                  key={`${file.staged ? "s" : "u"}:${file.path}`}
                  path={file.path}
                  project={project}
                  isSelected={selectedFile === file.path}
                  onSelect={() => onSelectFile(file.path, file.staged)}
                  onRefresh={onRefresh}
                  storeKey={storeKey}
                  isWorktree={isWorktree}
                  worktreePath={worktreePath}
                  worktreeBranch={worktreeBranch}
                />
              ))}
        </div>
      )}
    </div>
  );
}
