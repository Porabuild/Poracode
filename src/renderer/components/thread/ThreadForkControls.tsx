import { GitFork, MonitorUp } from "lucide-react";
import { Surface, toast, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { canForkThread } from "@/shared/threadFork";
import { friendlyError } from "@/shared/messages";
import { useAppStore } from "@/renderer/state/appStore";
import { getThreadMap, useThread } from "@/renderer/state/useThread";
import { findExperimentByThreadId } from "@/renderer/state/experimentStore";
import { useThreadForkStore } from "@/renderer/state/threadForkStore";
import { openThreadForkSource } from "@/renderer/actions/threadForkActions";
import { Button } from "@/renderer/components/common/Button";
import { useHostAgentStatusPools } from "@/renderer/hooks/useHostAgentStatuses";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { localEnvLabel } from "@/renderer/utils/machineLabels";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import { selectCompletedTurnsByAnchorItem } from "./ChatPane/chatPaneSelectors";
import { chatMessageSurfaceClass } from "./ChatPane/parts/items/chatMessageSurface";

/**
 * Whether the thread's fork/move boundary ("Inherited history ends here" or
 * the transfer row) renders inside the given timeline entry's row. The
 * boundary may sit on the raw `throughItemId` or on the visible row its
 * completed turn resolved to.
 */
export function selectForkBoundaryInEntry(
  state: AppStoreState,
  threadId: string,
  itemIds: readonly string[],
): boolean {
  const boundary = getThreadMap(state.threads).get(threadId)?.forkedFrom?.throughItemId;
  if (!boundary) return false;
  if (itemIds.includes(boundary)) return true;
  const rawTurn = state.runtimeCompletedTurnsByThread[threadId]?.find(
    (turn) => turn.anchorItemId === boundary,
  );
  if (!rawTurn) return false;
  const resolved = selectCompletedTurnsByAnchorItem(state, threadId);
  return itemIds.some((id) => resolved.get(id)?.startedAt === rawTurn.startedAt);
}

export function ThreadForkTurnAction({
  threadId,
  itemId,
  startedAt,
  alwaysVisible = false,
}: {
  threadId: string;
  itemId: string;
  startedAt?: number;
  alwaysVisible?: boolean;
}) {
  const { t } = useLingui();
  const available = useAppStore((state) => {
    const thread = getThreadMap(state.threads).get(threadId);
    return thread !== undefined && canForkThread(thread);
  });
  const persistedAnchor = useAppStore((state) =>
    startedAt === undefined
      ? itemId
      : (state.runtimeCompletedTurnsByThread[threadId]?.find((turn) => turn.startedAt === startedAt)
          ?.anchorItemId ?? null),
  );
  if (!available || findExperimentByThreadId(threadId)) return null;
  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger
        className={`opacity-100 transition-opacity ${alwaysVisible ? "" : "[@media(hover:hover)]:opacity-0"} [@media(hover:hover)]:group-hover/checkpoint:opacity-100 [@media(hover:hover)]:focus-within:opacity-100`}
      >
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label={t`Fork from here`}
          className="size-6 min-w-6 text-muted"
          isDisabled={!persistedAnchor}
          onPress={() => {
            if (persistedAnchor) useThreadForkStore.getState().request(threadId, persistedAnchor);
          }}
        >
          <GitFork className="size-3.5" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="top">
        <Trans>Fork from here</Trans>
      </Tooltip.Content>
    </Tooltip>
  );
}

export function ThreadForkOrigin({ threadId }: { threadId: string }) {
  const thread = useThread(threadId);
  const fork = thread?.forkedFrom;
  if (!fork) return null;
  const sourceTitle = fork.title;
  // A moved thread is the same conversation continuing elsewhere: its history
  // reads straight through, marked only by the inline move row.
  if (fork.transfer) return null;
  return (
    <div
      className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1 text-xs text-muted"
      data-testid="thread-fork-source"
    >
      <GitFork className="size-3 shrink-0" />
      <Button
        variant="ghost"
        size="sm"
        className="h-6 min-w-0 justify-start truncate px-1 text-xs text-muted"
        onPress={() => {
          void openThreadForkSource(thread).catch((error) => toast.danger(friendlyError(error)));
        }}
      >
        <span className="truncate">
          <Trans>Forked from {sourceTitle}</Trans>
        </span>
      </Button>
    </div>
  );
}

export function ThreadForkBoundary({
  threadId,
  itemIds,
}: {
  threadId: string;
  itemIds: readonly string[];
}) {
  const moved = useAppStore(
    (state) => !!getThreadMap(state.threads).get(threadId)?.forkedFrom?.transfer,
  );
  const isBoundary = useAppStore((state) => selectForkBoundaryInEntry(state, threadId, itemIds));
  if (!isBoundary) return null;
  if (moved) return <ThreadTransferRow threadId={threadId} />;
  return (
    <div
      className="my-3 flex items-center gap-3 text-xs text-muted"
      data-testid="thread-fork-boundary"
    >
      <span className="h-px flex-1 bg-border" />
      <Trans>Inherited history ends here</Trans>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Inline marker where a moved thread continued on another machine, styled
 * like the provider-switch row: the history above ran there, everything
 * below runs here.
 */
function ThreadTransferRow({ threadId }: { threadId: string }) {
  const { t } = useLingui();
  const thread = useThread(threadId);
  const pools = useHostAgentStatusPools(thread?.remoteServerId);
  const transfer = thread?.forkedFrom?.transfer;
  // Prefer the names this client gives its machines over the hosts' own identity labels.
  const knownSource = useRemoteServersStore((state) => {
    const server = state.servers.find((entry) => entry.desktopId === transfer?.sourceHostId);
    return server ? desktopTitle(server.label) : undefined;
  });
  const knownTarget = useRemoteServersStore((state) => {
    if (thread?.remoteServerId === undefined) return undefined;
    const server = state.servers.find(
      (entry) => remoteConnectionKey(entry) === thread.remoteServerId,
    );
    return server ? desktopTitle(server.label) : undefined;
  });
  if (!transfer) return null;
  const sourceHost = knownSource ?? transfer.sourceHostLabel;
  const targetHost =
    knownTarget ??
    (thread.remoteServerId === undefined
      ? localEnvLabel({ kind: "native" })
      : transfer.targetHostLabel);
  const agentLabel = transfer.fromAgentKind
    ? ([...pools.windows, ...pools.wsl].find((status) => status.kind === thread.agentKind)?.label ??
      thread.agentKind)
    : undefined;
  const moved = targetHost
    ? t`Moved from ${sourceHost} to ${targetHost}`
    : t`Moved from ${sourceHost}`;
  return (
    <Surface variant="transparent" className={chatMessageSurfaceClass}>
      <div
        className="flex min-w-0 flex-col items-stretch justify-center text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted"
        data-testid="thread-transfer-row"
      >
        <span className="inline-flex min-w-0 items-center gap-1.5 self-start leading-none italic opacity-80">
          <MonitorUp className="size-3 shrink-0" />
          {agentLabel ? t`${moved} · continued with ${agentLabel}` : moved}
        </span>
      </div>
    </Surface>
  );
}
