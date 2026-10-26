import { useEffect, useEffectEvent, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { Button, Spinner } from "@heroui/react";
import { acquireHistoryItemDetails } from "@/renderer/state/historyItemDetails";
import { toRuntimeChatItem, type RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { useChatPaneActions } from "../../chatPaneActionsContext";

export function useHistoryItemDetails(source: RuntimeChatItem, expanded: boolean) {
  const threadId = useChatPaneActions()?.threadId;
  const [result, setResult] = useState<{
    source: RuntimeChatItem;
    attempt: number;
    item?: RuntimeChatItem;
    failed?: true;
  }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!expanded || !source.detailsDeferred || !threadId) return;
    const read = acquireHistoryItemDetails(threadId, source);
    let active = true;
    void read.promise.then(
      (item) => {
        if (active) setResult({ source, attempt: retry, item: toRuntimeChatItem(item) });
      },
      () => {
        if (active) setResult({ source, attempt: retry, failed: true });
      },
    );
    return () => {
      active = false;
      read.release();
      setResult((current) =>
        current?.source === source && current.attempt === retry ? undefined : current,
      );
    };
  }, [source, expanded, threadId, retry]);
  const current = result?.source === source && result.attempt === retry ? result : undefined;
  return {
    item: current?.item ?? source,
    pending: expanded && source.detailsDeferred === true && !current?.item,
    failed: current?.failed === true,
    retry: () => {
      setResult(undefined);
      setRetry((value) => value + 1);
    },
  };
}

/** A merged view loads at most this many deferred rows at once. */
const MAX_GROUP_DETAIL_ROWS = 12;

/**
 * Resolves the deferred rows of a small group together, for views that merge
 * several rows into one body (same-file edit runs) and so cannot load one row at
 * a time. Mount it only while the body is open. `ready` carries the complete
 * rows. `unmerged` means the run is too long or a read failed: render each row
 * on its own, in order, and let it load (and retry) individually.
 */
export function useResolvedDeferredItems(items: readonly RuntimeChatItem[]) {
  const threadId = useChatPaneActions()?.threadId;
  const deferred = items.filter((item) => item.detailsDeferred);
  const eligible =
    threadId !== undefined && deferred.length > 0 && deferred.length <= MAX_GROUP_DETAIL_ROWS;
  const key = eligible ? JSON.stringify([threadId, deferred.map((item) => item.id)]) : "";
  const [result, setResult] = useState<{
    key: string;
    byId: Map<string, RuntimeChatItem> | null;
  }>();
  const start = useEffectEvent((readKey: string) => {
    const reads = deferred.map((item) => acquireHistoryItemDetails(threadId!, item));
    let active = true;
    void Promise.allSettled(reads.map((read) => read.promise)).then((settled) => {
      if (!active) return;
      const byId = new Map<string, RuntimeChatItem>();
      for (const [index, outcome] of settled.entries()) {
        if (outcome.status === "fulfilled")
          byId.set(deferred[index]!.id, toRuntimeChatItem(outcome.value));
      }
      setResult({ key: readKey, byId: byId.size === deferred.length ? byId : null });
    });
    return () => {
      active = false;
      for (const read of reads) read.release();
    };
  });
  useEffect(() => {
    if (key === "") return;
    return start(key);
  }, [key]);
  if (deferred.length === 0) return { items, status: "ready" as const };
  if (key === "") return { items, status: "unmerged" as const };
  const byId = result?.key === key ? result.byId : undefined;
  if (byId === undefined) return { items, status: "pending" as const };
  if (byId === null) return { items, status: "unmerged" as const };
  return { items: items.map((item) => byId.get(item.id) ?? item), status: "ready" as const };
}

export function HistoryItemDetailPlaceholder({
  failed = false,
  retry,
}: {
  failed?: boolean;
  retry?(): void;
}) {
  const { t } = useLingui();
  return failed ? (
    <Button size="sm" variant="tertiary" {...(retry ? { onPress: retry } : {})}>
      {t`Retry`}
    </Button>
  ) : (
    <Spinner size="sm" aria-label={t`Loading…`} />
  );
}
