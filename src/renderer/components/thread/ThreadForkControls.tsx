import { GitFork } from "lucide-react";
import { toast, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { canForkThread } from "@/shared/threadFork";
import { friendlyError } from "@/shared/messages";
import { useAppStore } from "@/renderer/state/appStore";
import { getThreadMap, useThread } from "@/renderer/state/useThread";
import { findExperimentByThreadId } from "@/renderer/state/experimentStore";
import { useThreadForkStore } from "@/renderer/state/threadForkStore";
import { openThreadForkSource } from "@/renderer/actions/threadForkActions";
import { Button } from "@/renderer/components/common/Button";
import { selectCompletedTurnsByAnchorItem } from "./ChatPane/chatPaneSelectors";

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
  const isBoundary = useAppStore((state) => {
    const boundary = getThreadMap(state.threads).get(threadId)?.forkedFrom?.throughItemId;
    if (!boundary) return false;
    if (itemIds.includes(boundary)) return true;
    const rawTurn = state.runtimeCompletedTurnsByThread[threadId]?.find(
      (turn) => turn.anchorItemId === boundary,
    );
    if (!rawTurn) return false;
    const resolved = selectCompletedTurnsByAnchorItem(state, threadId);
    return itemIds.some((id) => resolved.get(id)?.startedAt === rawTurn.startedAt);
  });
  if (!isBoundary) return null;
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
