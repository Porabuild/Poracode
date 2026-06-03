import { useRef } from "react";
import type { AgentStatus, Project, PromptSegment } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import {
  isDetectingAgentsForLocation,
  useAgentStatusesStore,
} from "@/renderer/state/agentStatusesStore";
import {
  useInitialProjectDraftConfig,
  useProjectWithoutDraftConfig,
} from "@/renderer/state/useThread";
import { ThreadDraftView } from "@/renderer/components/thread/ThreadDraftView";
import { useDraggable, useDroppable } from "@dnd-kit/react";
import { useShallow } from "zustand/shallow";
import { useIsDraggingPane, usePaneDropIndicatorState, type DragSourceData } from "@/renderer/dnd";

export function DraftPane(props: {
  paneId: string;
  projectId: string;
  paneCount: number;
  paneAlign: "left" | "center" | "right";
  headerNeedsTrafficLightPad?: boolean;
  onClose: () => void;
  onStart: (
    project: Project,
    input: {
      agentKind: AgentStatus["kind"];
      config: import("@/shared/contracts").ThreadConfig;
      prompt: string;
      segments?: PromptSegment[];
      existingWorktreePath?: string;
      worktreeBranch?: string;
      worktreeBaseBranch?: string;
      worktreeIsNewBranch?: boolean;
      presentationMode?: import("@/shared/contracts").ThreadPresentationMode;
    },
  ) => void;
}) {
  const project = useProjectWithoutDraftConfig(props.projectId);
  const initialLastDraftConfig = useInitialProjectDraftConfig(props.projectId);
  const projectAgentStatuses = useAgentStatusesStore(
    useShallow((s) =>
      project
        ? getProjectAgentStatuses(
            project.location,
            s.agentStatuses,
            s.wslAgentStatuses,
            s.sshAgentStatuses,
          )
        : [],
    ),
  );
  const isDetectingAgents = useAgentStatusesStore((s) =>
    project ? isDetectingAgentsForLocation(s, project.location) : false,
  );

  const paneElementRef = useRef<HTMLDivElement>(null);
  const { handleRef } = useDraggable({
    id: `pane:${props.paneId}`,
    type: "pane",
    data: { type: "pane", paneId: props.paneId } satisfies DragSourceData,
    disabled: props.paneCount <= 1,
    element: paneElementRef,
  });
  useDroppable({
    id: `pane-drop:${props.paneId}`,
    accept: ["pane", "thread", "new-thread"],
    data: { type: "pane-drop-zone", paneId: props.paneId },
    element: paneElementRef,
  });

  const isDragging = useIsDraggingPane(props.paneId);
  const dropIndicator = usePaneDropIndicatorState(props.paneId);

  if (!project) return null;
  return (
    <ThreadDraftView
      project={project}
      agentStatuses={projectAgentStatuses}
      isDetectingAgents={isDetectingAgents}
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
      {...(props.paneCount > 1 ? { dragHandleRef: handleRef } : {})}
      {...(initialLastDraftConfig ? { lastDraftConfig: initialLastDraftConfig } : {})}
      onStart={(input) => props.onStart(project, input)}
    />
  );
}
