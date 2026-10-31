import { AlertTriangle } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common/Button";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { Thread } from "@/shared/contracts";
import { ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

type RemoteSyncWarning = "deletion-unconfirmed" | "server-offline";

/** Why a remote thread's transcript may lag its host, most actionable first. */
export function useThreadRemoteSyncWarning(
  thread: Pick<Thread, "remoteServerId" | "remoteId">,
): RemoteSyncWarning | null {
  // The server deleted transcript this pane could not confirm (bounded
  // authoritative reloads exhausted), so the view may lag the host.
  const deletionUnconfirmed = useAppStore((s) => {
    if (!thread.remoteServerId || !thread.remoteId) return false;
    return s.truncateReloadExhausted[`${thread.remoteServerId}\u0000${thread.remoteId}`] === true;
  });
  const serverOffline = useRemoteServersStore((s) => {
    if (!thread.remoteServerId) return false;
    const runtimeStatus = s.runtime[thread.remoteServerId]?.status;
    return runtimeStatus === "offline" || runtimeStatus === "error";
  });
  if (deletionUnconfirmed) return "deletion-unconfirmed";
  return serverOffline ? "server-offline" : null;
}

export function ThreadRemoteSyncDock(props: {
  thread: Pick<Thread, "remoteServerId" | "remoteId">;
}) {
  const { t } = useLingui();
  const warning = useThreadRemoteSyncWarning(props.thread);
  if (!warning) return null;
  const remoteServerId = props.thread.remoteServerId;
  const message =
    warning === "deletion-unconfirmed"
      ? t`A message deletion could not be confirmed. Refresh to resync this conversation.`
      : t`Server offline — this conversation may be out of date.`;

  return (
    <ThreadDockSection placement="composer" collapsed>
      <ThreadDockHeader
        icon={AlertTriangle}
        iconClassName="text-warning"
        title={t`Warning`}
        {...(warning === "deletion-unconfirmed" && remoteServerId
          ? {
              actions: (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 min-w-0 px-2 text-xs text-foreground"
                  onPress={() =>
                    void useRemoteServersStore
                      .getState()
                      .refreshServer(remoteServerId, { includeAgentStatuses: false })
                  }
                >
                  <Trans>Refresh</Trans>
                </Button>
              ),
            }
          : {})}
      >
        <span
          role="status"
          title={message}
          className="min-w-0 flex-1 truncate leading-5 text-[color:var(--muted)]"
        >
          {message}
        </span>
      </ThreadDockHeader>
    </ThreadDockSection>
  );
}
