import { useEffect, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import type { AgentCapability, Thread, ThreadConfig } from "@/shared/contracts";
import { crewFingerprint, threadCrewBinding } from "@/shared/crew";
import { unloadStoredThread } from "@/renderer/actions/threadActions";

export function useCrewSessionRelaunch(input: {
  thread: Thread;
  capabilities: AgentCapability | undefined;
  runtimeLaunchConfig: ThreadConfig | undefined;
  pendingSteer: unknown;
  queuedFollowUp: unknown;
  openRuntimeRequest: boolean;
  activeSubAgent: boolean;
}): string | undefined {
  const { t } = useLingui();
  const requested = useRef(new Set<string>());
  const binding = threadCrewBinding(input.thread.config);
  const fingerprint = crewFingerprint(binding);
  const launchScope = input.capabilities?.mcpScope?.gui === "launch";
  const relaunchCondition =
    binding !== undefined &&
    input.thread.presentationMode === "gui" &&
    input.thread.status === "idle" &&
    input.runtimeLaunchConfig !== undefined &&
    input.runtimeLaunchConfig.crossagentMcp !== true &&
    launchScope &&
    input.pendingSteer == null &&
    input.queuedFollowUp == null &&
    !input.openRuntimeRequest &&
    !input.activeSubAgent;
  const shouldRelaunch = relaunchCondition && input.thread.sessionRef !== undefined;

  useEffect(() => {
    if (!shouldRelaunch) return;
    const key = `${input.thread.id}:${fingerprint}`;
    if (requested.current.has(key)) return;
    requested.current.add(key);
    void Promise.resolve(unloadStoredThread(input.thread.id, { keepSidePanels: true })).catch(
      () => {},
    );
  }, [fingerprint, input.thread.id, shouldRelaunch]);

  return relaunchCondition && !input.thread.sessionRef
    ? t`Helpers join when this chat restarts.`
    : undefined;
}
