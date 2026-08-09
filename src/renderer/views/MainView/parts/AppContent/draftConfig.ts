import type { ProjectDraftConfig, ThreadConfig } from "@/shared/contracts";

export function buildProjectDraftConfig(input: {
  agentKind: ProjectDraftConfig["agentKind"];
  config: ThreadConfig;
  worktreeMode: boolean;
}): ProjectDraftConfig {
  const { agentKind, config, worktreeMode } = input;

  return {
    agentKind,
    model: config.model,
    ...(config.effort !== undefined ? { effort: config.effort } : {}),
    ...(config.contextSize ? { contextSize: config.contextSize } : {}),
    ...(config.fast !== undefined ? { fast: config.fast } : {}),
    ...(config.thinking === true ? { thinking: true } : {}),
    ...(config.mode ? { mode: config.mode } : {}),
    // Preserve explicit empty strings — "" means "use provider defaults"
    // (e.g. Codex "Default permissions"). Stripping it would make reload
    // fall through to the bypass fallback and silently flip to Full access.
    ...(config.approvalPolicy !== undefined ? { approvalPolicy: config.approvalPolicy } : {}),
    ...(config.approvalsReviewer !== undefined
      ? { approvalsReviewer: config.approvalsReviewer }
      : {}),
    ...(config.sandboxMode !== undefined ? { sandboxMode: config.sandboxMode } : {}),
    worktreeMode,
  };
}
