import type { GitFileChange, Project, ThreadPresentationMode } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  getConflictResolverCandidates,
  getConflictResolverDefaults,
} from "@/renderer/components/providers/ProviderIcon";

function resolvePresentationMode(
  preferred: ThreadPresentationMode,
  capabilities: {
    presentationMode: ThreadPresentationMode;
    presentationModes?: ThreadPresentationMode[] | undefined;
  },
): ThreadPresentationMode {
  const supported = capabilities.presentationModes ?? [capabilities.presentationMode];
  return supported.includes(preferred) ? preferred : capabilities.presentationMode;
}

export function useConflictResolver(params: {
  project: Project;
  mergeConflictFiles: GitFileChange[];
  worktreePath: string | undefined;
  worktreeBranch: string | undefined;
}) {
  const { project, mergeConflictFiles, worktreePath, worktreeBranch } = params;

  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  const isWsl = project.location.kind === "wsl";
  const conflictResolverProvider = useSharedSettings((s) =>
    isWsl ? s.wslConflictResolverProvider : s.conflictResolverProvider,
  );
  const conflictResolverModel = useSharedSettings((s) =>
    isWsl ? s.wslConflictResolverModel : s.conflictResolverModel,
  );
  const conflictResolverEffort = useSharedSettings((s) =>
    isWsl ? s.wslConflictResolverEffort : s.conflictResolverEffort,
  );
  const conflictResolverPresentationMode = useSharedSettings((s) =>
    isWsl ? s.wslConflictResolverPresentationMode : s.conflictResolverPresentationMode,
  );

  const projectAgentStatuses = getProjectAgentStatuses(
    project.location,
    agentStatuses,
    wslAgentStatuses,
  );

  const canResolveWithAgent =
    getConflictResolverCandidates(projectAgentStatuses, conflictResolverProvider).length > 0;

  function handleResolveWithAgent() {
    if (mergeConflictFiles.length === 0) return;

    const candidates = getConflictResolverCandidates(
      projectAgentStatuses,
      conflictResolverProvider,
    );
    const provider = candidates[0];
    if (!provider) return;

    const defaults = getConflictResolverDefaults(provider.kind);
    const model =
      conflictResolverModel || defaults?.model || provider.capabilities.models[0]?.id || "";
    const effort = conflictResolverEffort || defaults?.effort || "";

    const fileList = mergeConflictFiles.map((f) => `- ${f.path}`).join("\n");
    const prompt =
      `Resolve the merge conflicts in this worktree. The conflicted files are:\n${fileList}\n\n` +
      `For each file, open it and resolve the conflict markers (<<<<<<< =======  >>>>>>>).`;

    const presentationMode = resolvePresentationMode(
      conflictResolverPresentationMode,
      provider.capabilities,
    );

    const bypass = provider.capabilities.bypassPermissions;
    const store = useAppStore.getState();
    const thread = store.createThread({
      projectId: project.id,
      agentKind: provider.kind,
      config: {
        model,
        ...(effort ? { effort } : {}),
        approvalPolicy: bypass?.approvalPolicy ?? "bypassPermissions",
        ...(bypass?.sandboxMode ? { sandboxMode: bypass.sandboxMode } : {}),
      },
      prompt,
      presentationMode,
      ...(worktreePath ? { worktreePath } : {}),
      ...(worktreeBranch ? { worktreeBranch } : {}),
    });
    store.queueThreadLaunch(thread.id, prompt);
  }

  return { canResolveWithAgent, handleResolveWithAgent, projectAgentStatuses };
}
