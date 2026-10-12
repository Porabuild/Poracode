import { Spinner } from "@heroui/react";
import { useEffect } from "react";
import { useAppStore } from "@/renderer/state/appStore";
import { useDraftEnvironment } from "@/renderer/hooks/uiSelectors";
import { ThreadDraftView } from "@/renderer/components/thread/ThreadDraftView";
import { startThreadFromDraft } from "@/renderer/actions/threadLaunchActions";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { sidebarAgentsPending } from "./agentReadiness";
import { useTurnClientContextCapture } from "@/renderer/components/composer/turnClientContext";

export function ChatSidebarDraft(props: { projectId: string }) {
  useEffect(() => {
    // The previous composer consumes this fence while unmounting. When no
    // composer was mounted (a chat or discovery was open), retire it here.
    useAppStore.getState().consumeDraftContentDiscard(props.projectId);
  }, [props.projectId]);
  const project = useAppStore((state) => state.projects.find((row) => row.id === props.projectId));
  const environment = useDraftEnvironment(project);
  const captureClientContext = useTurnClientContextCapture();
  const awaitingAgents = useRemoteServersStore((state) =>
    project?.remoteServerId ? sidebarAgentsPending(state.runtime[project.remoteServerId]) : false,
  );
  if (!project)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  return (
    <ThreadDraftView
      key={project.id}
      project={project}
      agentStatuses={environment.agentStatuses}
      isDetectingAgents={environment.isDetectingAgents || awaitingAgents}
      compact
      chatOnly
      submitOnEnter
      {...(project.lastDraftConfig ? { lastDraftConfig: project.lastDraftConfig } : {})}
      {...(environment.pickFiles ? { pickFiles: environment.pickFiles } : {})}
      {...(environment.saveClipboardImage
        ? { saveClipboardImage: environment.saveClipboardImage }
        : {})}
      onStart={async (input) => {
        // `onStart` runs synchronously on submit, so this is send-time context.
        const clientContext = await captureClientContext?.();
        return startThreadFromDraft(
          project,
          { ...input, ...(clientContext ? { clientContext } : {}) },
          { preserveActiveGroup: false },
        );
      }}
    />
  );
}
