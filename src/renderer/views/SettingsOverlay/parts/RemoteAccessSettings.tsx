import { useEffect, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Copy, ExternalLink, RefreshCw, ShieldCheck, Trash2, WifiOff } from "lucide-react";
import { toDataURL } from "qrcode";
import { readBridge } from "@/renderer/bridge";
import { PixelLoader } from "@/renderer/components/common";
import type { RemoteAccessPairingInfo, RemoteAccessSessionSummary } from "@/shared/remote";
import { SettingsPage } from "./SettingsForm";

interface PairingViewState {
  readonly info: RemoteAccessPairingInfo | null;
  readonly qrDataUrl: string | null;
  readonly error: string | null;
}

async function readPairingViewState(): Promise<PairingViewState> {
  const info = await readBridge().getRemoteAccessPairing();
  if (info.status !== "ready") {
    return { info, qrDataUrl: null, error: null };
  }
  const qrDataUrl = await toDataURL(info.pairingUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 8,
    type: "image/png",
    color: {
      dark: "#111827",
      light: "#ffffff",
    },
  });
  return { info, qrDataUrl, error: null };
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load remote access pairing.";
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sessionName(session: RemoteAccessSessionSummary): string {
  return session.client?.label ?? "Unnamed device";
}

function sessionMeta(session: RemoteAccessSessionSummary): string {
  const parts = [session.client?.deviceType, session.client?.os].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Remote session";
}

function PairingUnavailable(props: { status: "disabled" | "starting"; onRefresh: () => void }) {
  const copy =
    props.status === "disabled"
      ? {
          title: "Remote access is off",
          body: "Remote access is disabled for this desktop.",
        }
      : {
          title: "Remote access is starting",
          body: "The desktop server is still coming online.",
        };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--hairline)] px-4 py-4">
      <WifiOff className="mt-0.5 size-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{copy.title}</p>
        <p className="mt-1 text-xs text-muted">{copy.body}</p>
      </div>
      <Button size="sm" variant="ghost" onPress={props.onRefresh}>
        <RefreshCw className="size-3.5" />
        Refresh
      </Button>
    </div>
  );
}

function PairingReady(props: {
  info: Extract<RemoteAccessPairingInfo, { status: "ready" }>;
  qrDataUrl: string | null;
  isRefreshing: boolean;
  revokingSessionId: string | null;
  onRefresh: () => void;
  onRevoke: (sessionId: string) => void;
}) {
  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.danger(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  return (
    <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
      <div className="flex size-[240px] items-center justify-center rounded-lg border border-[var(--hairline)] bg-white p-3">
        {props.qrDataUrl ? (
          <img src={props.qrDataUrl} alt="Remote access pairing QR code" className="size-full" />
        ) : (
          <PixelLoader size="md" />
        )}
      </div>

      <div className="min-w-0 space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground">Desktop endpoint</p>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--hairline)] px-3 py-2 text-xs text-muted">
              {props.info.httpBaseUrl}
            </code>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Copy desktop endpoint"
              onPress={() => void copyValue(props.info.httpBaseUrl, "Desktop endpoint")}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-foreground">Pairing link</p>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--hairline)] px-3 py-2 text-xs text-muted">
              {props.info.pairingUrl}
            </code>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Copy pairing link"
              onPress={() => void copyValue(props.info.pairingUrl, "Pairing link")}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="primary"
            onPress={() => void readBridge().openExternal(props.info.pairingUrl)}
          >
            <ExternalLink className="size-3.5" />
            Open
          </Button>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={props.isRefreshing}
            onPress={props.onRefresh}
          >
            {props.isRefreshing ? <PixelLoader size="sm" /> : <RefreshCw className="size-3.5" />}
            New code
          </Button>
        </div>

        <div className="border-t border-[var(--hairline)] pt-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted" />
            <p className="text-sm font-medium text-foreground">Paired devices</p>
          </div>
          {props.info.sessions.length === 0 ? (
            <p className="mt-2 text-xs text-muted">No paired devices yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-[var(--hairline)] rounded-lg border border-[var(--hairline)]">
              {props.info.sessions.map((session) => {
                const name = sessionName(session);
                const revoking = props.revokingSessionId === session.id;
                return (
                  <div key={session.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{name}</p>
                      <p className="truncate text-xs text-muted">
                        {sessionMeta(session)} · expires {formatSessionTime(session.expiresAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      isDisabled={revoking}
                      aria-label={`Revoke ${name}`}
                      onPress={() => props.onRevoke(session.id)}
                    >
                      {revoking ? (
                        <PixelLoader size="sm" />
                      ) : (
                        <Trash2 className="size-3.5 text-danger" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RemoteAccessSettings() {
  const [state, setState] = useState<PairingViewState>({
    info: null,
    qrDataUrl: null,
    error: null,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const isLoading = state.info === null && state.error === null;

  useEffect(() => {
    let cancelled = false;
    async function loadInitialPairing() {
      try {
        const next = await readPairingViewState();
        if (!cancelled) {
          setState(next);
        }
      } catch (error) {
        if (!cancelled) {
          setState({ info: null, qrDataUrl: null, error: friendlyError(error) });
        }
      }
    }
    void loadInitialPairing();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      setState(await readPairingViewState());
    } catch (error) {
      const message = friendlyError(error);
      setState({ info: null, qrDataUrl: null, error: message });
      toast.danger(message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    try {
      const result = await readBridge().revokeRemoteAccessSession({ sessionId });
      if (result.revoked) {
        toast.success("Remote session revoked.");
      } else {
        toast.danger("That remote session was already gone.");
      }
      setState(await readPairingViewState());
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "Unable to revoke remote session.");
    } finally {
      setRevokingSessionId(null);
    }
  };

  return (
    <SettingsPage
      title="Remote Access"
      description="Pair a phone, tablet, or browser with this desktop."
    >
      {isLoading ? (
        <div className="flex items-center gap-3 text-sm text-muted">
          <PixelLoader size="sm" />
          Loading remote access…
        </div>
      ) : state.error ? (
        <div className="rounded-lg border border-danger/30 px-4 py-3 text-sm text-danger">
          {state.error}
        </div>
      ) : state.info?.status === "ready" ? (
        <PairingReady
          info={state.info}
          qrDataUrl={state.qrDataUrl}
          isRefreshing={isRefreshing}
          revokingSessionId={revokingSessionId}
          onRefresh={refresh}
          onRevoke={(sessionId) => void revokeSession(sessionId)}
        />
      ) : (
        <PairingUnavailable status={state.info?.status ?? "starting"} onRefresh={refresh} />
      )}
    </SettingsPage>
  );
}
