import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import type { AgentStatus, PrWatch, Project, ScheduledTaskConfig } from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import {
  getConflictResolverCandidates,
  readConflictResolverSettingsForProject,
  resolveConflictResolverLaunchConfig,
} from "@/renderer/components/providers/conflictResolver";
import {
  agentWithCapabilities,
  resolveFastValue,
} from "@/renderer/components/thread/threadDraftViewHelpers";
import { i18n } from "@/renderer/i18n/i18n";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

export interface PrAutomationAgent {
  agentKind: string;
  config: ScheduledTaskConfig;
}

export function resolvePrAutomationAgent(
  project: Project,
  windowsAgents: AgentStatus[],
  wslAgents: AgentStatus[],
  settings: SharedSettings,
): PrAutomationAgent | undefined {
  const conflictSettings = readConflictResolverSettingsForProject(project.location.kind, settings);
  const agents = getProjectAgentStatuses(project.location, windowsAgents, wslAgents)
    .filter((agent) => {
      const modes = agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
      return agent.installed && agent.authState !== "missing" && modes.includes("gui");
    })
    .map((agent) => agentWithCapabilities(agent, "gui"))
    .filter((agent) => agent.capabilities.models.length > 0);
  const selected = getConflictResolverCandidates(agents, conflictSettings.provider)[0];
  if (!selected) return undefined;
  const { model, effort } = resolveConflictResolverLaunchConfig(
    conflictSettings.provider,
    selected,
    conflictSettings.model,
    conflictSettings.effort,
  );
  if (!model) return undefined;
  const fast = resolveFastValue(selected, model, conflictSettings.fast);
  return {
    agentKind: selected.kind,
    config: {
      model,
      ...(effort ? { effort } : {}),
      ...(fast ? { fast: true } : {}),
    },
  };
}

export async function applyDefaultPrAutomation(input: {
  project: Project;
  prNumber: number;
  headBranch: string;
  worktreePath?: string | undefined;
}): Promise<PrWatch | null> {
  const settings = useSharedSettings.getState();
  if (settings.prAutomationDefault === "off") return null;

  const statuses = useAgentStatusesStore.getState();
  const automation = resolvePrAutomationAgent(
    input.project,
    statuses.agentStatuses,
    statuses.wslAgentStatuses,
    settings,
  );
  if (!automation) {
    toast.warning(i18n._(msg`Connect an agent before watching PRs.`));
    return null;
  }

  try {
    return await readBridge().upsertPrWatch({
      projectId: input.project.id,
      prNumber: input.prNumber,
      headBranch: input.headBranch,
      ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
      watchEnabled: true,
      autoMerge: settings.prAutomationDefault === "merge",
      agentKind: automation.agentKind,
      config: automation.config,
    });
  } catch (error) {
    toast.warning(
      i18n._(
        msg`Pull request created, but its default automation could not be enabled: ${friendlyError(error)}`,
      ),
    );
    return null;
  }
}
