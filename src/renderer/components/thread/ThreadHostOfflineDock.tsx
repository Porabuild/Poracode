import { useEffect, useState, type MouseEvent } from "react";
import { AlertTriangle, Link2, RefreshCw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common/Button";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { retryManagedLoopbackIntake } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { type HostOfflineOwner, isSessionExpiredFailure } from "./ThreadHostOfflineDockModel";
import { ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

/**
 * Bounded pending window for the managed host's loopback retry. That leg has no
 * per-connection "connecting" runtime row to read, so the local state shows a
 * truthful "Reconnecting…" and suppresses repeated jobs until either the intake
 * comes back (the parent's offline flag clears and this notice unmounts) or the
 * attempt settles. `retryManagedLoopbackIntake` is itself a no-op while an
 * intake is live, so a late second press never starts a duplicate leg.
 */
const MANAGED_RETRY_PENDING_MS = 4_000;

/**
 * Keeping focus off the action button avoids a one-frame focus blink when the
 * button swaps to its pending/disabled state during the reconnect.
 */
function preventFocusSteal(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
}

/**
 * Composer notice for a thread whose host lost its connection, whichever host
 * that is: the conversation may lag the host until it reconnects. The owner is
 * derived from the current thread by {@link resolveHostOfflineOwner} in
 * ThreadComposerSection, so the offline notice and its retry always refer to the
 * same host — a paired connection via `reconnectServer`, or the desktop's own
 * host via `retryManagedLoopbackIntake`. Both go through the real connect path;
 * this notice never marks a connection online itself.
 */
export function ThreadHostOfflineDock({ owner }: { readonly owner: HostOfflineOwner }) {
  const { t } = useLingui();
  const reconnectServer = useRemoteServersStore((state) => state.reconnectServer);
  const pairedRuntime = useRemoteServersStore((state) =>
    owner.kind === "paired" ? state.runtime[owner.connectionKey] : undefined,
  );
  const [managedPending, setManagedPending] = useState(false);

  useEffect(() => {
    if (!managedPending || owner.kind !== "managed") return;
    const timer = window.setTimeout(() => setManagedPending(false), MANAGED_RETRY_PENDING_MS);
    return () => window.clearTimeout(timer);
  }, [managedPending, owner.kind]);

  const connecting =
    owner.kind === "paired" ? pairedRuntime?.status === "connecting" : managedPending;
  const sessionExpired =
    owner.kind === "paired" &&
    isSessionExpiredFailure(pairedRuntime?.status, pairedRuntime?.message);

  const message = sessionExpired
    ? t`Pairing expired — pair again to reconnect.`
    : connecting
      ? t`Reconnecting to the server…`
      : t`Server offline — this conversation may be out of date.`;

  function handleRetry(): void {
    if (connecting) return;
    if (owner.kind === "paired") {
      // Generation-safe: reconnectServer fences stale attempts and dedupes the
      // in-flight connection pass. Status flips to "connecting" synchronously,
      // which is what keeps this button pending without starting a second job.
      void reconnectServer(owner.connectionKey).catch(() => undefined);
      return;
    }
    setManagedPending(true);
    retryManagedLoopbackIntake();
  }

  function handlePairAgain(): void {
    // A retired session cannot reconnect in place; connect/pair settings own
    // creating a fresh pairing for this host. Opening settings is a surface
    // change only — the thread, its transcript, cursor and pending requests
    // stay in place.
    usePanelStore.getState().openSettingsSection("remoteServers");
  }

  return (
    <ThreadDockSection placement="composer" collapsed>
      <ThreadDockHeader
        icon={AlertTriangle}
        iconClassName="text-warning"
        title={t`Warning`}
        actions={
          sessionExpired ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-w-0 px-2 text-xs text-foreground"
              onMouseDown={preventFocusSteal}
              onPress={handlePairAgain}
            >
              <Link2 className="size-3.5" />
              <Trans>Connect</Trans>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-w-0 px-2 text-xs text-foreground"
              isDisabled={connecting}
              onMouseDown={preventFocusSteal}
              onPress={handleRetry}
            >
              <RefreshCw className={`size-3.5 ${connecting ? "animate-spin" : ""}`} />
              {connecting ? <Trans>Connecting…</Trans> : <Trans>Reconnect</Trans>}
            </Button>
          )
        }
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
