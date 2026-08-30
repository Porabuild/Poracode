import { msg as linguiMsg } from "@lingui/core/macro";
import type { RemoteThreadCommand } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { titlePromptFromSegments } from "@/shared/threadTitle";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { generateTitleAsync } from "@/renderer/utils/titleGen";
import { primeWorktreeGitState } from "@/renderer/actions/worktreeLaunchActions";
import { i18n } from "@/renderer/i18n/i18n";

type RemoteStartCommand = Extract<RemoteThreadCommand, { kind: "start" }>;

/**
 * Mirror a remote `start` command into the desktop renderer's store. The
 * server owns the durable row and the supervisor launch; this only keeps the
 * renderer's view authoritative so its next persist does not write stale
 * values back over the row (`dbSyncAll` rewrites every column).
 *
 * A start carrying `providerSwitch` retargets an EXISTING thread (a remote
 * "Continue in..." switch): the row was already flipped server-side before the
 * supervisor call, so the store follows through `applyProviderSwitch` — the
 * same reducer the switching client used. No launch is queued here: the HTTP
 * path that forwarded this command owns the supervisor call, and queueing
 * would start a second session.
 */
export function applyRemoteThreadStartCommand(command: RemoteStartCommand): void {
  const store = useAppStore.getState();
  const existing = store.threads.find((thread) => thread.id === command.threadId);
  if (existing) {
    if (!command.providerSwitch) return;
    store.applyProviderSwitch(command.threadId, {
      agentKind: command.agentKind,
      config: command.config,
      presentationMode: command.presentationMode ?? existing.presentationMode ?? "terminal",
    });
    if (command.providerSwitch.previousStatus) {
      // A reverted switch: the supervisor call failed, so nothing runs. The
      // mirror follows the durable row's restored status instead of parking at
      // "launching" (which no reconciliation pass ever revisits). A plain
      // two-field write — `updateThreadRuntime` would touch turn timing too.
      const previousStatus = command.providerSwitch.previousStatus;
      useAppStore.setState((state) => ({
        threads: state.threads.map((t) =>
          t.id === command.threadId
            ? (({ activeTurnStartedAt: _closedTurn, ...thread }) => ({
                ...thread,
                status: previousStatus,
                attention: "none" as const,
              }))(t)
            : t,
        ),
      }));
    }
    return;
  }

  const project = store.projects.find((p) => p.id === command.projectId);
  if (!project) return;
  const titlePrompt =
    titlePromptFromSegments(command.prompt, command.segments).trim() ||
    i18n._(linguiMsg`New thread`);
  const thread = store.createThread({
    threadId: command.threadId,
    projectId: project.id,
    agentKind: command.agentKind,
    ...(command.agentInstanceId ? { agentInstanceId: command.agentInstanceId } : {}),
    config: command.config,
    prompt: titlePrompt,
    ...(command.title ? { title: command.title } : {}),
    ...(command.presentationMode ? { presentationMode: command.presentationMode } : {}),
    ...(command.worktreePath ? { worktreePath: command.worktreePath } : {}),
    ...(command.worktreeBranch ? { worktreeBranch: command.worktreeBranch } : {}),
    ...(command.prNumber !== undefined ? { prNumber: command.prNumber } : {}),
    ...(command.focus === false ? { focus: false } : {}),
    ...(command.parentThreadId ? { parentThreadId: command.parentThreadId } : {}),
    ...(command.groupId ? { groupId: command.groupId } : {}),
    ...(command.groupName ? { groupName: command.groupName } : {}),
  });
  if (command.launchRuntime !== false) {
    if (command.userMessageItemId) {
      store.queueThreadLaunch(
        thread.id,
        command.prompt,
        command.segments,
        command.userMessageItemId,
      );
    } else {
      store.queueThreadLaunch(thread.id, command.prompt, command.segments);
    }
  }
  const { agentStatuses, wslAgentStatuses } = useAgentStatusesStore.getState();
  const projectAgentStatuses = getProjectAgentStatuses(
    project.location,
    agentStatuses,
    wslAgentStatuses,
  );
  // An explicit title (e.g. an orchestrator-provided ticket key) is
  // authoritative — don't let AI title generation overwrite it.
  if (!command.title) {
    generateTitleAsync(thread.id, project.location, projectAgentStatuses, titlePrompt);
  }
  if (command.worktreePath) {
    void primeWorktreeGitState(project, command.worktreePath);
  }
}
