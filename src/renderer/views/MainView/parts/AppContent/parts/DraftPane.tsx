import type { Project } from "@/shared/contracts";
import {
  useInitialProjectDraftConfig,
  useProjectWithoutDraftConfig,
} from "@/renderer/state/useThread";
import { ThreadDraftView } from "@/renderer/components/thread/ThreadDraftView";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { useIsDraggingPane, usePaneDropIndicatorState } from "@/renderer/dnd";
import { useDraftEnvironment } from "@/renderer/hooks/uiSelectors";
import { usePaneDragAndDrop } from "@/renderer/components/thread/PaneDragAndDrop";

export function DraftPane(props: {
  paneId: string;
  projectId: string;
  paneCount: number;
  paneAlign: "left" | "center" | "right";
  headerNeedsTrafficLightPad?: boolean;
  onClose: () => void;
  onStart: (project: Project, input: DraftStartInput) => void | Promise<void>;
}) {
  const project = useProjectWithoutDraftConfig(props.projectId);
  const initialLastDraftConfig = useInitialProjectDraftConfig(props.projectId);
  const draftEnvironment = useDraftEnvironment(project);

  const { paneElementRef, dragHandleRef } = usePaneDragAndDrop({
    paneId: props.paneId,
    handleRendered: props.paneCount > 1,
  });

  const isDragging = useIsDraggingPane(props.paneId);
  const dropIndicator = usePaneDropIndicatorState(props.paneId);

  if (!project) return null;
  return (
    <ThreadDraftView
      project={project}
      agentStatuses={draftEnvironment.agentStatuses}
      isDetectingAgents={draftEnvironment.isDetectingAgents}
      {...(draftEnvironment.pickFiles ? { pickFiles: draftEnvironment.pickFiles } : {})}
      {...(draftEnvironment.saveClipboardImage
        ? { saveClipboardImage: draftEnvironment.saveClipboardImage }
        : {})}
      compact
      paneAlign={props.paneAlign}
      paneId={props.paneId}
      showCloseButton
      isDragging={isDragging}
      dropIndicator={dropIndicator}
      paneCount={props.paneCount}
      headerNeedsTrafficLightPad={props.headerNeedsTrafficLightPad}
      droppableRef={paneElementRef}
      onClose={props.onClose}
      {...(props.paneCount > 1 ? { dragHandleRef } : {})}
      {...(initialLastDraftConfig ? { lastDraftConfig: initialLastDraftConfig } : {})}
      onStart={(input) => props.onStart(project, input)}
    />
  );
}
