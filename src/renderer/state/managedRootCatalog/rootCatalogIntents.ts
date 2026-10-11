import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type { ProjectDraftConfig, RemoteThreadCommand } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import type { CatalogReorderPlacement } from "@/shared/catalogOrder";
import { useAppStore } from "@/renderer/state/appStore";
import { i18n } from "@/renderer/i18n/i18n";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import {
  isApplyingHostOriginatedManagedRootMutation,
  managedRootOwner,
  sendManagedRootProjectCommand,
  sendManagedRootThreadCommand,
} from "./rootCatalogCommands";
import { refreshManagedRootCatalogSoon, resyncManagedRootCatalogOrder } from "./rootCatalogAdapter";
import { beginManagedRootOrderIntentFor } from "./managedRootOrderFence";
import { pinManagedRootThread } from "./rootCatalogStore";
import { managedRootSupportsFlatThreadReorder } from "./rootLaunchMetadataCapability";

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

/** Relative project move over the host's complete order (never a reindex). */
export function dispatchManagedRootProjectReorder(
  projectId: string,
  targetProjectId: string,
  placement: CatalogReorderPlacement,
): boolean {
  const found = rootProject(projectId);
  if (!found || isApplyingHostOriginatedManagedRootMutation()) return false;
  const settleOrderIntent = beginManagedRootOrderIntentFor("projects");
  void sendManagedRootProjectCommand({
    kind: "reorder",
    projectId,
    targetProjectId,
    placement,
  })
    .then(() => {
      settleOrderIntent();
      refreshManagedRootCatalogSoon();
    })
    .catch((error) => {
      settleOrderIntent();
      toast.danger(friendlyError(error));
      void resyncManagedRootCatalogOrder("projects");
    });
  return true;
}

/**
 * Relative move over the host's project order by default. `catalog` is the
 * flat Manual list: negotiate its distinct command before optimistic paint.
 */
export function dispatchManagedRootThreadReorder(
  threadId: string,
  targetThreadId: string,
  placement: CatalogReorderPlacement,
  scope: "project" | "catalog" = "project",
): boolean {
  const thread = useAppStore.getState().threads.find((candidate) => candidate.id === threadId);
  const owner = managedRootOwner(thread ?? { id: threadId });
  if (!owner || !thread || isApplyingHostOriginatedManagedRootMutation()) return false;
  const release = pinManagedRootThread(threadId);
  const settleOrderIntent = beginManagedRootOrderIntentFor("threads");
  const coordinates = {
    threadId,
    projectId: thread.projectId,
    targetThreadId,
    placement,
  };
  const command: RemoteThreadCommand =
    scope === "catalog"
      ? { kind: "reorder-flat", ...coordinates }
      : { kind: "reorder", ...coordinates, threadIds: [threadId] };
  const activation = readManagedLoopbackActivation();
  void (async () => {
    if (scope === "catalog") {
      const supported = await managedRootSupportsFlatThreadReorder();
      const state = useAppStore.getState();
      const source = state.threads.find((candidate) => candidate.id === threadId);
      const target = state.threads.find((candidate) => candidate.id === targetThreadId);
      if (
        !supported ||
        !activation ||
        readManagedLoopbackActivation() !== activation ||
        !source ||
        source.projectId !== thread.projectId ||
        !managedRootOwner(source) ||
        !target ||
        !managedRootOwner(target)
      ) {
        throw new Error(i18n._(msg`The desktop's own server refused the change.`));
      }
      // The send wrapper captures its client synchronously before its first
      // await. Capture under the checked activation before store listeners
      // can retire it during optimistic paint.
      const pending = sendManagedRootThreadCommand(command);
      state.reorderThreadsAcrossProjects(threadId, targetThreadId, placement);
      await pending;
      return;
    }
    await sendManagedRootThreadCommand(command);
  })()
    .then(() => {
      settleOrderIntent();
      refreshManagedRootCatalogSoon();
    })
    .catch((error) => {
      settleOrderIntent();
      toast.danger(friendlyError(error));
      void resyncManagedRootCatalogOrder("threads");
    })
    .finally(release);
  return true;
}

/** Single-column thread workspace assignment (`undefined` clears). */
export function dispatchManagedRootThreadWorkspace(
  threadId: string,
  workspaceId: string | undefined,
): boolean {
  const thread = useAppStore.getState().threads.find((candidate) => candidate.id === threadId);
  const owner = managedRootOwner(thread ?? { id: threadId });
  if (!owner || !thread || isApplyingHostOriginatedManagedRootMutation()) return false;
  const release = pinManagedRootThread(threadId);
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

export interface ManagedRootGroupAssignment {
  readonly threadId: string;
  readonly groupId?: string | undefined;
  readonly groupName?: string | undefined;
}

/**
 * Route sidebar-group intents for root rows through the host's existing
 * `set-group` / `clear-group` commands (B4 F4). The UI keeps its optimistic
 * paint; the durable effect is the explicit per-row command. A failed command
 * is surfaced truthfully and a follow-up authoritative pass restores the
 * host's assignment — never a wholesale local rollback that would overwrite
 * another client's newer change. Every affected row is pinned until its
 * command settles so the confirmation-gated deletion pass cannot drop it.
 */
export function dispatchManagedRootThreadGroupIntents(
  assignments: readonly ManagedRootGroupAssignment[],
): void {
  if (isApplyingHostOriginatedManagedRootMutation()) return;
  for (const assignment of assignments) {
    const thread = useAppStore
      .getState()
      .threads.find((candidate) => candidate.id === assignment.threadId);
    const owner = managedRootOwner(thread ?? { id: assignment.threadId });
    if (!owner || !thread) continue;
    const command: RemoteThreadCommand =
      assignment.groupId !== undefined
        ? {
            kind: "set-group",
            threadId: thread.id,
            groupId: assignment.groupId,
            groupName: assignment.groupName ?? thread.title,
          }
        : { kind: "clear-group", threadId: thread.id };
    const release = pinManagedRootThread(thread.id);
    void sendManagedRootThreadCommand(command)
      .then(() => refreshManagedRootCatalogSoon())
      .catch((error) => {
        toast.danger(friendlyError(error));
        refreshManagedRootCatalogSoon();
      })
      .finally(release);
  }
}

/** Narrow project draft-config persistence (dedicated kind, never a patch). */
export function dispatchManagedRootProjectDraftConfig(
  projectId: string,
  lastDraftConfig: ProjectDraftConfig,
): boolean {
  const found = rootProject(projectId);
  if (!found || isApplyingHostOriginatedManagedRootMutation()) return false;
  void sendManagedRootProjectCommand({
    kind: "set-draft-config",
    projectId,
    lastDraftConfig,
  })
    .then(() => refreshManagedRootCatalogSoon())
    .catch((error) => {
      toast.danger(friendlyError(error));
      refreshManagedRootCatalogSoon();
    });
  return true;
}
