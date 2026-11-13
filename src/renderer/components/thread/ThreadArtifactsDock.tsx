import { useState } from "react";
import { toast } from "@heroui/react";
import { ExternalLink, FileText } from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common/Button";
import { useAppStore } from "@/renderer/state/appStore";
import { buildFileEditorContext, openFileInEditor } from "@/renderer/utils/gitHelpers";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { createChatPaneFileActions } from "./ChatPane/chatPaneFileActions";
import type { ThreadArtifact } from "./threadArtifacts";
import { ThreadDockCollapseButton, ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

const COLLAPSED_ARTIFACTS_COUNT = 5;

/**
 * Right-panel "Files & artifacts" section: non-media file attachments and
 * generated/cited output files from the thread, newest first. Shows up to 5
 * items by default with a toggle when more exist.
 */
export function ThreadArtifactsDock({
  artifacts,
  threadId,
}: {
  artifacts: readonly ThreadArtifact[];
  threadId?: string | undefined;
}) {
  const { t } = useLingui();
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (artifacts.length === 0) return null;

  const hidden = Math.max(0, artifacts.length - COLLAPSED_ARTIFACTS_COUNT);
  const visibleArtifacts = expanded ? artifacts : artifacts.slice(0, COLLAPSED_ARTIFACTS_COUNT);

  function openArtifact(artifact: ThreadArtifact) {
    if (artifact.external) {
      openExternalWithFeedback(artifact.target);
      return;
    }
    const state = useAppStore.getState();
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    const project = state.projects.find((candidate) => candidate.id === thread?.projectId);
    if (!thread || !project) return;
    const context = buildFileEditorContext(project, thread.worktreePath, thread.worktreeBranch);
    const actions = createChatPaneFileActions({
      project,
      targetContext: context,
      worktreePath: thread.worktreePath,
      branch: thread.worktreeBranch,
      onOpenProjectRelativePath: (path, line) => {
        void openFileInEditor(project, thread.worktreePath, thread.worktreeBranch, path, line);
      },
    });
    void actions.openProjectRelativePath?.(artifact.target).catch(() => {
      toast.danger(t`Unable to open the file in the editor`);
    });
  }

  return (
    <ThreadDockSection
      placement="right"
      collapsed={collapsed}
      ariaLabel={t`Files & artifacts`}
      className="min-w-0 [&[data-placement='right']]:h-auto"
    >
      <div data-artifacts-dock="true" className="min-w-0">
        <ThreadDockHeader
          icon={FileText}
          title={t`Files & artifacts`}
          collapse={{ collapsed, onToggle: () => setCollapsed(!collapsed) }}
          countLabel={
            <span className="[font-variant-numeric:tabular-nums]">{artifacts.length}</span>
          }
          actions={
            <ThreadDockCollapseButton
              collapsed={collapsed}
              label={collapsed ? t`Expand files & artifacts` : t`Collapse files & artifacts`}
              onPress={() => setCollapsed(!collapsed)}
            />
          }
        />
        {!collapsed ? (
          <div className="px-1 pb-1">
            <ul className="space-y-0.5">
              {visibleArtifacts.map((artifact) => (
                <li key={artifact.target} title={artifact.target}>
                  <Button
                    variant="ghost"
                    className="h-auto w-full min-w-0 justify-start gap-2 px-2 py-1.5 text-left text-xs"
                    onPress={() => openArtifact(artifact)}
                  >
                    {artifact.external ? (
                      <ExternalLink className="size-3.5 shrink-0 text-muted" />
                    ) : (
                      <FileText className="size-3.5 shrink-0 text-muted" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{artifact.name}</span>
                      <span className="block truncate text-[0.6875rem] text-muted">
                        {artifact.target}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
            {hidden > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={expanded}
                className="mt-0.5 h-7 w-full justify-start px-2 text-[11px] font-medium text-muted hover:text-foreground"
                onPress={() => setExpanded((current) => !current)}
              >
                {expanded ? (
                  <Trans>Show fewer</Trans>
                ) : (
                  <Plural value={hidden} other="Show # more" />
                )}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ThreadDockSection>
  );
}
