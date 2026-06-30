import { useEffect, useState } from "react";
import { Button, Switch, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Copy, ExternalLink, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
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
  return pairingViewStateFromInfo(info);
}

async function pairingViewStateFromInfo(info: RemoteAccessPairingInfo): Promise<PairingViewState> {
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

function friendlyError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
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

function sessionName(session: RemoteAccessSessionSummary, fallback: string): string {
  return session.client?.label ?? fallback;
}

function sessionMeta(session: RemoteAccessSessionSummary, fallback: string): string {
  const parts = [session.client?.deviceType, session.client?.os].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : fallback;
}

function pairingTokenFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const token = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
    return token && token.trim().length > 0 ? token : null;
  } catch {
    return null;
  }
}

function RemoteAccessSwitch(props: {
  status: RemoteAccessPairingInfo["status"] | null;
  isDisabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const { t } = useLingui();
  const enabled = props.status === "ready" || props.status === "starting";

  return (
    <Switch
      isSelected={enabled}
      isDisabled={props.isDisabled}
      aria-label={t`Remote Access`}
      onChange={props.onChange}
    >
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
    </Switch>
  );
}

function RemoteAccessHeaderDescription(props: {
  status: RemoteAccessPairingInfo["status"] | null;
}) {
  const { t } = useLingui();
  const statusLabel =
    props.status === "ready" ? t`Online` : props.status === "starting" ? t`Starting` : t`Off`;
  const body =
    props.status === "ready"
      ? t`Devices can pair while this desktop is reachable.`
      : props.status === "starting"
        ? t`The desktop server is still coming online.`
        : props.status === "disabled"
          ? t`Turn on remote access to show a pairing code.`
          : t`Pair a phone, tablet, or browser with this desktop.`;
  const statusClass =
    props.status === "ready"
      ? "bg-emerald-400"
      : props.status === "starting"
        ? "bg-accent"
        : "bg-muted/60";

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {props.status ? (
        <span className="inline-flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${statusClass}`} />
          {statusLabel}
        </span>
      ) : null}
      <span>{body}</span>
    </span>
  );
}

function CopyValueRow(props: {
  label: string;
  value: string;
  copyLabel: string;
  failureMessage: string;
  onCopy: (value: string, label: string, failureMessage: string) => void;
}) {
  const { t } = useLingui();

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2rem] gap-2 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{props.label}</p>
        <code className="mt-1 block min-w-0 truncate font-mono text-xs text-muted">
          {props.value}
        </code>
      </div>
      <Button
        size="sm"
        variant="ghost"
        isIconOnly
        aria-label={props.copyLabel}
        onPress={() => props.onCopy(props.value, props.label, props.failureMessage)}
      >
        <Copy className="size-3.5" />
        <span className="sr-only">{t`Copy`}</span>
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
  const { t } = useLingui();
  const desktopEndpointLabel = t`Desktop endpoint`;
  const pairingTokenLabel = t`Pairing token`;
  const pairingLinkLabel = t`Pairing link`;
  const unnamedDeviceLabel = t`Unnamed device`;
  const remoteSessionLabel = t`Remote session`;
  const pairingToken = pairingTokenFromUrl(props.info.pairingUrl);
  const pairedDevices = (
    <div className="max-w-[42rem]">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-muted" />
        <p className="text-sm font-medium text-foreground">
          <Trans>Paired devices</Trans>
        </p>
      </div>
      {props.info.sessions.length === 0 ? (
        <p className="mt-2 text-xs text-muted">
          <Trans>No paired devices yet.</Trans>
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {props.info.sessions.map((session) => {
            const name = sessionName(session, unnamedDeviceLabel);
            const meta = sessionMeta(session, remoteSessionLabel);
            const expiresAt = formatSessionTime(session.expiresAt);
            const revoking = props.revokingSessionId === session.id;
            return (
              <div key={session.id} className="flex items-center gap-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{name}</p>
                  <p className="truncate text-xs text-muted">{t`${meta} · expires ${expiresAt}`}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  isDisabled={revoking}
                  aria-label={t`Revoke ${name}`}
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
  );

  const copyValue = async (value: string, label: string, failureMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t`${label} copied.`);
    } catch {
      toast.danger(failureMessage);
    }
  };
  const handleCopy = (value: string, label: string, failureMessage: string) =>
    void copyValue(value, label, failureMessage);

  return (
    <div className="space-y-10">
      <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="flex aspect-square w-full max-w-[260px] items-center justify-center bg-white p-3">
            {props.qrDataUrl ? (
              <img
                src={props.qrDataUrl}
                alt={t`Remote access pairing QR code`}
                className="size-full"
              />
            ) : (
              <PixelLoader size="md" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="tertiary"
              onPress={() => void readBridge().openExternal(props.info.pairingUrl)}
            >
              <ExternalLink className="size-3.5" />
              <Trans>Open</Trans>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isDisabled={props.isRefreshing}
              onPress={props.onRefresh}
            >
              {props.isRefreshing ? <PixelLoader size="sm" /> : <RefreshCw className="size-3.5" />}
              <Trans>New code</Trans>
            </Button>
          </div>
        </div>

        <div className="min-w-0 space-y-1">
          <CopyValueRow
            label={desktopEndpointLabel}
            value={props.info.httpBaseUrl}
            copyLabel={t`Copy desktop endpoint`}
            failureMessage={t`Unable to copy desktop endpoint.`}
            onCopy={handleCopy}
          />
          {pairingToken ? (
            <CopyValueRow
              label={pairingTokenLabel}
              value={pairingToken}
              copyLabel={t`Copy pairing token`}
              failureMessage={t`Unable to copy pairing token.`}
              onCopy={handleCopy}
            />
          ) : null}
          <CopyValueRow
            label={pairingLinkLabel}
            value={props.info.pairingUrl}
            copyLabel={t`Copy pairing link`}
            failureMessage={t`Unable to copy pairing link.`}
            onCopy={handleCopy}
          />
        </div>
      </div>
      {pairedDevices}
    </div>
  );
}

export function RemoteAccessSettings() {
  const { t } = useLingui();
  const [state, setState] = useState<PairingViewState>({
    info: null,
    qrDataUrl: null,
    error: null,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
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
          setState({
            info: null,
            qrDataUrl: null,
            error: friendlyError(error, t`Unable to load remote access pairing.`),
          });
        }
      }
    }
    void loadInitialPairing();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      setState(await readPairingViewState());
    } catch (error) {
      const message = friendlyError(error, t`Unable to load remote access pairing.`);
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
        toast.success(t`Remote session revoked.`);
      } else {
        toast.danger(t`That remote session was already gone.`);
      }
      setState(await readPairingViewState());
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : t`Unable to revoke remote session.`);
    } finally {
      setRevokingSessionId(null);
    }
  };

  const toggleRemoteAccess = async (enabled: boolean) => {
    setIsToggling(true);
    setState((current) => ({
      ...current,
      info: enabled ? { status: "starting" } : { status: "disabled" },
      qrDataUrl: null,
      error: null,
    }));
    try {
      const info = await readBridge().setRemoteAccessEnabled({ enabled });
      setState(await pairingViewStateFromInfo(info));
    } catch (error) {
      const message = friendlyError(error, t`Unable to update remote access.`);
      toast.danger(message);
      try {
        setState(await readPairingViewState());
      } catch {
        setState({ info: null, qrDataUrl: null, error: message });
      }
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <SettingsPage
      title={t`Remote Access`}
      description={<RemoteAccessHeaderDescription status={state.info?.status ?? null} />}
      actions={
        state.info || isToggling ? (
          <RemoteAccessSwitch
            status={state.info?.status ?? null}
            isDisabled={isToggling || state.info?.status === "starting"}
            onChange={(enabled) => void toggleRemoteAccess(enabled)}
          />
        ) : null
      }
    >
      {isLoading ? (
        <div className="flex items-center gap-3 text-sm text-muted">
          <PixelLoader size="sm" />
          <Trans>Loading remote access…</Trans>
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
      ) : null}
    </SettingsPage>
  );
}
