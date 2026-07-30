import { useState } from "react";
import { ChevronDown, ChevronRight, FileEdit, Plus } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { GitFileChange, Project } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import { FileIcon, FileStatusBadge, PathDisplay } from "@/renderer/components/common";
import { compareFilesByDirThenName, openFileInEditor } from "@/renderer/utils/gitHelpers";
import { handleKeyActivate } from "@/renderer/utils/a11y";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { useGitReviewRowPadX } from "../gitReviewPadXContext";
import { useGitTouch } from "../gitTouchContext";
import { ConflictFileCard } from "./ConflictFileCard";
import { reconcileStagingStatus } from "./reconcileStagingStatus";
import { VirtualizedFileRows } from "./VirtualizedFileRows";

const COMPOSER_FILE_DRAG_TYPE = "application/poracode-composer-file";

export function ConflictGroup(props: {
  files: GitFileChange[];
  project: Project;
  selectedFile: string | null;
  worktreePath: string | undefined;
  worktreeBranch: string | undefined;
  onSelectFile: (path: string, staged: boolean) => void;
  onRefresh: () => void;
  storeKey: string;
  isWorktree: boolean;
  mode?: "overlay" | "panel";
  diffTheme?: "light" | "dark";
  wrapLines?: boolean;
  scrollElement: HTMLDivElement | null;
  scrollContentElement: HTMLDivElement | null;
}) {
  const {
    files,
    project,
    selectedFile,
    worktreePath,
    worktreeBranch,
    onSelectFile,
    onRefresh,
    storeKey,
    isWorktree,
    mode,
    diffTheme,
    wrapLines,
    scrollElement,
    scrollContentElement,
  } = props;
  const rowPadX = useGitReviewRowPadX();
  const [expanded, setExpanded] = useState(true);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set());
  const touch = useGitTouch();
  const inlineDiffs = mode === "panel";

  const handleOpenInEditor = (path: string) =>
    openFileInEditor(project, worktreePath, worktreeBranch, path);

  async function handleStageConflict(path: string) {
    useGitStore.getState().optimisticStageFile(storeKey, path, isWorktree);
    await readBridge()
      .gitStage({ projectLocation: project.location, filePath: path })
      .then(
        () => reconcileStagingStatus({ projectLocation: project.location, storeKey, isWorktree }),
        () => onRefresh(),
      );
  }

  const sorted = files.toSorted(compareFilesByDirThenName);

  const totalInsertions = files.reduce((s, f) => s + f.insertions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  return (
    <div>
      <div
        className={`flex w-full items-center gap-1 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted ${rowPadX}`}
      >
        <button
          type="button"
          className="flex cursor-default items-center gap-1"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <Trans>Conflicts</Trans>
          <span className="font-normal text-muted/60">({files.length})</span>
        </button>
        <span className="ml-auto mr-1.5 flex items-center gap-0.5 text-[10px] leading-4 font-medium font-normal">
          {totalInsertions > 0 && <span className="text-success">+{totalInsertions}</span>}
          {totalDeletions > 0 && <span className="text-danger">-{totalDeletions}</span>}
        </span>
      </div>
      {expanded && (
        <VirtualizedFileRows
          items={sorted}
          getKey={(file) => file.path}
          scrollElement={scrollElement}
          scrollContentElement={scrollContentElement}
          estimateSize={touch ? 44 : 24}
          gap={inlineDiffs ? 0 : 1}
          divided={inlineDiffs}
          persistentKeys={expandedFiles}
          renderItem={(file) =>
            inlineDiffs ? (
              <ConflictFileCard
                file={file}
                project={project}
                worktreePath={worktreePath}
                worktreeBranch={worktreeBranch}
                onRefresh={onRefresh}
                storeKey={storeKey}
                isWorktree={isWorktree}
                theme={diffTheme ?? "dark"}
                wrapLines={wrapLines ?? false}
                isExpanded={expandedFiles.has(file.path)}
                onExpandedChange={(isExpanded) => {
                  setExpandedFiles((current) => {
                    const next = new Set(current);
                    if (isExpanded) next.add(file.path);
                    else next.delete(file.path);
                    return next;
                  });
                }}
              />
            ) : (
              <ConflictFileRow
                file={file}
                isSelected={selectedFile === file.path}
                onSelect={() => onSelectFile(file.path, false)}
                onStage={() => void handleStageConflict(file.path)}
                onOpenInEditor={() => void handleOpenInEditor(file.path)}
              />
            )
          }
        />
      )}
    </div>
  );
}

/**
 * A single conflicted-file row. On touch the whole row is press-and-hold to
 * open the git action sheet (matching the other mobile lists); on the desktop
 * it keeps the hover Stage / Open-in-editor affordances.
 */
function ConflictFileRow(props: {
  file: GitFileChange;
  isSelected: boolean;
  onSelect: () => void;
  onStage: () => void;
  onOpenInEditor: () => void;
}) {
  const { file, isSelected, onSelect, onStage, onOpenInEditor } = props;
  const { t } = useLingui();
  const rowPadX = useGitReviewRowPadX();
  const touch = useGitTouch();
  const openMenu = () =>
    touch?.openFileMenu({
      path: file.path,
      staged: file.staged,
      status: file.status,
      insertions: file.insertions,
      deletions: file.deletions,
    });
  const longPressHandlers = useLongPress(touch ? openMenu : null);

  return (
    <button
      type="button"
      draggable={!touch}
      className={`group flex w-full cursor-default items-center gap-1.5 rounded text-left transition-colors ${rowPadX} ${
        touch ? "min-h-[2.75rem] py-2 text-sm" : "py-1 text-xs"
      } ${
        isSelected
          ? "bg-[var(--row-active)] text-foreground"
          : touch
            ? "text-muted active:bg-[var(--row-hover)]"
            : "text-muted hover:bg-[var(--row-hover)] hover:text-foreground"
      }`}
      onClick={onSelect}
      {...longPressHandlers}
      onDragStart={(event) => {
        event.dataTransfer.setData(
          COMPOSER_FILE_DRAG_TYPE,
          JSON.stringify({ path: file.path, type: "file" }),
        );
        event.dataTransfer.effectAllowed = "copy";
      }}
    >
      <FileIcon path={file.path} />
      <PathDisplay
        path={file.path}
        measureOverflow={false}
        className="flex-1"
        trailing={<FileStatusBadge status={file.status} />}
      />
      {touch ? (
        <span className="flex shrink-0 items-center justify-end text-[11px] leading-4 font-medium tabular-nums">
          {file.insertions > 0 && <span className="text-success">+{file.insertions}</span>}
          {file.deletions > 0 && <span className="ml-0.5 text-danger">-{file.deletions}</span>}
        </span>
      ) : (
        <span className="relative w-14 shrink-0">
          <span className="flex items-center justify-end text-[10px] leading-4 font-medium transition-opacity group-hover:opacity-0">
            {file.insertions > 0 && <span className="text-success">+{file.insertions}</span>}
            {file.deletions > 0 && <span className="ml-0.5 text-danger">-{file.deletions}</span>}
          </span>
          <span className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <div
              role="button"
              tabIndex={0}
              className="rounded p-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
              title={t`Stage`}
              onClick={(e) => {
                e.stopPropagation();
                onStage();
              }}
              onKeyDown={(e) => handleKeyActivate(e, onStage, { stopPropagation: true })}
            >
              <Plus className="size-3" />
            </div>
            <div
              role="button"
              tabIndex={0}
              className="rounded p-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
              title={t`Open in editor`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenInEditor();
              }}
              onKeyDown={(e) => handleKeyActivate(e, onOpenInEditor, { stopPropagation: true })}
            >
              <FileEdit className="size-3" />
            </div>
          </span>
        </span>
      )}
    </button>
  );
}
