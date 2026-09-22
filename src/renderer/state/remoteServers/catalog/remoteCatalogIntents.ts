import { toast } from "@heroui/react";
import type { CatalogReorderPlacement } from "@/shared/catalogOrder";
import { friendlyError } from "@/shared/messages";
import { useAppStore } from "@/renderer/state/appStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { hostSupportsCatalogMutationsForConnection } from "@/renderer/state/remote/catalogMutationsCapability";
import { requestManualPaintRefresh } from "./boundedCatalogController";
import { beginCatalogOrderIntentFor } from "./catalogOrderFence";

/**
 * Paired/remote sidebar reorder intents. The existing drag interaction paints
 * the local order optimistically (`useAppStore.reorderThreads` /
 * `reorderProjects`); the durable effect is the host's relative `reorder`
 * command over the connection's existing client, carrying one explicit
 * operation id and the host-namespace ids (`remoteId`), fenced by the shared
 * per-connection order intent:
 *
 * - while the intent is in flight, a completed authoritative paint pass of that
 *   kind is deferred, so the host's older order cannot clobber the optimistic
 *   paint before the command settles;
 * - success settles the fence and refreshes the bounded paint (the host's
 *   order is authoritative);
 * - failure settles the fence, surfaces the host's refusal truthfully, and
 *   requests the same bounded paint refresh so the authoritative order is
 *   restored instead of leaving a display-only local move.
 *
 * A connection whose host did not advertise `catalogMutations` keeps the
 * historical local-only behavior: no command is sent that the host cannot
 * persist.
 */

function reorderIntent(
  connectionKey: string,
  kind: "threads" | "projects",
  run: (commandId: string) => Promise<void>,
): boolean {
  if (!hostSupportsCatalogMutationsForConnection(connectionKey)) return false;
  const settle = beginCatalogOrderIntentFor(connectionKey, kind);
  void run(crypto.randomUUID())
    .then(() => {
      settle();
      requestManualPaintRefresh(connectionKey, kind);
    })
    .catch((error) => {
      settle();
      toast.danger(friendlyError(error));
      requestManualPaintRefresh(connectionKey, kind);
    });
  return true;
}

/** Relative thread-block move inside one paired project (host ids only). */
export function dispatchRemoteThreadReorder(
  threadId: string,
  targetThreadId: string,
  placement: CatalogReorderPlacement,
): boolean {
  const state = useAppStore.getState();
  const thread = state.threads.find((candidate) => candidate.id === threadId);
  const threadOwner = remoteOwner(thread);
  if (!thread || !threadOwner?.remoteId) return false;
  const target = state.threads.find((candidate) => candidate.id === targetThreadId);
  const targetOwner = remoteOwner(target);
  if (
    !target ||
    !targetOwner?.remoteId ||
    targetOwner.desktopId !== threadOwner.desktopId ||
    target.projectId !== thread.projectId
  ) {
    return false;
  }
  const project = state.projects.find((candidate) => candidate.id === thread.projectId);
  const projectOwner = remoteOwner(project);
  if (!projectOwner?.remoteId || projectOwner.desktopId !== threadOwner.desktopId) return false;
  const connectionKey = threadOwner.desktopId;
  return reorderIntent(connectionKey, "threads", (commandId) =>
    useRemoteServersStore.getState().sendThreadCommand(
      connectionKey,
      {
        kind: "reorder",
        threadId: threadOwner.remoteId!,
        projectId: projectOwner.remoteId!,
        threadIds: [threadOwner.remoteId!],
        targetThreadId: targetOwner.remoteId!,
        placement,
      },
      { commandId },
    ),
  );
}

/** Relative project move over one paired connection's complete order. */
export function dispatchRemoteProjectReorder(
  projectId: string,
  targetProjectId: string,
  placement: CatalogReorderPlacement,
): boolean {
  const state = useAppStore.getState();
  const project = state.projects.find((candidate) => candidate.id === projectId);
  const owner = remoteOwner(project);
  if (!project || !owner?.remoteId) return false;
  const target = state.projects.find((candidate) => candidate.id === targetProjectId);
  const targetOwner = remoteOwner(target);
  if (!target || !targetOwner?.remoteId || targetOwner.desktopId !== owner.desktopId) return false;
  const connectionKey = owner.desktopId;
  return reorderIntent(connectionKey, "projects", (commandId) =>
    useRemoteServersStore.getState().runProjectCommand(
      connectionKey,
      {
        kind: "reorder",
        projectId: owner.remoteId!,
        targetProjectId: targetOwner.remoteId!,
        placement,
      },
      { commandId },
    ),
  );
}
