import { useLingui } from "@lingui/react/macro";
import { useShallow } from "zustand/shallow";
import type {
  AgentStatus,
  GitFileChange,
  Project,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import {
  getConflictResolverCandidates,
  readConflictResolverSettingsForProject,
  resolveConflictResolverLaunchConfig,
} from "@/renderer/components/providers/conflictResolver";
import { resolveFastValue } from "@/renderer/components/thread/threadDraftViewHelpers";
import { recordAiAction } from "@/renderer/state/usageRecorder";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

export interface ConflictResolverLaunchInput {
  readonly agentKind: AgentStatus["kind"];
  readonly config: ThreadConfig;
  readonly prompt: string;
  readonly presentationMode: ThreadPresentationMode;
  readonly existingWorktreePath?: string;
  readonly worktreeBranch?: string;
}

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
  onLaunchResolverThread?: ((input: ConflictResolverLaunchInput) => void) | undefined;
}) {
  const { t } = useLingui();
  const { project, mergeConflictFiles, worktreePath, worktreeBranch } = params;

  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  // useShallow is required: this selector builds a fresh object each call, and
  // zustand v5's useSyncExternalStore does not memoize selector results. Without
  // it the snapshot reference changes every render -> forceStoreRerender loops ->
  // React #185 "Maximum update depth exceeded" the moment the git panel mounts.
  const sharedSettings = useSharedSettings(
    useShallow((s) => ({
      conflictResolverProvider: s.conflictResolverProvider,
      conflictResolverModel: s.conflictResolverModel,
      conflictResolverEffort: s.conflictResolverEffort,
      conflictResolverFast: s.conflictResolverFast,
      conflictResolverPresentationMode: s.conflictResolverPresentationMode,
      wslConflictResolverProvider: s.wslConflictResolverProvider,
      wslConflictResolverModel: s.wslConflictResolverModel,
      wslConflictResolverEffort: s.wslConflictResolverEffort,
      wslConflictResolverFast: s.wslConflictResolverFast,
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
  );

  const canResolveWithAgent =
    getConflictResolverCandidates(projectAgentStatuses, conflictResolverSettings.provider).length >
    0;

  function handleResolveWithAgent() {
    if (mergeConflictFiles.length === 0) return;

    const liveSettings = readConflictResolverSettingsForProject(
      project.location.kind,
      useSharedSettings.getState(),
    );
    const candidates = getConflictResolverCandidates(projectAgentStatuses, liveSettings.provider);
    const provider = candidates[0];
    if (!provider) return;

    const { model, effort } = resolveConflictResolverLaunchConfig(
      liveSettings.provider,
      provider,
      liveSettings.model,
      liveSettings.effort,
    );
    // Only carry fast through when the resolved model can actually use it, so a
    // stale fast=true on a non-Opus model doesn't set an unusable session flag.
    const fast = resolveFastValue(provider, model, liveSettings.fast);

    const fileList = mergeConflictFiles.map((f) => `- ${f.path}`).join("\n");
    const prompt = t`Resolve conflicts in this worktree. First inspect Git status and the active operation; the file list below may be stale. Compare both sides and the base, preserving intended behavior and unrelated edits. During rebase, verify what ours/theirs refer to. Handle rename/delete, binary, and generated-file conflicts using repository conventions. If intent is ambiguous, ask before discarding changes. Validate the resolution with appropriate checks, then stage only resolved paths. Do not commit, continue or abort the operation, or push. Report resolutions, checks, and remaining conflicts.

Files:
${fileList}`;

    const presentationMode = resolvePresentationMode(
      liveSettings.presentationMode,
      provider.capabilities,
    );

    const bypass = provider.capabilities.bypassPermissions;
    const launchInput: ConflictResolverLaunchInput = {
      agentKind: provider.kind,
      config: {
        model,
        ...(effort ? { effort } : {}),
        ...(fast ? { fast: true } : {}),
        approvalPolicy: bypass?.approvalPolicy ?? "bypassPermissions",
        ...(bypass?.sandboxMode ? { sandboxMode: bypass.sandboxMode } : {}),
      },
      prompt,
      presentationMode,
      ...(worktreePath ? { existingWorktreePath: worktreePath } : {}),
      ...(worktreeBranch ? { worktreeBranch } : {}),
    };
    if (params.onLaunchResolverThread) {
      params.onLaunchResolverThread(launchInput);
      recordAiAction("conflict", provider.kind, model || "default");
      return;
    }

    const store = useAppStore.getState();
    const thread = store.createThread({
      projectId: project.id,
      agentKind: launchInput.agentKind,
      config: launchInput.config,
      prompt,
      presentationMode,
      ...(worktreePath ? { worktreePath } : {}),
      ...(worktreeBranch ? { worktreeBranch } : {}),
    });
    store.queueThreadLaunch(thread.id, prompt);
    recordAiAction("conflict", provider.kind, model || "default");
  }

  return { canResolveWithAgent, handleResolveWithAgent, projectAgentStatuses };
}
