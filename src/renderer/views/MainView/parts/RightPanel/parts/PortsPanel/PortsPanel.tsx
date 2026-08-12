import { useEffect, useRef, useState } from "react";
import { Button, Input, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Copy, Ellipsis, Loader2, Plug, PlugZap, Plus, RefreshCw, Unplug } from "lucide-react";
import type { ActivePortForward, DetectedPort } from "@/shared/remote";
import { RemoteClientError } from "@/shared/remote/client";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { buildEnterUrl, buildForwardUrl, isDirectEndpoint } from "@/renderer/pwa/portForward";
import {
  selectBrowserBridgeServer,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";

function EmptyState(props: {
  readonly icon: React.ReactNode;
  readonly title: React.ReactNode;
  readonly hint?: React.ReactNode;
  readonly action?: React.ReactNode;
}) {
  return (
    <div className="m-empty">
      <span className="m-empty__icon">{props.icon}</span>
      <strong>{props.title}</strong>
      {props.hint ? <p>{props.hint}</p> : null}
      {props.action}
    </div>
  );
}

function DetectedPortRow(props: {
  readonly port: DetectedPort;
  readonly busy: boolean;
  readonly onForward: () => void;
}) {
  const { t } = useLingui();
  const meta = props.port.label ?? (props.port.protocol === "http" ? t`Web server` : null);
  return (
    <button type="button" className="m-thread-row" disabled={props.busy} onClick={props.onForward}>
      <Plug className="size-4 shrink-0 text-muted" />
      <span className="m-thread-row__body">
        <span className="m-thread-row__title">{`localhost:${props.port.port}`}</span>
        {meta ? (
          <span className="m-thread-row__meta">
            <span className="m-thread-row__meta-item">{meta}</span>
          </span>
        ) : null}
      </span>
      <span className="m-thread-row__side">
        {props.busy ? <Loader2 className="size-4 animate-spin" /> : null}
      </span>
    </button>
  );
}

function ActiveForwardRow(props: {
  readonly forward: ActivePortForward;
  readonly meta: string;
  readonly opening: boolean;
  readonly onOpen: () => void;
  readonly onActions: () => void;
}) {
  const { t } = useLingui();
  const longPressHandlers = useLongPress(props.onActions);
  return (
    <div className="m-thread-row">
      <button
        type="button"
        className="flex min-w-0 flex-1 self-stretch items-center gap-2.5 text-left"
        onClick={props.onOpen}
        {...longPressHandlers}
      >
        {props.opening ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted" />
        ) : (
          <PlugZap className="size-4 shrink-0 text-muted" />
        )}
        <span className="m-thread-row__body">
          <span className="m-thread-row__title">
            <Trans>Port {props.forward.targetPort}</Trans>
          </span>
          <span className="m-thread-row__meta">
            <span className="m-thread-row__meta-item">{props.meta}</span>
          </span>
        </span>
      </button>
      <span className="m-thread-row__side">
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          className="size-7 min-w-0"
          aria-label={t`Actions`}
          onPress={props.onActions}
        >
          <Ellipsis className="size-3.5" />
        </Button>
      </span>
    </div>
  );
}

export function PortsPanel() {
  const { t } = useLingui();
  const server = useRemoteServersStore(selectBrowserBridgeServer);
  const withClient = useRemoteServersStore((state) => state.withClient);
  const [detected, setDetected] = useState<readonly DetectedPort[]>([]);
  const [forwards, setForwards] = useState<readonly ActivePortForward[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyPort, setBusyPort] = useState<number | null>(null);
  const [openingForwardId, setOpeningForwardId] = useState<string | null>(null);
  const [copyingForwardId, setCopyingForwardId] = useState<string | null>(null);
  const [stoppingForwardId, setStoppingForwardId] = useState<string | null>(null);
  const [actionForward, setActionForward] = useState<ActivePortForward | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPort, setManualPort] = useState("");
  const loadGeneration = useRef(0);

  const hasScope = server?.scopes.includes("ports:forward") ?? false;
  const canUse = server !== undefined && hasScope;
  const direct = server ? isDirectEndpoint(server.endpoint) : false;
  const host = server ? new URL(server.endpoint).hostname : "";

  function describeError(error: unknown): string {
    if (error instanceof RemoteClientError) {
      if (error.status === 404) return t`Update Poracode on your desktop to use port forwarding.`;
      if (error.code === "ports_unavailable") {
        return t`Port forwarding isn't available on this desktop.`;
      }
    }
    return friendlyError(error);
  }

  function load() {
    if (!server || !canUse) return;
    const desktopId = server.desktopId;
    const generation = ++loadGeneration.current;
    setLoading(true);
    setNotice(null);
    void withClient(desktopId, (client) => client.listPorts())
      .then((next) => {
        if (loadGeneration.current !== generation) return;
        setDetected(next.detected);
        setForwards(next.forwards);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (loadGeneration.current !== generation) return;
        setNotice(describeError(error));
      })
      .finally(() => {
        if (loadGeneration.current === generation) setLoading(false);
      });
  }

  useEffect(() => {
    setDetected([]);
    setForwards([]);
    setNotice(null);
    setLoaded(false);
    if (canUse) load();
    // The selected desktop and its scope are the lifecycle boundary. `load`
    // intentionally stays local so explicit refreshes share the same race guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server?.desktopId, canUse]);

  function openForwardUrl(url: string): void {
    void readBridge()
      .openExternal(url)
      .catch((error: unknown) => toast.danger(friendlyError(error)));
  }

  function openForwardTarget(enterPath: string | undefined, listenPort: number): void {
    if (!server) return;
    if (enterPath) {
      openForwardUrl(buildEnterUrl(server.endpoint, enterPath));
      return;
    }
    if (direct) {
      openForwardUrl(buildForwardUrl(host, listenPort));
      return;
    }
    toast.warning(t`Update Poracode on your desktop to use port forwarding.`);
  }

  function startForward(targetPort: number): void {
    if (!server) return;
    setBusyPort(targetPort);
    void withClient(server.desktopId, (client) => client.startPortForward(targetPort))
      .then((result) => {
        loadGeneration.current++;
        setForwards((current) => [
          ...current.filter(
            (forward) => forward.id !== result.forward.id && forward.targetPort !== targetPort,
          ),
          result.forward,
        ]);
        openForwardTarget(result.enterPath, result.forward.listenPort);
        load();
      })
      .catch((error: unknown) => toast.danger(describeError(error)))
      .finally(() => setBusyPort(null));
  }

  function stopForward(forward: ActivePortForward): void {
    if (!server) return;
    setStoppingForwardId(forward.id);
    void withClient(server.desktopId, (client) => client.stopPortForward(forward.id))
      .then(() => {
        loadGeneration.current++;
        setForwards((current) => current.filter((entry) => entry.id !== forward.id));
        setActionForward(null);
        load();
      })
      .catch((error: unknown) => toast.danger(describeError(error)))
      .finally(() => setStoppingForwardId(null));
  }

  function openActiveForward(forward: ActivePortForward): void {
    if (!server) return;
    setOpeningForwardId(forward.id);
    void withClient(server.desktopId, (client) => client.enterPortForward(forward.id))
      .then((result) => openForwardTarget(result.enterPath, forward.listenPort))
      .catch((error: unknown) => {
        if (error instanceof RemoteClientError && error.code === "forward_not_found") {
          load();
          return;
        }
        if (direct) {
          openForwardUrl(buildForwardUrl(host, forward.listenPort));
          return;
        }
        toast.danger(describeError(error));
      })
      .finally(() => setOpeningForwardId(null));
  }

  function copyForwardUrl(forward: ActivePortForward): void {
    if (!server) return;
    if (direct) {
      void navigator.clipboard
        .writeText(buildForwardUrl(host, forward.listenPort))
        .then(() => toast.success(t`Copied`))
        .catch((error: unknown) => toast.danger(friendlyError(error)));
      return;
    }
    setCopyingForwardId(forward.id);
    void withClient(server.desktopId, (client) => client.enterPortForward(forward.id))
      .then((result) =>
        navigator.clipboard.writeText(buildEnterUrl(server.endpoint, result.enterPath)),
      )
      .then(() => toast.success(t`Copied`))
      .catch((error: unknown) => {
        if (error instanceof RemoteClientError && error.code === "forward_not_found") {
          load();
          return;
        }
        toast.danger(describeError(error));
      })
      .finally(() => setCopyingForwardId(null));
  }

  const visibleDetected = detected.filter(
    (port) => !forwards.some((forward) => forward.targetPort === port.port),
  );
  const showDetectedSection = visibleDetected.length > 0 || forwards.length === 0;
  const manualPortNumber = Number(manualPort);
  const manualPortValid =
    manualPort.trim() !== "" &&
    Number.isInteger(manualPortNumber) &&
    manualPortNumber >= 1 &&
    manualPortNumber <= 65535;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-y-auto p-3">
      <div className="m-page--fab flex min-h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-foreground">
              <Trans>Ports</Trans>
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              <Trans>Dev servers listening on your desktop's localhost.</Trans>
            </p>
          </div>
          <Button
            isIconOnly
            aria-label={t`Refresh`}
            size="sm"
            variant="ghost"
            isDisabled={!canUse || loading}
            onPress={load}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
        </div>

        {!server ? (
          <EmptyState
            icon={<Plug className="size-5" />}
            title={<Trans>No desktop connection</Trans>}
            hint={<Trans>Pair a desktop from Connections to forward its ports.</Trans>}
          />
        ) : !hasScope ? (
          <EmptyState
            icon={<Plug className="size-5" />}
            title={<Trans>Port forwarding isn't enabled</Trans>}
            hint={<Trans>Re-pair this connection to grant access to port forwarding.</Trans>}
          />
        ) : notice ? (
          <EmptyState
            icon={<Plug className="size-5" />}
            title={<Trans>Can't load ports</Trans>}
            hint={notice}
            action={
              <Button size="sm" variant="secondary" onPress={load}>
                <Trans>Retry</Trans>
              </Button>
            }
          />
        ) : loading && !loaded ? (
          <EmptyState
            icon={<Loader2 className="size-5 animate-spin" />}
            title={<Trans>Looking for dev servers…</Trans>}
          />
        ) : (
          <>
            {forwards.length > 0 ? (
              <section className="flex flex-col gap-1.5">
                <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <Trans>Active forwards</Trans>
                </h2>
                {forwards.map((forward) => (
                  <ActiveForwardRow
                    key={forward.id}
                    forward={forward}
                    meta={
                      direct
                        ? buildForwardUrl(host, forward.listenPort)
                        : t`localhost:${forward.targetPort} on desktop`
                    }
                    opening={openingForwardId === forward.id}
                    onOpen={() => openActiveForward(forward)}
                    onActions={() => setActionForward(forward)}
                  />
                ))}
              </section>
            ) : null}

            {showDetectedSection ? (
              <section className="flex flex-col gap-1.5">
                <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <Trans>Detected</Trans>
                </h2>
                {visibleDetected.length > 0 ? (
                  visibleDetected.map((port) => (
                    <DetectedPortRow
                      key={port.port}
                      port={port}
                      busy={busyPort === port.port}
                      onForward={() => startForward(port.port)}
                    />
                  ))
                ) : (
                  <EmptyState
                    icon={<Plug className="size-5" />}
                    title={<Trans>No dev servers detected</Trans>}
                    hint={<Trans>Start a dev server on your desktop, then tap refresh.</Trans>}
                  />
                )}
              </section>
            ) : null}
          </>
        )}
      </div>

      {canUse ? (
        <Button
          isIconOnly
          aria-label={t`Forward a port`}
          className="m-home-compose-action fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40"
          variant="ghost"
          onPress={() => setManualOpen(true)}
        >
          <Plus className="size-5" />
        </Button>
      ) : null}

      {actionForward ? (
        <BottomSheet
          label={t`Port ${actionForward.targetPort}`}
          closeLabel={t`Close forward actions`}
          onClose={() => setActionForward(null)}
        >
          <div className="m-sheet-head">
            <span>{t`Port ${actionForward.targetPort}`}</span>
          </div>
          <div className="m-sheet-list">
            <SidebarButton
              icon={<Copy className="size-4" />}
              label={t`Copy URL`}
              isDisabled={copyingForwardId === actionForward.id}
              onPress={() => copyForwardUrl(actionForward)}
            />
            <SidebarButton
              icon={<Unplug className="size-4 text-danger" />}
              label={<span className="text-danger">{t`Stop forwarding`}</span>}
              isDisabled={stoppingForwardId === actionForward.id}
              onPress={() => stopForward(actionForward)}
            />
          </div>
        </BottomSheet>
      ) : null}

      {manualOpen ? (
        <BottomSheet
          label={t`Forward a port`}
          closeLabel={t`Close forward a port`}
          onClose={() => setManualOpen(false)}
        >
          <div className="m-sheet-head">
            <span>{t`Forward a port`}</span>
          </div>
          <div className="flex flex-col gap-3 px-0.5 pb-1">
            <p className="text-xs leading-5 text-muted">
              <Trans>Enter the port a dev server on your desktop is listening on.</Trans>
            </p>
            <Input
              aria-label={t`Port`}
              value={manualPort}
              type="number"
              inputMode="numeric"
              min={1}
              max={65535}
              placeholder="3000"
              onChange={(event) => setManualPort(event.currentTarget.value)}
            />
            <Button
              fullWidth
              variant="tertiary"
              isDisabled={!manualPortValid}
              onPress={() => {
                startForward(manualPortNumber);
                setManualPort("");
                setManualOpen(false);
              }}
            >
              <Plug className="size-4" />
              <Trans>Forward</Trans>
            </Button>
          </div>
        </BottomSheet>
      ) : null}
    </div>
  );
}
