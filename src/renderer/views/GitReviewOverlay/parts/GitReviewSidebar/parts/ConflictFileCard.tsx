import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileEdit, Plus } from "lucide-react";
import { DiffFile, DiffView, highlighter } from "@git-diff-view/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { GitFileChange, Project } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";
import { FileIcon, FileStatusBadge, PathDisplay, PixelLoader } from "@/renderer/components/common";
import { openFileInEditor } from "@/renderer/utils/gitHelpers";
import { handleKeyActivate } from "@/renderer/utils/a11y";
import {
  buildInWorker,
  diffFileFromBundle,
  extractDiffNames,
  getLang,
} from "../../diffBuildClient";
import { useGitReviewRowPadX } from "../gitReviewPadXContext";
import { reconcileStagingStatus } from "./reconcileStagingStatus";

const LARGE_DIFF_THRESHOLD = 500;
const COMPOSER_FILE_DRAG_TYPE = "application/poracode-composer-file";

export function ConflictFileCard(props: {
  file: GitFileChange;
  project: Project;
  worktreePath: string | undefined;
  worktreeBranch: string | undefined;
  onRefresh: () => void;
  storeKey: string;
  isWorktree: boolean;
  theme: "light" | "dark";
  wrapLines: boolean;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
}) {
  const {
    file,
    project,
    worktreePath,
    worktreeBranch,
    onRefresh,
    storeKey,
    isWorktree,
    theme,
    wrapLines,
    isExpanded,
    onExpandedChange,
  } = props;
  const { t } = useLingui();
  const rowPadX = useGitReviewRowPadX();
  const [diffFile, setDiffFile] = useState<DiffFile | null>(null);
  const [loading, setLoading] = useState(false);
  const loadedKeyRef = useRef<string | null>(null);
  const tooLarge = file.insertions + file.deletions > LARGE_DIFF_THRESHOLD;

  const fetchKey = `${file.path}|${file.insertions}|${file.deletions}`;

  useEffect(() => {
    if (!isExpanded || tooLarge) return;
    if (loadedKeyRef.current === fetchKey) return;
    loadedKeyRef.current = fetchKey;
    let cancelled = false;

    setLoading(true);

    async function load() {
      try {
        const result = await readBridge().getGitDiff({
          projectLocation: project.location,
          filePath: file.path,
          staged: false,
        });
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
              key: `conflict:${file.path}`,
              diff: rawDiff,
              oldName,
              newName,
              fileLang,
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
  }, [isExpanded, tooLarge, fetchKey, file.path, project.location, theme]);

  function handleOpenInEditor(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    void openFileInEditor(project, worktreePath, worktreeBranch, file.path);
  }

  async function handleStageConflict(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    useGitStore.getState().optimisticStageFile(storeKey, file.path, isWorktree);
    await readBridge()
      .gitStage({ projectLocation: project.location, filePath: file.path })
      .then(
        () => reconcileStagingStatus({ projectLocation: project.location, storeKey, isWorktree }),
        () => onRefresh(),
      );
  }

  return (
    <div className="min-w-0">
      <div
        role="button"
        tabIndex={0}
        draggable
        className={`${isExpanded ? "sticky top-0 z-10" : ""} group flex cursor-pointer select-none items-center gap-1.5 bg-[var(--content-background)] py-1 text-xs transition-colors hover:bg-content2 ${rowPadX}`}
        onClick={() => onExpandedChange(!isExpanded)}
        onDragStart={(event) => {
          event.dataTransfer.setData(
            COMPOSER_FILE_DRAG_TYPE,
            JSON.stringify({ path: file.path, type: "file" }),
          );
          event.dataTransfer.effectAllowed = "copy";
        }}
        onKeyDown={(e) => handleKeyActivate(e, () => onExpandedChange(!isExpanded))}
      >
        {isExpanded ? (
          <ChevronDown className="size-3 shrink-0 text-muted" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted" />
        )}
        <FileIcon path={file.path} />
        <PathDisplay
          path={file.path}
          measureOverflow={false}
          className="flex-1"
          basenameClassName="font-medium text-foreground"
          trailing={<FileStatusBadge status={file.status} />}
        />
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
              onClick={(event) => void handleStageConflict(event)}
              onKeyDown={(e) =>
                handleKeyActivate(e, () => void handleStageConflict(e), { stopPropagation: true })
              }
            >
              <Plus className="size-3" />
            </div>
            <div
              role="button"
              tabIndex={0}
              className="rounded p-0.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
              title={t`Open in editor`}
              onClick={handleOpenInEditor}
              onKeyDown={(e) =>
                handleKeyActivate(e, () => handleOpenInEditor(e), { stopPropagation: true })
              }
            >
              <FileEdit className="size-3" />
            </div>
          </span>
        </span>
      </div>

      {isExpanded && (
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
            <DiffView
              diffFile={diffFile}
              diffViewMode={4}
              diffViewTheme={theme}
              diffViewFontSize={12}
              registerHighlighter={highlighter}
              diffViewHighlight={true}
              diffViewWrap={wrapLines}
            />
          )}
        </div>
      )}
    </div>
  );
}
