import { useState } from "react";
import { Button, TextArea } from "@heroui/react";
import { DiffView, SplitSide, type DiffFile, type DiffViewProps } from "@git-diff-view/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { parseDraftProjectId } from "@/shared/paneId";
import { useAppStore } from "@/renderer/state/appStore";
import {
  useComposerInputInbox,
  worktreeComposerInboxKey,
} from "@/renderer/state/composerInputInbox";
import { usePanelStore } from "@/renderer/state/panelStore";

type AppState = ReturnType<typeof useAppStore.getState>;

function threadMatchesReview(
  thread: AppState["threads"][number],
  projectId: string,
  worktreePath: string | undefined,
): boolean {
  return thread.projectId === projectId && thread.worktreePath === worktreePath;
}

function composerMatchesReview(
  state: Pick<AppState, "threads">,
  composerId: string,
  projectId: string,
  worktreePath: string | undefined,
): boolean {
  const draftProjectId = parseDraftProjectId(composerId);
  if (draftProjectId) return draftProjectId === projectId && !worktreePath;
  const thread = state.threads.find((candidate) => candidate.id === composerId);
  return thread ? threadMatchesReview(thread, projectId, worktreePath) : false;
}

/** Resolve the matching composer without ever leaking a review comment into another project/worktree. */
export function resolveDiffAnnotationComposerId(
  state: Pick<AppState, "focusedPaneId" | "threads" | "view">,
  projectId: string,
  worktreePath: string | undefined,
  preferredComposerId?: string,
): string {
  if (
    preferredComposerId &&
    composerMatchesReview(state, preferredComposerId, projectId, worktreePath)
  ) {
    return preferredComposerId;
  }

  if (state.view.kind === "draft" && state.view.projectId === projectId && !worktreePath) {
    return `draft:${projectId}`;
  }

  if (state.view.kind === "thread") {
    const matchingPanes = state.view.panes.filter((paneId) =>
      composerMatchesReview(state, paneId, projectId, worktreePath),
    );
    if (state.focusedPaneId && matchingPanes.includes(state.focusedPaneId)) {
      return state.focusedPaneId;
    }
    if (matchingPanes[0]) return matchingPanes[0];
  }

  let backgroundThread: AppState["threads"][number] | undefined;
  for (const thread of state.threads) {
    if (thread.archived || thread.done || !threadMatchesReview(thread, projectId, worktreePath)) {
      continue;
    }
    if (!backgroundThread || thread.updatedAt.localeCompare(backgroundThread.updatedAt) > 0) {
      backgroundThread = thread;
    }
  }
  return (
    backgroundThread?.id ??
    (worktreePath ? worktreeComposerInboxKey(projectId, worktreePath) : `draft:${projectId}`)
  );
}

export function DiffAnnotationEditor(props: {
  filePath: string;
  lineNumber: number;
  onClose: () => void;
  projectId: string;
  side: SplitSide;
  staged: boolean;
  worktreePath: string | undefined;
}) {
  const { filePath, lineNumber, onClose, projectId, side, staged, worktreePath } = props;
  const { t } = useLingui();
  const [body, setBody] = useState("");

  function addComment() {
    if (!body.trim()) return;
    const reviewContext = usePanelStore.getState().gitReviewContext;
    const preferredComposerId =
      reviewContext?.projectId === projectId && reviewContext.worktreePath === worktreePath
        ? reviewContext.originComposerId
        : undefined;
    const composerId = resolveDiffAnnotationComposerId(
      useAppStore.getState(),
      projectId,
      worktreePath,
      preferredComposerId,
    );
    useComposerInputInbox.getState().enqueue(composerId, [
      {
        kind: "diff_comment",
        path: filePath,
        lineNumber,
        side: side === SplitSide.old ? "old" : "new",
        staged,
        body: body.trim(),
      },
    ]);
    onClose();
  }

  return (
    <div className="border-y border-border bg-[var(--content-background)] px-3 py-2 font-sans">
      <TextArea
        aria-label={t`Review comment`}
        className="min-h-20 w-full resize-y text-xs"
        placeholder={t`Leave a comment`}
        rows={3}
        value={body}
        variant="secondary"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            addComment();
          }
        }}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="tertiary" onPress={onClose}>
          <Trans>Cancel</Trans>
        </Button>
        <Button size="sm" isDisabled={!body.trim()} onPress={addComment}>
          <Trans>Comment</Trans>
        </Button>
      </div>
    </div>
  );
}

type AnnotationDiffViewProps = Omit<
  DiffViewProps<never>,
  "diffFile" | "diffViewAddWidget" | "onAddWidgetClick" | "renderWidgetLine"
> & {
  diffFile: DiffFile;
  filePath: string;
  projectId: string;
  staged: boolean;
  worktreePath: string | undefined;
};

export function DiffAnnotationView(props: AnnotationDiffViewProps) {
  const { diffFile, filePath, projectId, staged, worktreePath, ...diffViewProps } = props;
  return (
    <DiffView
      {...diffViewProps}
      diffFile={diffFile}
      diffViewAddWidget
      renderWidgetLine={({ lineNumber, side, onClose }) => (
        <DiffAnnotationEditor
          filePath={filePath}
          lineNumber={lineNumber}
          onClose={onClose}
          projectId={projectId}
          side={side}
          staged={staged}
          worktreePath={worktreePath}
        />
      )}
    />
  );
}
