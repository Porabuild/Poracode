import { useEffect, useState } from "react";
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

export function HistoryItemDetailPlaceholder({
  failed,
  retry,
}: {
  failed: boolean;
  retry(): void;
}) {
  const { t } = useLingui();
  return failed ? (
    <Button size="sm" variant="tertiary" onPress={retry}>{t`Retry`}</Button>
  ) : (
    <Spinner size="sm" aria-label={t`Loading…`} />
  );
}
