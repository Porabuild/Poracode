import { useShallow } from "zustand/shallow";
import type { GitFileChange, Project, ThreadPresentationMode } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import {
  getConflictResolverCandidatesForLaunch,
  readConflictResolverSettingsForProject,
  resolveConflictResolverLaunchConfig,
} from "@/renderer/components/providers/conflictResolver";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

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
  const sshAgentStatuses = useAgentStatusesStore((s) => s.sshAgentStatuses);
  // useShallow is required: this selector builds a fresh object each call, and
  // zustand v5's useSyncExternalStore does not memoize selector results. Without
  // it the snapshot reference changes every render -> forceStoreRerender loops ->
  // React #185 "Maximum update depth exceeded" the moment the git panel mounts.
  const sharedSettings = useSharedSettings(
    useShallow((s) => ({
      conflictResolverProvider: s.conflictResolverProvider,
      conflictResolverModel: s.conflictResolverModel,
      conflictResolverEffort: s.conflictResolverEffort,
      conflictResolverPresentationMode: s.conflictResolverPresentationMode,
      wslConflictResolverProvider: s.wslConflictResolverProvider,
      wslConflictResolverModel: s.wslConflictResolverModel,
      wslConflictResolverEffort: s.wslConflictResolverEffort,
      wslConflictResolverPresentationMode: s.wslConflictResolverPresentationMode,
    })),
  );

  const conflictResolverSettings = readConflictResolverSettingsForProject(
    project.location.kind,
    sharedSettings,
  );

  const projectAgentStatuses = getProjectAgentStatuses(
    project.location,
    agentStatuses,
    wslAgentStatuses,
    sshAgentStatuses,
  );

  const canResolveWithAgent =
    getConflictResolverCandidatesForLaunch(projectAgentStatuses, conflictResolverSettings.provider)
      .length > 0;

  function handleResolveWithAgent() {
    if (mergeConflictFiles.length === 0) return;

    const liveSettings = readConflictResolverSettingsForProject(
      project.location.kind,
      useSharedSettings.getState(),
    );
    const candidates = getConflictResolverCandidatesForLaunch(
      projectAgentStatuses,
      liveSettings.provider,
    );
    const provider = candidates[0];
    if (!provider) return;

    const { model, effort } = resolveConflictResolverLaunchConfig(
      liveSettings.provider,
      provider,
      liveSettings.model,
      liveSettings.effort,
    );

    const fileList = mergeConflictFiles.map((f) => `- ${f.path}`).join("\n");
    const prompt =
      `Resolve the merge conflicts in this worktree. The conflicted files are:\n${fileList}\n\n` +
      `For each file, open it and resolve the conflict markers (<<<<<<< =======  >>>>>>>).`;

    const presentationMode = resolvePresentationMode(
      liveSettings.presentationMode,
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
