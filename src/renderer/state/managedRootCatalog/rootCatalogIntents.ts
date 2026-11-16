import { pinThreadRow } from "@/renderer/state/threadLaunchIntents";
import { toast } from "@heroui/react";
import type { ProjectDraftConfig, RemoteThreadCommand } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { useAppStore } from "@/renderer/state/appStore";
import { intentHost } from "@/renderer/state/entityHost";
import {
  isApplyingHostOriginatedManagedRootMutation,
  managedRootOwner,
  sendManagedRootProjectCommand,
  sendManagedRootThreadCommand,
} from "./rootCatalogCommands";
import { refreshManagedRootCatalogSoon } from "./rootCatalogAdapter";

/**
 * Semantic root intents whose host commands only touch one field/order class
 * (B4 S5). The UI keeps its optimistic local paint; the durable effect is the
 * explicit host command, and a failure is surfaced truthfully while a follow-up
 * authoritative pass restores the host's values.
 */

function rootProject(projectId: string) {
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  const owner = managedRootOwner(project ?? { id: projectId });
  return owner ? { project: project!, owner } : undefined;
}

/** Single-column thread workspace assignment (`undefined` clears). */
export function dispatchManagedRootThreadWorkspace(
  threadId: string,
  workspaceId: string | undefined,
): boolean {
  const thread = useAppStore.getState().threads.find((candidate) => candidate.id === threadId);
  const owner = managedRootOwner(thread ?? { id: threadId });
  if (!owner || !thread || isApplyingHostOriginatedManagedRootMutation()) return false;
  const release = pinThreadRow(threadId);
  void sendManagedRootThreadCommand({
    kind: "set-workspace",
    threadId,
    workspaceId: workspaceId ?? null,
  })
    .then(() => refreshManagedRootCatalogSoon())
    .catch((error) => {
      toast.danger(friendlyError(error));
      refreshManagedRootCatalogSoon();
    })
    .finally(release);
  return true;
}

/** Single-column project workspace assignment (`undefined` clears). */
export function dispatchManagedRootProjectWorkspace(
  projectId: string,
  workspaceId: string | undefined,
): boolean {
  const found = rootProject(projectId);
  if (!found || isApplyingHostOriginatedManagedRootMutation()) return false;
  void sendManagedRootProjectCommand({
    kind: "set-workspace",
    projectId,
    workspaceId: workspaceId ?? null,
  })
    .then(() => refreshManagedRootCatalogSoon())
    .catch((error) => {
      toast.danger(friendlyError(error));
      refreshManagedRootCatalogSoon();
    });
  return true;
}

export interface ThreadGroupAssignment {
  readonly threadId: string;
  readonly groupId?: string | undefined;
  readonly groupName?: string | undefined;
}

/**
 * Route sidebar-group intents through the owning host's `set-group` /
 * `clear-group` commands (B4 F4), whichever host owns each row. The UI keeps its optimistic
 * paint; the durable effect is the explicit per-row command. A failed command
 * is surfaced truthfully and a follow-up authoritative pass restores the
 * host's assignment — never a wholesale local rollback that would overwrite
 * another client's newer change. Every affected row is pinned until its
 * command settles so the confirmation-gated deletion pass cannot drop it.
 */
export function dispatchThreadGroupIntents(assignments: readonly ThreadGroupAssignment[]): void {
  for (const assignment of assignments) {
    const thread = useAppStore
      .getState()
      .threads.find((candidate) => candidate.id === assignment.threadId);
    const host = intentHost(thread);
    if (!host || !thread) continue;
    const command: RemoteThreadCommand =
      assignment.groupId !== undefined
        ? {
            kind: "set-group",
            threadId: host.hostId,
            groupId: assignment.groupId,
            groupName: assignment.groupName ?? thread.title,
          }
        : { kind: "clear-group", threadId: host.hostId };
    const release = host.pinThread(thread.id);
    void host
      .sendThreadCommand(command)
      .catch((error) => toast.danger(friendlyError(error)))
      .finally(release);
  }
}

/**
 * Narrow project draft-config persistence on the project's host (dedicated
 * kind, never a patch), whichever host owns the project.
 */
export function dispatchProjectDraftConfig(
  projectId: string,
  lastDraftConfig: ProjectDraftConfig,
): boolean {
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  const host = intentHost(project);
  if (!host) return false;
  void host
    .runProjectCommand({ kind: "set-draft-config", projectId: host.hostId, lastDraftConfig })
    .catch((error) => toast.danger(friendlyError(error)));
  return true;
}
