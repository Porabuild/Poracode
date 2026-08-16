import type { AgentStatus, Thread } from "@/shared/contracts";
import { agentStatusForPresentation } from "@/shared/agentSelection";
import {
  changeThreadConfig,
  clearThreadPendingSteer,
  resolveThreadServerRequest,
} from "@/renderer/actions/threadRuntimeActions";
import { ThreadPendingSteerStrip } from "@/renderer/components/thread/ThreadPendingSteerStrip";
import { ThreadRuntimeRequestPanel } from "@/renderer/components/thread/ThreadRuntimeRequestPanel";
import { useDelayedPendingSteer } from "@/renderer/components/thread/useDelayedPendingSteer";
import { useAppStore } from "@/renderer/state/appStore";

/** Actionable runtime docks hoisted above the clipped compact composer. */
export function ComposerActionDocks(props: {
  readonly thread: Thread;
  readonly agentStatus: AgentStatus | undefined;
  readonly onOpenPlanFile?: ((path: string) => void) | undefined;
}) {
  const { thread, agentStatus } = props;
  const presentationMode =
    thread.presentationMode ?? agentStatus?.capabilities.presentationMode ?? "terminal";
  const effectiveAgentStatus = agentStatus
    ? agentStatusForPresentation(agentStatus, presentationMode, thread.sessionRef)
    : undefined;
  const request = useAppStore((state) => state.runtimeRequestsByThread[thread.id]?.[0]);
  const pendingSteer = useDelayedPendingSteer(
    useAppStore((state) => state.pendingSteerByThreadId[thread.id]),
  );
  if (!pendingSteer && !request) return null;

  return (
    <div className="m-thread-action-docks">
      {pendingSteer ? (
        <ThreadPendingSteerStrip
          pending={pendingSteer}
          onCancel={() => clearThreadPendingSteer(thread.id)}
        />
      ) : null}
      {request ? (
        <ThreadRuntimeRequestPanel
          key={request.requestId}
          threadId={thread.id}
          agentLabel={effectiveAgentStatus?.label}
          request={request}
          onResolve={(input) => resolveThreadServerRequest(thread.id, input)}
          onPlanApproved={(optionId) =>
            changeThreadConfig(thread.id, {
              ...thread.config,
              mode: "agent",
              ...(optionId === "default" || optionId === "auto"
                ? { approvalPolicy: optionId }
                : {}),
            })
          }
          {...(props.onOpenPlanFile ? { onOpenPlanFile: props.onOpenPlanFile } : {})}
        />
      ) : null}
    </div>
  );
}
