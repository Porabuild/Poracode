import { useId, useState, useSyncExternalStore } from "react";
import { toast } from "@heroui/react";
import { AlertTriangle, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common/Button";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useAppStore } from "@/renderer/state/appStore";
import {
  readThreadHistoryNotice,
  subscribeThreadHistoryNotices,
  type ThreadHistoryNoticeEntry,
} from "@/renderer/state/remote/historyNoticeStore";
import {
  acknowledgeThreadHistoryNotice,
  hostSupportsRuntimeHistoryNotices,
  requestThreadHistoryGap,
} from "@/renderer/state/remote/historyNoticeActions";
import { managedRootSupportsRuntimeHistoryNotices } from "@/renderer/state/managedRootCatalog/rootHistory";
import {
  threadHistoryNoticeFingerprint,
  useThreadHistoryNoticeDockStore,
} from "@/renderer/state/threadHistoryNoticeDockStore";
import {
  ThreadDockCollapseButton,
  ThreadDockHeader,
  ThreadDockIconButton,
  ThreadDockSection,
} from "./ThreadDockUI";

/**
 * The thread's incomplete-history entry while the composer should show it:
 * any open episode or pending review, or an acknowledged notice the user has
 * not dismissed since its last acknowledgement.
 */
export function useVisibleThreadHistoryNotice(
  threadId: string,
): ThreadHistoryNoticeEntry | undefined {
  const entry = useSyncExternalStore(
    subscribeThreadHistoryNotices,
    () => readThreadHistoryNotice(threadId),
    () => undefined,
  );
  const dismissedFingerprint = useThreadHistoryNoticeDockStore(
    (state) => state.dismissedByThreadId[threadId],
  );
  if (!entry) return undefined;
  if (entry.gap || entry.needsReview) return entry;
  if (!entry.notice) return undefined;
  return dismissedFingerprint === threadHistoryNoticeFingerprint(entry.notice) ? undefined : entry;
}

/**
 * B1 durable history-incomplete dock (composer).
 *
 * Renders from authoritative history snapshots AND item pages (the store
 * retains the notice across later turns, pagination, reset/truncate and
 * reconnect). Acknowledgement is an explicit action that permits continuing
 * with incomplete history; it neither restores missing content nor certifies
 * that the producer retired. Counts are cumulative lower bounds and are never
 * rendered as exact totals. Only an acknowledged notice is dismissible, and the
 * dismissal is local presentation state.
 */
export function ThreadHistoryNoticeDock({
  threadId,
  entry,
}: {
  readonly threadId: string;
  readonly entry: ThreadHistoryNoticeEntry;
}) {
  const { t } = useLingui();
  const messageId = useId();
  const [collapsed, setCollapsed] = useState(true);
  const [busy, setBusy] = useState(false);
  const servers = useRemoteServersStore((state) => state.servers);
  const thread = useAppStore((state) => state.threads.find((item) => item.id === threadId));
  const dismiss = useThreadHistoryNoticeDockStore((state) => state.dismiss);

  const server = thread?.remoteServerId
    ? servers.find((candidate) => remoteConnectionKey(candidate) === thread.remoteServerId)
    : undefined;
  // Root rows have no server record; their authority is the live managed
  // activation. Only an authority that advertised the capability offers the
  // explicit recovery read.
  const capabilityAdvertised =
    thread !== undefined && thread.remoteServerId === undefined
      ? managedRootSupportsRuntimeHistoryNotices()
      : server !== undefined
        ? hostSupportsRuntimeHistoryNotices(server)
        : false;
  const descriptor = entry.gap;
  const acknowledgedNotice = !descriptor && !entry.needsReview ? entry.notice : null;

  async function review(): Promise<void> {
    setBusy(true);
    try {
      const outcome = await requestThreadHistoryGap(threadId);
      if (outcome === "unsupported") return;
      if (outcome === "failed") {
        toast.danger(t`The history notice could not be read from the server.`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function acknowledge(): Promise<void> {
    setBusy(true);
    try {
      const outcome = await acknowledgeThreadHistoryNotice(threadId);
      if (outcome === "stale") {
        toast.warning(
          t`The incomplete-history notice changed on the server. Review the updated details before continuing.`,
        );
      } else if (outcome === "uncertain") {
        toast.warning(t`The server could not confirm the acknowledgement. Retry to continue.`);
      } else if (outcome === "failed") {
        toast.danger(t`The acknowledgement failed.`);
      }
    } finally {
      setBusy(false);
    }
  }

  const refusedEvents = descriptor?.refusedEvents ?? entry.notice?.refusedEvents ?? 0;
  const refusedBytes = descriptor?.refusedBytes ?? entry.notice?.refusedBytes ?? 0;
  const lossMessage = t`Part of this conversation's history was lost on the server and could not be shown. At least ${refusedEvents} events / ${refusedBytes} bytes are affected.`;
  const message = entry.needsReview
    ? t`Part of this conversation's history may be missing on the server. Review the recovery options before continuing.`
    : descriptor
      ? `${lossMessage} ${t`Continuing will keep the remaining history and mark this episode acknowledged; it does not restore the missing content.`}`
      : `${lossMessage} ${t`This episode has been acknowledged; the missing content is not restored.`}`;

  const messageText = (
    <span
      id={messageId}
      role="status"
      title={message}
      className={
        collapsed
          ? "min-w-0 flex-1 truncate leading-5 text-[color:var(--muted)]"
          : "whitespace-pre-wrap break-words px-2 pb-1.5 leading-5 text-[color:var(--muted)]"
      }
    >
      {message}
    </span>
  );

  return (
    <ThreadDockSection placement="composer" collapsed={collapsed}>
      <ThreadDockHeader
        icon={AlertTriangle}
        iconClassName="text-warning"
        title={t`Warning`}
        actions={
          <div className="flex shrink-0 items-center gap-1">
            {descriptor || (entry.needsReview && capabilityAdvertised) ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 min-w-0 px-2 text-xs text-foreground"
                isDisabled={busy}
                onPress={() => void (descriptor ? acknowledge() : review())}
              >
                {descriptor ? (
                  <Trans>Continue with incomplete history</Trans>
                ) : (
                  <Trans>Review recovery</Trans>
                )}
              </Button>
            ) : null}
            <ThreadDockCollapseButton
              collapsed={collapsed}
              label={collapsed ? t`Expand warning` : t`Collapse warning`}
              controlsId={messageId}
              onPress={() => setCollapsed(!collapsed)}
            />
            {acknowledgedNotice ? (
              <ThreadDockIconButton
                label={t`Dismiss warning`}
                tooltip={t`Dismiss`}
                onPress={() => dismiss(threadId, acknowledgedNotice)}
              >
                <X className="size-3.5" />
              </ThreadDockIconButton>
            ) : null}
          </div>
        }
      >
        {collapsed ? messageText : null}
      </ThreadDockHeader>
      {collapsed ? null : messageText}
    </ThreadDockSection>
  );
}
