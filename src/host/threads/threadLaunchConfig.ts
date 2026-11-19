import { resolveNewThreadMcpConfig } from "@/shared/contracts";
import type {
  AgentKind,
  AgentStatusesResponse,
  ProjectLocation,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import {
  capabilitiesForPresentation,
  resolveComposerPresentationMode,
} from "@/shared/agentSelection";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { isSlashCommandPrompt, resolveThreadTitlePrompt } from "@/shared/threadTitle";
import { resolveUnrestrictedPermissionConfig } from "@/shared/agents/unrestrictedPermissions";

/**
 * Resolve the most-permissive advertised permission policy for an agent in a
 * given location. Threads launched from automation (schedules, the app-controls
 * MCP) run their opening turn unattended — nobody is around to answer approval
 * prompts — so they launch with the provider's unrestricted posture (the same
 * capabilities-driven resolution the subagent lane uses; no provider-specific
 * branching). On a lookup failure or unknown agent, fall back to provider
 * defaults rather than failing the launch. App-created threads also apply the
 * composer's standing MCP defaults when settings are supplied.
 */
export async function resolveHostThreadLaunchDefaults(
  getAgentStatuses: (wslDistros: string[]) => Promise<AgentStatusesResponse>,
  agentKind: AgentKind,
  location: ProjectLocation,
  settings?: Pick<
    SharedSettings,
    "enabledMcpServers" | "disabledBuiltInMcpServers" | "lastPresentationModeByAgent"
  >,
  options: { presentationMode?: ThreadPresentationMode; unattended?: boolean } = {},
): Promise<{ presentationMode: ThreadPresentationMode; config: Partial<ThreadConfig> }> {
  let agent;
  try {
    const statuses = await getAgentStatuses(location.kind === "wsl" ? [location.distro] : []);
    agent = getProjectAgentStatuses(location, statuses.windows, statuses.wsl).find(
      (status) => status.kind === agentKind,
    );
  } catch {
    // A status lookup failure must not block the same launch the UI can attempt.
  }
  const presentationMode =
    options.presentationMode ??
    (options.unattended === false
      ? resolveComposerPresentationMode(agent, settings?.lastPresentationModeByAgent ?? {})
      : "gui");
  if (!agent) return { presentationMode, config: {} };
  const capabilities =
    options.presentationMode || options.unattended === false
      ? capabilitiesForPresentation(agent.capabilities, presentationMode)
      : agent.capabilities;
  return {
    presentationMode,
    config: {
      ...(options.unattended !== false ? resolveUnrestrictedPermissionConfig(capabilities) : {}),
      ...(settings
        ? resolveNewThreadMcpConfig(settings, capabilities, presentationMode, location)
        : {}),
    },
  };
}

/**
 * The text a host-created thread's title derives from: the provider's declared
 * `threadTitleCommands` capability applied to the first prompt (for example a
 * goal command's objective). Statuses are only read for slash-command prompts,
 * and a lookup failure keeps the prompt — a title never blocks a launch.
 */
export async function resolveHostThreadTitlePrompt(
  getAgentStatuses: (wslDistros: string[]) => Promise<AgentStatusesResponse>,
  agentKind: AgentKind,
  location: ProjectLocation,
  prompt: string,
): Promise<string> {
  if (!isSlashCommandPrompt(prompt)) return prompt;
  try {
    const statuses = await getAgentStatuses(location.kind === "wsl" ? [location.distro] : []);
    const agents = getProjectAgentStatuses(location, statuses.windows, statuses.wsl);
    const agent = agents.find((status) => status.kind === agentKind);
    return resolveThreadTitlePrompt(prompt, agent?.capabilities.threadTitleCommands);
  } catch {
    return prompt;
  }
}
