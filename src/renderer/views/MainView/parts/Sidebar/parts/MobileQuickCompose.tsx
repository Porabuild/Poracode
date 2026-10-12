import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { startThreadFromDraft } from "@/renderer/actions/threadLaunchActions";
import { FloatingComposerDock } from "@/renderer/components/mobileComposer/FloatingComposerDock";
import { ThreadDraftView } from "@/renderer/components/thread/ThreadDraftView";
import { useDraftEnvironment } from "@/renderer/hooks/uiSelectors";
import { useAppStore } from "@/renderer/state/appStore";

export function MobileQuickCompose(props: { projectId: string }) {
  const { t } = useLingui();
  const [draft, setDraft] = useState({ projectId: props.projectId, revision: 0, expanded: false });
  const { expanded } = draft;
  const [restoreWorktreeSelectionToken, setRestoreWorktreeSelectionToken] = useState(0);
  const project = useAppStore((state) =>
    state.projects.find((candidate) => candidate.id === draft.projectId),
  );
  const draftEnvironment = useDraftEnvironment(project);

  // While collapsed the draft tracks the selected project; while expanded the
  // user may have switched projects inside the composer, so the sync pauses
  // until the next collapse. Adjusted during render so the draft never paints
  // a frame for the wrong project.
  if (!expanded && draft.projectId !== props.projectId) {
    setDraft({ ...draft, projectId: props.projectId, revision: draft.revision + 1 });
  }

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
        setDraft((current) => ({ ...current, expanded: next }));
      }}
    >
      <section className="m-draft">
        <span className="m-draft-collapsed-placeholder" aria-hidden="true">
          {t`Plan, ask, build…`}
        </span>
        <ThreadDraftView
          key={`${project.id}:${draft.revision}`}
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
          onProjectChange={(projectId) => {
            setDraft((current) =>
              current.projectId === projectId
                ? current
                : { ...current, projectId, revision: current.revision + 1 },
            );
          }}
          onStart={async (input) => {
            await startThreadFromDraft(project, input);
            // The mobile dock remains mounted after launch. Start a fresh editor
            // without resetting an unsent draft selected while launch was pending.
            setDraft((current) =>
              current.projectId === project.id && current.revision === draft.revision
                ? { ...current, revision: current.revision + 1, expanded: false }
                : current,
            );
          }}
        />
      </section>
    </FloatingComposerDock>
  );
}
