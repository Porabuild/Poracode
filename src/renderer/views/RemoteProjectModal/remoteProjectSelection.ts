import type {
  AgentStatus,
  ProjectLocation,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { agentStatusForPresentation } from "@/shared/agentSelection";
import type { RemoteAgentStatuses } from "@/shared/remote";

function resolveDefaultOption(
  options: readonly { id: string }[],
  preferred: string | undefined,
): string | undefined {
  if (preferred && options.some((option) => option.id === preferred)) {
    return preferred;
  }
  return options[0]?.id;
}

export function remoteProjectPresentationModes(
  status: AgentStatus | undefined,
): ThreadPresentationMode[] {
  if (!status) return [];
  return status.capabilities.presentationModes ?? [status.capabilities.presentationMode];
}

export function resolveRemoteProjectPresentationMode(
  status: AgentStatus | undefined,
  preferred: ThreadPresentationMode,
): ThreadPresentationMode {
  const modes = remoteProjectPresentationModes(status);
  return modes.includes(preferred) ? preferred : (modes[0] ?? "terminal");
}

/**
 * Scope remote discovery to the project's exact runtime location. In
 * particular, WSL statuses from a different distro must never leak into the
 * agent picker.
 */
export function remoteProjectAgentStatuses(
  statuses: RemoteAgentStatuses | undefined,
  location: ProjectLocation,
): AgentStatus[] {
  if (!statuses) return [];
  return getProjectAgentStatuses(location, statuses.windows, statuses.wsl).filter(
    (status) =>
      status.installed &&
      remoteProjectPresentationModes(status).some(
        (mode) => agentStatusForPresentation(status, mode).capabilities.models.length > 0,
      ),
  );
}

/** Build launch config from an already presentation-resolved status. */
export function buildRemoteThreadConfig(
  status: AgentStatus,
  model: string,
  effort: string,
): ThreadConfig {
  const capabilities = status.capabilities;
  const approvalPolicy = resolveDefaultOption(
    capabilities.approvalPolicies,
    capabilities.defaultApprovalPolicy,
  );
  const sandboxMode = resolveDefaultOption(
    capabilities.sandboxModes,
    capabilities.defaultSandboxMode,
  );
  return {
    model,
    ...(effort ? { effort } : {}),
    ...(approvalPolicy ? { approvalPolicy } : {}),
    ...(capabilities.defaultApprovalsReviewer !== undefined
      ? { approvalsReviewer: capabilities.defaultApprovalsReviewer }
      : {}),
    ...(sandboxMode ? { sandboxMode } : {}),
  };
}
