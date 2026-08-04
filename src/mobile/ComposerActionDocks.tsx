import type { AgentStatus, Project, Thread } from "@/shared/contracts";
import { agentStatusForPresentation } from "@/shared/agentSelection";
import {
  changeThreadConfig,
  clearThreadPendingSteer,
  resolveThreadServerRequest,
} from "@/renderer/actions/threadRuntimeActions";
import { ThreadAuthRequiredDock } from "@/renderer/components/thread/ThreadAuthRequiredDock";
import { ThreadPendingSteerStrip } from "@/renderer/components/thread/ThreadPendingSteerStrip";
import { ThreadRuntimeRequestPanel } from "@/renderer/components/thread/ThreadRuntimeRequestPanel";
import { resolveThreadAuthState } from "@/renderer/components/thread/threadErrorState";
import { useDelayedPendingSteer } from "@/renderer/components/thread/useDelayedPendingSteer";
import type { ThreadDockState } from "@/renderer/components/thread/useThreadDockState";
import { useAppStore } from "@/renderer/state/appStore";

/**
 * The composer's action docks — sign-in required, a queued steer, and the open
 * runtime request (tool approval, plan review, agent question) — hoisted OUT of
 * the compact mobile composer.
 *
 * Desktop keeps these in the composer's `fixedContent`, but the collapsed mobile
 * bubble clips to a single control line (`.m-compose-bubble` max-height +
 * overflow), so anything above the input stayed invisible until the user
 * expanded the composer and summoned the keyboard. The floating dock hosts them
 * in one card above the bubble instead (see ThreadComposerSection
 * `hideActionDocks`), where they are answerable straight from the thread and
 * still ride the dock's keyboard lift. The purely informational docks take the
 * other route — compact chips (ComposerInfoChips) — and the slash-command panel
 * stays inline because it only appears while typing, with the composer already
 * expanded.
 */
export function ComposerActionDocks(props: {
  readonly thread: Thread;
  readonly agentStatus: AgentStatus | undefined;
  readonly project: Project | undefined;
  readonly dockState: ThreadDockState;
  readonly onOpenPlanFile?: ((path: string) => void) | undefined;
}) {
  const { thread, agentStatus, project } = props;
  const presentationMode =
    thread.presentationMode ?? agentStatus?.capabilities.presentationMode ?? "terminal";
  const effectiveAgentStatus = agentStatus
    ? agentStatusForPresentation(agentStatus, presentationMode, thread.sessionRef)
    : undefined;
  const request = useAppStore((state) => state.runtimeRequestsByThread[thread.id]?.[0]);
  const pendingSteer = useDelayedPendingSteer(
    useAppStore((state) => state.pendingSteerByThreadId[thread.id]),
  );
  const { authRequired } = resolveThreadAuthState({
    authState: effectiveAgentStatus?.authState,
    errorDockStates: props.dockState.errorDockStates,
  });
  const showAuthDock = authRequired && effectiveAgentStatus !== undefined;
  if (!showAuthDock && !pendingSteer && !request) return null;

  return (
    <div className="m-thread-action-docks">
      {showAuthDock ? (
        <ThreadAuthRequiredDock
          agentStatus={effectiveAgentStatus}
          {...(project ? { project } : {})}
        />
      ) : null}
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
