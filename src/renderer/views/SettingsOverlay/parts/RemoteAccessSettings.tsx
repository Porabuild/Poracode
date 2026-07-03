import { useEffect, useState } from "react";
import { Button, Disclosure, Switch, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Copy, ExternalLink, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { toDataURL } from "qrcode";
import { readBridge } from "@/renderer/bridge";
import { Input, PixelLoader } from "@/renderer/components/common";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { RemoteAccessTailscaleStatus } from "@/shared/ipc";
import type { RemoteAccessPairingInfo, RemoteAccessSessionSummary } from "@/shared/remote";
import { parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import { SettingRow, SettingsPage } from "./SettingsForm";

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

/** Clipboard copy with a localized success toast; `failureMessage` on failure. */
function useCopyValue() {
  const { t } = useLingui();
  return async (value: string, label: string, failureMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t`${label} copied.`);
    } catch {
      toast.danger(failureMessage);
    }
  };
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
  return parsePairingUrlParts(value)?.token ?? null;
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

function PairedDevicesDisclosure(props: {
  sessions: readonly RemoteAccessSessionSummary[];
  revokingSessionId: string | null;
  onRevoke: (sessionId: string) => void;
}) {
  const { t } = useLingui();
  const unnamedDeviceLabel = t`Unnamed device`;
  const remoteSessionLabel = t`Remote session`;

  return (
    <Disclosure className="max-w-[42rem] border-t border-border/60 pt-4">
      <Disclosure.Heading>
        <Disclosure.Trigger className="flex w-full min-w-0 items-center gap-3 py-1 text-left">
          <ShieldCheck className="size-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">
              <Trans>Paired devices</Trans>
            </span>
            <span className="block text-xs text-muted">
              {props.sessions.length === 0 ? (
                <Trans>No paired devices yet.</Trans>
              ) : (
                <Trans>Expand to review or revoke access.</Trans>
              )}
            </span>
          </span>
          <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs tabular-nums text-muted">
            {props.sessions.length}
          </span>
          <Disclosure.Indicator className="size-3.5 shrink-0 text-muted" />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="space-y-2 pt-3">
          {props.sessions.length === 0 ? (
            <p className="text-xs text-muted">
              <Trans>New phones, tablets, and browsers appear here after pairing.</Trans>
            </p>
          ) : (
            props.sessions.map((session) => {
              const name = sessionName(session, unnamedDeviceLabel);
              const meta = sessionMeta(session, remoteSessionLabel);
              const expiresAt = formatSessionTime(session.expiresAt);
              const revoking = props.revokingSessionId === session.id;
              return (
                <div key={session.id} className="flex items-center gap-3 py-1">
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
            })
          )}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
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
  const pairingToken = pairingTokenFromUrl(props.info.pairingUrl);

  const copyValue = useCopyValue();
  const handleCopy = (value: string, label: string, failureMessage: string) =>
    void copyValue(value, label, failureMessage);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="flex aspect-square w-full max-w-[220px] items-center justify-center bg-white p-3">
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
      <PairedDevicesDisclosure
        sessions={props.info.sessions}
        revokingSessionId={props.revokingSessionId}
        onRevoke={props.onRevoke}
      />
    </div>
  );
}

/** True when `value` parses as an http/https URL with no path, query, or hash. */
function isOriginOnlyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.pathname !== "/" && url.pathname !== "") return false;
    return !url.search && !url.hash;
  } catch {
    return false;
  }
}

function tailscaleHint(
  status: RemoteAccessTailscaleStatus | null,
  labels: {
    checking: string;
    notInstalled: string;
    notRunning: string;
    needsLogin: string;
    ready: string;
  },
): string {
  if (!status) return labels.checking;
  switch (status.daemon) {
    case "not-installed":
      return labels.notInstalled;
    case "not-running":
      return labels.notRunning;
    case "needs-login":
      return labels.needsLogin;
    case "error":
      return status.message ?? labels.notRunning;
    case "running":
      return labels.ready;
  }
}

/**
 * Secure-URL configuration for the running remote-access server: a Tailscale
 * HTTPS toggle (disabled with a hint until the local daemon is running) plus a
 * custom public base URL. Both persist their setting and restart the server so
 * the advertised pairing URL updates; the new pairing info is bubbled up so the
 * QR / endpoint refresh in place.
 */
function RemoteAccessAdvanced(props: {
  onPairingChanged: (info: RemoteAccessPairingInfo) => void;
}) {
  const { t } = useLingui();
  const tailscaleEnabled = useSharedSettings((state) => state.remoteAccessTailscaleHttps);
  const advertisedUrl = useSharedSettings((state) => state.remoteAccessAdvertisedUrl);
  const [status, setStatus] = useState<RemoteAccessTailscaleStatus | null>(null);
  const [isTogglingTailscale, setIsTogglingTailscale] = useState(false);
  const [isStartingTailscale, setIsStartingTailscale] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [urlDraft, setUrlDraft] = useState(advertisedUrl);
  const [isSavingUrl, setIsSavingUrl] = useState(false);

  // Poll the daemon so lifecycle transitions (app launched, logged in, HTTPS
  // provisioned) surface live without reopening Settings. Bumping `refreshNonce`
  // after an action re-runs this immediately without changing the 5s cadence.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await readBridge().getRemoteAccessTailscaleStatus();
        if (!cancelled) setStatus(next);
      } catch {
        // Keep the last known status on a transient probe failure.
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshNonce]);

  const triggerStatusRefresh = () => setRefreshNonce((nonce) => nonce + 1);

  // Reflect external changes (e.g. a remote client editing the URL) into the draft.
  useEffect(() => {
    setUrlDraft(advertisedUrl);
  }, [advertisedUrl]);

  const daemonReady = status?.daemon === "running";
  const hint = tailscaleHint(status, {
    checking: t`Checking Tailscale…`,
    notInstalled: t`Install Tailscale to enable HTTPS access through MagicDNS.`,
    notRunning: t`Start Tailscale to enable HTTPS access through MagicDNS.`,
    needsLogin: t`Log in to Tailscale to enable HTTPS access through MagicDNS.`,
    ready: tailscaleEnabled
      ? t`Ready. New pairing codes will advertise the Tailscale HTTPS URL when serve is active.`
      : t`Ready. Turn this on to advertise the Tailscale HTTPS URL in new pairing codes.`,
  });

  const launchTailscale = async () => {
    setIsStartingTailscale(true);
    try {
      const result = await readBridge().startTailscale();
      if (result.ok) {
        triggerStatusRefresh();
      } else {
        toast.danger(result.message ?? t`Unable to start Tailscale.`);
      }
    } catch (error) {
      toast.danger(friendlyError(error, t`Unable to start Tailscale.`));
    } finally {
      setIsStartingTailscale(false);
    }
  };

  const copyValue = useCopyValue();

  const toggleTailscale = async (enabled: boolean) => {
    setIsTogglingTailscale(true);
    try {
      const info = await readBridge().setRemoteAccessTailscaleHttps({ enabled });
      props.onPairingChanged(info);
      const next = await readBridge().getRemoteAccessTailscaleStatus();
      setStatus(next);
      if (enabled && !next.serveActive && next.message) {
        toast.danger(next.message);
      }
    } catch (error) {
      toast.danger(friendlyError(error, t`Unable to update Tailscale HTTPS.`));
      void readBridge()
        .getRemoteAccessTailscaleStatus()
        .then(setStatus)
        .catch(() => {});
    } finally {
      setIsTogglingTailscale(false);
    }
  };

  const saveUrl = async () => {
    const trimmed = urlDraft.trim();
    if (trimmed === advertisedUrl) return;
    if (trimmed && !isOriginOnlyUrl(trimmed)) {
      toast.danger(t`Enter a full origin URL like https://code.example.com, with no path.`);
      return;
    }
    setIsSavingUrl(true);
    try {
      const info = await readBridge().setRemoteAccessAdvertisedUrl({ url: trimmed });
      props.onPairingChanged(info);
      toast.success(t`Public URL updated.`);
    } catch (error) {
      toast.danger(friendlyError(error, t`Unable to update the public URL.`));
      setUrlDraft(advertisedUrl);
    } finally {
      setIsSavingUrl(false);
    }
  };

  return (
    <div className="space-y-4 border-t border-border/60 pt-6">
      <SettingRow
        title={t`Tailscale HTTPS`}
        description={t`Optional. Enabling this runs tailscale serve for the remote access port, then new pairing codes use your tailnet's HTTPS MagicDNS URL. Leave it off to use the LAN address or Public URL below.`}
      >
        <Switch
          isSelected={tailscaleEnabled}
          // Stays operable while enabled even if the daemon went away, so the
          // user can always turn the setting off.
          isDisabled={(!daemonReady && !tailscaleEnabled) || isTogglingTailscale}
          aria-label={t`Tailscale HTTPS`}
          onChange={(enabled) => void toggleTailscale(enabled)}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>
      <p className="-mt-2 text-xs text-muted">{hint}</p>
      {status?.daemon === "not-installed" ? (
        <Button
          size="sm"
          variant="tertiary"
          className="-mt-2"
          onPress={() => void readBridge().openExternal("https://tailscale.com/download")}
        >
          <ExternalLink className="size-3.5" />
          <Trans>Install Tailscale</Trans>
        </Button>
      ) : status?.daemon === "not-running" || status?.daemon === "needs-login" ? (
        <Button
          size="sm"
          variant="tertiary"
          className="-mt-2"
          isDisabled={isStartingTailscale}
          onPress={() => void launchTailscale()}
        >
          {isStartingTailscale ? <PixelLoader size="sm" /> : null}
          {status.daemon === "not-running" ? (
            <Trans>Start Tailscale</Trans>
          ) : (
            <Trans>Open Tailscale</Trans>
          )}
        </Button>
      ) : null}
      {status?.serveActive && status.httpsUrl ? (
        <CopyValueRow
          label={t`Tailscale URL`}
          value={status.httpsUrl}
          copyLabel={t`Copy Tailscale URL`}
          failureMessage={t`Unable to copy Tailscale URL.`}
          onCopy={(value, label, failureMessage) => void copyValue(value, label, failureMessage)}
        />
      ) : null}
      <SettingRow
        title={t`Public URL`}
        description={
          <Trans>
            Advertise a custom base URL, e.g. a reverse proxy or tunnel. Leave empty for automatic.
          </Trans>
        }
      >
        <div className="flex w-[320px] shrink-0 items-center gap-2">
          <Input
            aria-label={t`Public URL`}
            className="min-w-0 flex-1 font-mono text-xs"
            placeholder="https://code.example.com"
            value={urlDraft}
            disabled={isSavingUrl}
            onChange={(event) => setUrlDraft(event.target.value)}
            onBlur={() => void saveUrl()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void saveUrl();
              }
            }}
          />
        </div>
      </SettingRow>
    </div>
  );
}

/**
 * Mobile push pipeline settings. The desktop's `PushCoordinator` maps
 * `thread-state` transitions to APNs pushes / Live Activity updates for paired
 * iOS devices; these two switches gate that entirely and control whether
 * conversation titles leave the device through Apple's push service.
 */
function RemotePushSection() {
  const { t } = useLingui();
  const pushEnabled = useSharedSettings((state) => state.remotePushEnabled);
  const setPushEnabled = useSharedSettings((state) => state.setRemotePushEnabled);
  const redactContent = useSharedSettings((state) => state.remotePushRedactContent);
  const setRedactContent = useSharedSettings((state) => state.setRemotePushRedactContent);

  return (
    <div className="space-y-4 border-t border-border/60 pt-6">
      <SettingRow
        title={t`Mobile push notifications`}
        description={
          <Trans>
            Push updates to paired mobile devices when threads finish or need you, even when the app
            is closed.
          </Trans>
        }
      >
        <Switch
          isSelected={pushEnabled}
          aria-label={t`Mobile push notifications`}
          onChange={setPushEnabled}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>
      <SettingRow
        title={t`Redact notification content`}
        description={
          <Trans>
            Send generic text instead of conversation titles through Apple&apos;s push service.
          </Trans>
        }
      >
        <Switch
          isSelected={redactContent}
          isDisabled={!pushEnabled}
          aria-label={t`Redact notification content`}
          onChange={setRedactContent}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>
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
      toast.danger(friendlyError(error, t`Unable to revoke remote session.`));
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
        <div className="space-y-10">
          <PairingReady
            info={state.info}
            qrDataUrl={state.qrDataUrl}
            isRefreshing={isRefreshing}
            revokingSessionId={revokingSessionId}
            onRefresh={refresh}
            onRevoke={(sessionId) => void revokeSession(sessionId)}
          />
          <RemoteAccessAdvanced
            onPairingChanged={(info) => void pairingViewStateFromInfo(info).then(setState)}
          />
          <RemotePushSection />
        </div>
      ) : null}
    </SettingsPage>
  );
}
