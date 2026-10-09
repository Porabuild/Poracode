import { agentPanelMetaTextClass } from "@/renderer/components/layout/AgentPanelTitleRow";
import { useLingui } from "@lingui/react/macro";
import { formatModelConfigLabel } from "@/renderer/components/providers/modelDisplay";
import { getProviderManifest } from "@/renderer/components/providers/providerManifest";
import { useThreadAgentStatuses } from "@/renderer/hooks/uiSelectors";
import { useProject, useThread } from "@/renderer/state/useThread";
import type { SideChatBootstrap } from "@/shared/ipc/sideChat";

/** Matches the compact model metadata displayed above Crossagent titles. */
export function SideChatModelText({
  entry,
  threadId,
}: {
  entry: SideChatBootstrap;
  threadId?: string;
}) {
  const { i18n } = useLingui();
  const liveThread = useThread(threadId ?? entry.existingThreadId);
  const thread = liveThread ?? entry.source;
  const project = useProject(thread.projectId);
  const statuses = useThreadAgentStatuses({
    remoteServerId: thread.remoteServerId,
    projectLocation: project?.location,
  });
  const agent = statuses.find((status) => status.kind === thread.agentKind);
  const manifest = getProviderManifest(thread.agentKind);
  const providerLabel = agent?.label ?? (manifest ? i18n._(manifest.label) : thread.agentKind);
  const configLabel = formatModelConfigLabel(agent, thread.config);
  return (
    <span className={agentPanelMetaTextClass}>
      {[providerLabel, configLabel].filter(Boolean).join(" · ")}
    </span>
  );
}
