import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { authStateForPresentation } from "@/shared/agentSelection";
import type {
  AgentStatus,
  ForgeRepository,
  PrWatch,
  Project,
  ScheduledTaskConfig,
} from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { reviewScopeFromSource } from "@/shared/forgeRemote";
import {
  getConflictResolverCandidates,
  readConflictResolverSettingsForProject,
  resolveConflictResolverSettingsLaunchConfig,
  type ConflictResolverSettingsSource,
} from "@/renderer/components/providers/conflictResolver";
import { agentWithCapabilities } from "@/renderer/components/thread/threadDraftViewHelpers";
import { i18n } from "@/renderer/i18n/i18n";
import { readHostAgentStatusPools } from "@/renderer/hooks/useHostAgentStatuses";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

export interface PrAutomationAgent {
  agentKind: string;
  config: ScheduledTaskConfig;
}

export function resolvePrAutomationAgent(
  project: Project,
  windowsAgents: AgentStatus[],
  wslAgents: AgentStatus[],
  settings: ConflictResolverSettingsSource,
): PrAutomationAgent | undefined {
  const conflictSettings = readConflictResolverSettingsForProject(project.location.kind, settings);
  const agents = getProjectAgentStatuses(project.location, windowsAgents, wslAgents)
    .filter((agent) => {
      const modes = agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
      return (
        agent.installed &&
        authStateForPresentation(agent, "gui") !== "missing" &&
        modes.includes("gui")
      );
    })
    .map((agent) => agentWithCapabilities(agent, "gui"))
    .filter((agent) => agent.capabilities.models.length > 0);
  const selected = getConflictResolverCandidates(agents, conflictSettings.provider)[0];
  if (!selected) return undefined;
  const config = resolveConflictResolverSettingsLaunchConfig(conflictSettings, selected);
  if (!config.model) return undefined;
  return {
    agentKind: selected.kind,
    config,
  };
}

export async function applyDefaultPrAutomation(input: {
  project: Project;
  prNumber: number;
  headBranch: string;
  source?: ForgeRepository;
  worktreePath?: string | undefined;
}): Promise<PrWatch | null> {
  if (input.source?.capabilities.autoFix === false) return null;
  try {
    const host = input.project.location.remoteServerId;
    const settings = host
      ? await useRemoteServersStore.getState().withClient(host, (client) => client.settings())
      : useSharedSettings.getState();
    if (settings.prAutomationDefault === "off") return null;
    const statuses = readHostAgentStatusPools(host);
    const automation = resolvePrAutomationAgent(
      input.project,
      statuses.windows,
      statuses.wsl,
      settings,
    );
    if (!automation) {
      toast.warning(i18n._(msg`Connect an agent before watching PRs.`));
      return null;
    }
    const payload = {
      projectId: input.project.id,
      prNumber: input.prNumber,
      headBranch: input.headBranch,
      ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
      watchEnabled: true,
      autoMerge:
        settings.prAutomationDefault === "merge" && input.source?.capabilities.autoMerge !== false,
      agentKind: automation.agentKind,
      config: automation.config,
    };
    const reviewScope = reviewScopeFromSource(input.source);
    return reviewScope
      ? await readBridge().upsertForgePrWatch({ ...payload, reviewScope })
      : await readBridge().upsertPrWatch(payload);
  } catch (error) {
    toast.warning(
      i18n._(
        msg`Pull request created, but its default automation could not be enabled: ${friendlyError(error)}`,
      ),
    );
    return null;
  }
}
