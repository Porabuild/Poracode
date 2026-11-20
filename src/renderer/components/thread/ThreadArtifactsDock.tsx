import { useState, type ComponentType } from "react";
import { toast } from "@heroui/react";
import { ExternalLink, FileCode2, FileText } from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common/Button";
import { useAppStore } from "@/renderer/state/appStore";
import { buildFileEditorContext, openFileInEditor } from "@/renderer/utils/gitHelpers";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { createChatPaneFileActions } from "./ChatPane/chatPaneFileActions";
import type { ThreadArtifact } from "./threadArtifacts";
import {
  ThreadDockBody,
  ThreadDockCollapseButton,
  ThreadDockCountBadge,
  ThreadDockHeader,
  ThreadDockSection,
} from "./ThreadDockUI";

const COLLAPSED_ARTIFACTS_COUNT = 5;

function ThreadFileCollectionDock({
  items,
  threadId,
  title,
  icon: Icon,
  rowIcon: RowIcon,
  dataAttr,
}: {
  items: readonly ThreadArtifact[];
  threadId?: string | undefined;
  title: string;
  icon: ComponentType<{ className?: string }>;
  rowIcon: ComponentType<{ className?: string }>;
  dataAttr: "data-files-dock" | "data-artifacts-dock";
}) {
  const { t } = useLingui();
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const label = title;
  const hidden = Math.max(0, items.length - COLLAPSED_ARTIFACTS_COUNT);
  const visibleItems = expanded ? items : items.slice(0, COLLAPSED_ARTIFACTS_COUNT);

  function openItem(item: ThreadArtifact) {
    if (item.external) {
      openExternalWithFeedback(item.target);
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
    void actions.openProjectRelativePath?.(item.target).catch(() => {
      toast.danger(t`Unable to open the file in the editor`);
    });
  }

  return (
    <ThreadDockSection
      placement="right"
      collapsed={collapsed}
      ariaLabel={label}
      className="min-w-0"
    >
      <div {...{ [dataAttr]: "true" }} className="min-w-0">
        <ThreadDockHeader
          icon={Icon}
          title={label}
          collapse={{ collapsed, onToggle: () => setCollapsed(!collapsed) }}
          actions={
            <ThreadDockCollapseButton
              collapsed={collapsed}
              label={collapsed ? t`Expand ${label}` : t`Collapse ${label}`}
              onPress={() => setCollapsed(!collapsed)}
            />
          }
        >
          <ThreadDockCountBadge>{items.length}</ThreadDockCountBadge>
        </ThreadDockHeader>
        {!collapsed ? (
          <ThreadDockBody padding="compact">
            <ul className="space-y-0.5">
              {visibleItems.map((item) => (
                <li key={item.target} title={item.target}>
                  <Button
                    variant="ghost"
                    className="h-auto w-full min-w-0 justify-start gap-2.5 rounded-3xl px-1.5 py-1.5 text-left text-xs"
                    onPress={() => openItem(item)}
                  >
                    {item.external ? (
                      <ExternalLink className="size-3.5 shrink-0 text-muted" />
                    ) : (
                      <RowIcon className="size-3.5 shrink-0 text-muted" />
                    )}
                    <span className="min-w-0 flex-1 space-y-0.5 leading-snug">
                      <span className="block truncate font-medium text-foreground">
                        {item.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted">{item.target}</span>
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
                className="mt-1 h-7 w-full justify-start rounded-3xl px-1.5 text-[11px] font-medium text-muted hover:text-foreground"
                onPress={() => setExpanded((current) => !current)}
              >
                {expanded ? (
                  <Trans>Show fewer</Trans>
                ) : (
                  <Plural value={hidden} other="Show # more" />
                )}
              </Button>
            ) : null}
          </ThreadDockBody>
        ) : null}
      </div>
    </ThreadDockSection>
  );
}

/**
 * Right-panel "Files" card: non-media files provided by the user or generated
 * as deliverables by the agent, newest first.
 */
export function ThreadFilesDock({
  files,
  threadId,
}: {
  files: readonly ThreadArtifact[];
  threadId?: string | undefined;
}) {
  const { t } = useLingui();
  return (
    <ThreadFileCollectionDock
      items={files}
      threadId={threadId}
      title={t`Files`}
      icon={FileText}
      rowIcon={FileText}
      dataAttr="data-files-dock"
    />
  );
}

/**
 * Right-panel "Artifacts" card: workspace files referenced/used by the agent
 * during work, newest first.
 */
export function ThreadArtifactsDock({
  artifacts,
  threadId,
}: {
  artifacts: readonly ThreadArtifact[];
  threadId?: string | undefined;
}) {
  const { t } = useLingui();
  return (
    <ThreadFileCollectionDock
      items={artifacts}
      threadId={threadId}
      title={t`Artifacts`}
      icon={FileCode2}
      rowIcon={FileCode2}
      dataAttr="data-artifacts-dock"
    />
  );
}
