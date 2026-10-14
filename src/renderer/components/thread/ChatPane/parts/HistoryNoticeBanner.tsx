import { useState, useSyncExternalStore } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast, Button } from "@heroui/react";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useAppStore } from "@/renderer/state/appStore";
import {
  readThreadHistoryNotice,
  subscribeThreadHistoryNotices,
} from "@/renderer/state/remote/historyNoticeStore";
import {
  acknowledgeThreadHistoryNotice,
  hostSupportsRuntimeHistoryNotices,
  requestThreadHistoryGap,
} from "@/renderer/state/remote/historyNoticeActions";
import { managedRootSupportsRuntimeHistoryNotices } from "@/renderer/state/managedRootCatalog/rootHistory";

/**
 * B1 durable history-incomplete banner (ChatPane).
 *
 * Renders from authoritative history snapshots AND item pages (the store
 * retains the notice across later turns, pagination, reset/truncate and
 * reconnect). Acknowledgement is an explicit action that permits continuing
 * with incomplete history; it neither restores missing content nor certifies
 * that the producer retired. Counts are cumulative lower bounds and are never
 * rendered as exact totals.
 */
export function ThreadHistoryNoticeBanner({ threadId }: { readonly threadId: string }) {
  const { t } = useLingui();
  const entry = useSyncExternalStore(
    subscribeThreadHistoryNotices,
    () => readThreadHistoryNotice(threadId),
    () => undefined,
  );
  const [busy, setBusy] = useState(false);
  const servers = useRemoteServersStore((state) => state.servers);
  const thread = useAppStore((state) => state.threads.find((item) => item.id === threadId));

  if (!entry || (!entry.notice && !entry.gap && !entry.needsReview)) return null;

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

  return (
    <div
      className="flex items-start justify-between gap-2 border-b border-warning-soft-foreground/20 bg-warning-soft/60 px-3 py-1.5 text-xs text-warning-soft-foreground"
      role="status"
    >
      <span className="min-w-0">
        {entry.needsReview ? (
          <Trans>
            Part of this conversation's history may be missing on the server. Review the recovery
            options before continuing.
          </Trans>
        ) : (
          <>
            <Trans>
              Part of this conversation's history was lost on the server and could not be shown. At
              least {refusedEvents} events / {refusedBytes} bytes are affected.
            </Trans>{" "}
            {descriptor ? (
              <Trans>
                Continuing will keep the remaining history and mark this episode acknowledged; it
                does not restore the missing content.
              </Trans>
            ) : entry.notice ? (
              <Trans>
                This episode has been acknowledged; the missing content is not restored.
              </Trans>
            ) : null}
          </>
        )}
      </span>
      {descriptor ? (
        <Button size="sm" variant="ghost" isDisabled={busy} onPress={() => void acknowledge()}>
          <Trans>Continue with incomplete history</Trans>
        </Button>
      ) : entry.needsReview && capabilityAdvertised ? (
        <Button size="sm" variant="ghost" isDisabled={busy} onPress={() => void review()}>
          <Trans>Review recovery</Trans>
        </Button>
      ) : null}
    </div>
  );
}
