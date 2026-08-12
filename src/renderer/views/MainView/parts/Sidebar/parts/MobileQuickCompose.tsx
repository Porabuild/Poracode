import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { startThreadFromDraft } from "@/renderer/actions/threadLaunchActions";
import { FloatingComposerDock } from "@/renderer/components/mobileComposer/FloatingComposerDock";
import { ThreadDraftView } from "@/renderer/components/thread/ThreadDraftView";
import { useDraftEnvironment } from "@/renderer/hooks/uiSelectors";
import { useAppStore } from "@/renderer/state/appStore";

export function MobileQuickCompose(props: { projectId: string }) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const [projectId, setProjectId] = useState(props.projectId);
  const [restoreWorktreeSelectionToken, setRestoreWorktreeSelectionToken] = useState(0);
  const project = useAppStore((state) =>
    state.projects.find((candidate) => candidate.id === projectId),
  );
  const draftEnvironment = useDraftEnvironment(project);

  useEffect(() => {
    if (!expanded) setProjectId(props.projectId);
  }, [expanded, props.projectId]);

  if (!project) return null;

  return (
    <FloatingComposerDock
      keyboardKey={`draft:${project.id}`}
      expanded={expanded}
      focusOnExpand
      scrimLabel={t`Collapse composer`}
      collapsedTapLabel={t`New thread`}
      onExpandedChange={(next) => {
        if (!next) setRestoreWorktreeSelectionToken((token) => token + 1);
        setExpanded(next);
      }}
    >
      <section className="m-draft">
        <ThreadDraftView
          key={project.id}
          project={project}
          agentStatuses={draftEnvironment.agentStatuses}
          isDetectingAgents={draftEnvironment.isDetectingAgents}
          paneCount={1}
          submitOnEnter={false}
          autoFocusComposer={false}
          restoreWorktreeSelectionToken={restoreWorktreeSelectionToken}
          {...(draftEnvironment.pickFiles ? { pickFiles: draftEnvironment.pickFiles } : {})}
          {...(draftEnvironment.saveClipboardImage
            ? { saveClipboardImage: draftEnvironment.saveClipboardImage }
            : {})}
          {...(project.lastDraftConfig ? { lastDraftConfig: project.lastDraftConfig } : {})}
          onProjectChange={setProjectId}
          onStart={async (input) => {
            await startThreadFromDraft(project, input);
            setExpanded(false);
          }}
        />
      </section>
    </FloatingComposerDock>
  );
}
