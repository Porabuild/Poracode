import { toast } from "@heroui/react";
import type { RemoteThreadCommand } from "@/shared/contracts";
import type { CatalogReorderPlacement } from "@/shared/catalogOrder";
import { friendlyError } from "@/shared/messages";
import { useAppStore } from "./appStore";
import { entityHost, intentHost, isSameHost, type EntityHost } from "./entityHost";
import { beginCatalogOrderIntentFor } from "./remoteServers/catalog/catalogOrderFence";
import type { CatalogKind } from "./remoteServers/catalog/boundedCatalogAlgorithm";

/**
 * Sidebar reorder intents, resolved to the row's owning host (managed or
 * paired) once. The caller's `paint` is the optimistic local move; the durable
 * effect is the host's relative `reorder` / `reorder-flat` command, fenced by
 * the host's per-kind order intent:
 *
 * - while the intent is in flight, a completed authoritative paint pass of that
 *   kind is deferred, so the host's older order cannot clobber the optimistic
 *   paint before the command settles;
 * - success settles the fence and lets the host's order converge;
 * - failure settles the fence, surfaces the refusal truthfully, and restores the
 *   host's authoritative order instead of leaving a display-only local move.
 *
 * `paint` runs exactly once whenever the move is meaningful locally: a row no
 * host owns and a host that cannot persist the move keep the historical
 * local-only move. A target on another host is a different order space, so the
 * move is dropped without painting.
 *
 * Returns true when a host command was dispatched.
 */

function trackOrderIntent(
  host: EntityHost,
  kind: CatalogKind,
  run: () => Promise<void>,
  release?: () => void,
): void {
  const { catalogOrder } = host;
  const settle = beginCatalogOrderIntentFor(catalogOrder.fenceKey, kind);
  void run()
    .then(() => {
      settle();
      catalogOrder.confirmOrder(kind);
    })
    .catch((error) => {
      settle();
      toast.danger(friendlyError(error));
      catalogOrder.recoverOrder(kind);
    })
    .finally(() => release?.());
}

/** Relative project move over the host's complete project order (never a reindex). */
export function dispatchHostProjectReorder(request: {
  readonly projectId: string;
  readonly targetProjectId: string;
  readonly placement: CatalogReorderPlacement;
  readonly paint: () => void;
}): boolean {
  const { projectId, targetProjectId, placement, paint } = request;
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  const host = intentHost(project ?? { id: projectId });
  if (!host) {
    paint();
    return false;
  }
  const hostTargetId = host.hostProjectId(targetProjectId);
  if (hostTargetId === undefined) return false;
  if (!host.catalogOrder.persistsOrder()) {
    paint();
    return false;
  }
  paint();
  trackOrderIntent(host, "projects", () =>
    host.runProjectCommand({
      kind: "reorder",
      projectId: host.hostId,
      targetProjectId: hostTargetId,
      placement,
    }),
  );
  return true;
}

/**
 * Relative move over one project's thread order by default. `catalog` is the
 * flat Manual list across projects: its distinct command is negotiated before
 * the optimistic paint, so a host that cannot honor it leaves no local order.
 */
export function dispatchHostThreadReorder(request: {
  readonly threadId: string;
  readonly targetThreadId: string;
  readonly placement: CatalogReorderPlacement;
  readonly scope?: "project" | "catalog";
  readonly paint: () => void;
}): boolean {
  const { threadId, targetThreadId, placement, paint } = request;
  const scope = request.scope ?? "project";
  const threads = useAppStore.getState().threads;
  const thread = threads.find((candidate) => candidate.id === threadId);
  const host = intentHost(thread);
  if (!host || !thread) {
    paint();
    return false;
  }
  const hostTargetId = host.hostThreadId(targetThreadId);
  if (hostTargetId === undefined) return false;
  const target = threads.find((candidate) => candidate.id === targetThreadId);
  const hostProjectId = host.hostProjectId(thread.projectId);
  if (
    hostProjectId === undefined ||
    (scope === "project" && target && target.projectId !== thread.projectId) ||
    (scope === "project" && !host.catalogOrder.persistsOrder())
  ) {
    paint();
    return false;
  }
  const coordinates = {
    threadId: host.hostId,
    projectId: hostProjectId,
    targetThreadId: hostTargetId,
    placement,
  };
  const release = host.pinThread(threadId);
  if (scope === "project") {
    paint();
    const command: RemoteThreadCommand = {
      kind: "reorder",
      ...coordinates,
      threadIds: [host.hostId],
    };
    trackOrderIntent(host, "threads", () => host.sendThreadCommand(command), release);
    return true;
  }
  const command: RemoteThreadCommand = { kind: "reorder-flat", ...coordinates };
  trackOrderIntent(
    host,
    "threads",
    async () => {
      const supported =
        host.catalogOrder.persistsOrder() && (await host.catalogOrder.supportsFlatThreadReorder());
      const state = useAppStore.getState();
      const source = state.threads.find((candidate) => candidate.id === threadId);
      const flatTarget = state.threads.find((candidate) => candidate.id === targetThreadId);
      if (
        !supported ||
        !host.isCurrent() ||
        !source ||
        source.projectId !== thread.projectId ||
        !ownedBy(host, source) ||
        !flatTarget ||
        !ownedBy(host, flatTarget)
      ) {
        const refusal = host.catalogOrder.flatRefusal();
        if (refusal) throw refusal;
        return;
      }
      // The send captures its client synchronously. Capture under the checked
      // connection before store listeners can retire it during optimistic paint.
      const pending = host.sendThreadCommand(command);
      paint();
      await pending;
    },
    release,
  );
  return true;
}

function ownedBy(host: EntityHost, row: Parameters<typeof entityHost>[0]): boolean {
  const owner = entityHost(row);
  return owner !== undefined && isSameHost(owner, host);
}
