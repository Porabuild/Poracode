import { useEffect, useRef, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Copy, Loader2, Plug, PlugZap, RefreshCw, Unplug } from "lucide-react";
import type { ActivePortForward, DetectedPort } from "@/shared/remote";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { getRemoteBridgeClient } from "../bridge";
import { BottomSheet, EmptyState, Fab, SheetMenu, useSheet } from "../components";
import { buildEnterUrl, buildForwardUrl, isDirectEndpoint } from "../portForward";
import { RemoteClientError } from "../remoteClient";
import { useRemote } from "../remoteContext";

function openForwardUrl(url: string): void {
  void readBridge()
    .openExternal(url)
    .catch((error: unknown) => toast.danger(friendlyError(error)));
}

/** The flat tappable card from ThreadRow, matching DetectedPortRow's siblings
 * in Connections/Projects. The port is the fact (the primary title); a
 * PORT_LABELS framework guess is only ever a hint, so it's demoted to the
 * secondary meta line instead of standing in for the title. */
function DetectedPortRow(props: {
  readonly port: DetectedPort;
  readonly busy: boolean;
  readonly onForward: () => void;
}) {
  const { port } = props;
  const { t } = useLingui();
  const meta = port.label ?? (port.protocol === "http" ? t`Web server` : null);
  return (
    <button type="button" className="m-thread-row" disabled={props.busy} onClick={props.onForward}>
      <Plug className="size-4 shrink-0 text-muted" />
      <span className="m-thread-row__body">
        <span className="m-thread-row__title">{`localhost:${port.port}`}</span>
        {meta ? (
          <span className="m-thread-row__meta">
            <span className="m-thread-row__meta-item">{meta}</span>
          </span>
        ) : null}
      </span>
      <span className="m-thread-row__side">
        {props.busy ? <Loader2 className="size-4 m-spin" /> : null}
      </span>
    </button>
  );
}

/** The flat tappable card from ThreadRow: tap opens the forward, long-press
 * opens the actions sheet — the same dual-affordance DesktopRow uses for
 * switch/rename/forget, so a forward's secondary actions (copy, stop) don't
 * need permanently-visible icon buttons. */
function ActiveForwardRowButton(props: {
  readonly forward: ActivePortForward;
  readonly meta: string;
  readonly opening: boolean;
  readonly onOpen: () => void;
  readonly onMenu: () => void;
}) {
  const { forward } = props;
  const { t } = useLingui();
  const longPressHandlers = useLongPress(props.onMenu);
  return (
    <button
      type="button"
      className="m-thread-row"
      disabled={props.opening}
      onClick={props.onOpen}
      {...longPressHandlers}
    >
      {props.opening ? (
        <Loader2 className="size-4 shrink-0 m-spin text-muted" />
      ) : (
        <PlugZap className="size-4 shrink-0 text-muted" />
      )}
      <span className="m-thread-row__body">
        <span className="m-thread-row__title">{t`Port ${forward.targetPort}`}</span>
        <span className="m-thread-row__meta">
          <span className="m-thread-row__meta-item">{props.meta}</span>
        </span>
      </span>
    </button>
  );
}

function ActiveForwardRow(props: {
  readonly forward: ActivePortForward;
  readonly meta: string;
  readonly opening: boolean;
  readonly copying: boolean;
  readonly stopping: boolean;
  readonly onOpen: () => void;
  readonly onCopy: () => void;
  readonly onStop: () => void;
}) {
  const { t } = useLingui();
  return (
    <SheetMenu
      label={t`Port ${props.forward.targetPort}`}
      closeLabel={t`Close forward actions`}
      items={[
        {
          id: "copy",
          label: t`Copy URL`,
          icon: <Copy className="size-4 text-muted" />,
          disabled: props.copying,
        },
        {
          id: "stop",
          label: t`Stop forwarding`,
          icon: <Unplug className="size-4" />,
          tone: "danger",
          disabled: props.stopping,
        },
      ]}
      onSelect={(id) => {
        if (id === "copy") props.onCopy();
        if (id === "stop") props.onStop();
      }}
      trigger={({ open }) => (
        <ActiveForwardRowButton
          forward={props.forward}
          meta={props.meta}
          opening={props.opening}
          onOpen={props.onOpen}
          onMenu={open}
        />
      )}
    />
  );
}

/**
 * PWA "Ports" screen: discover dev servers on the paired desktop's localhost
 * and open them through the desktop's authenticated reverse proxy (or, on a
 * direct LAN/loopback endpoint, the raw TCP forward) so the phone's browser
 * can reach them. Structurally mirrors Connections/Projects: `m-thread-row`
 * cards, a long-press bottom sheet for a row's secondary/destructive actions,
 * and a `Fab` + `BottomSheet` for manual entry instead of a permanently-visible
 * form. There is no WS push for ports yet, so state is view-local and
 * refreshed by an explicit button, never polled.
 */
export function PortsView() {
  const { t } = useLingui();
  const remote = useRemote();
  const activeDesktop = remote.activeDesktop;

  const [detected, setDetected] = useState<readonly DetectedPort[]>([]);
  const [forwards, setForwards] = useState<readonly ActivePortForward[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyPort, setBusyPort] = useState<number | null>(null);
  const [openingForwardId, setOpeningForwardId] = useState<string | null>(null);
  const [copyingForwardId, setCopyingForwardId] = useState<string | null>(null);
  const [stoppingForwardId, setStoppingForwardId] = useState<string | null>(null);
  const [manualPort, setManualPort] = useState("");
  // The manual "forward a port" form lives in a content-height bottom sheet
  // opened from the FAB (only as tall as the form itself, not a full-screen
  // drawer) so the list isn't buried under a permanent card.
  const forwardDrawer = useSheet<true>();
  // Request-generation guard: `load()` captures the current generation and
  // only applies its response if still current. `startForward`/`stopForward`
  // bump the generation before applying their optimistic update, so a
  // `GET /api/ports` issued before them but resolving after can't clobber it
  // (the just-started forward vanishing, or the just-stopped one reappearing).
  const loadGeneration = useRef(0);

  const hasScope = activeDesktop?.scopes.includes("ports:forward") ?? false;
  // Direct (LAN/loopback) endpoints can also reach the raw TCP listener, used
  // as a fallback when the desktop is too old to mint an `enterPath`.
  const direct = activeDesktop ? isDirectEndpoint(activeDesktop.endpoint) : false;
  const canUse = Boolean(activeDesktop) && hasScope;
  const host = activeDesktop ? new URL(activeDesktop.endpoint).hostname : "";

  function describeError(error: unknown): string {
    if (error instanceof RemoteClientError) {
      if (error.status === 404) {
        return t`Update Lightcode on your desktop to use port forwarding.`;
      }
      if (error.code === "ports_unavailable") {
        return t`Port forwarding isn't available on this desktop.`;
      }
    }
    return friendlyError(error);
  }

  /**
   * Resolve where to open a forward given its (possibly absent) `enterPath`:
   * the authenticated proxy entry point when present (works over LAN,
   * tailscale-serve, and the relay); the raw LAN listener URL when the
   * desktop hasn't minted one but the endpoint is direct; otherwise nothing
   * can reach the forward from here, so surface the same "update Lightcode"
   * notice `describeError` uses for the analogous 404.
   */
  function openForwardTarget(enterPath: string | undefined, listenPort: number): void {
    if (!activeDesktop) return;
    if (enterPath) {
      openForwardUrl(buildEnterUrl(activeDesktop.endpoint, enterPath));
      return;
    }
    if (direct) {
      openForwardUrl(buildForwardUrl(host, listenPort));
      return;
    }
    toast.warning(t`Update Lightcode on your desktop to use port forwarding.`);
  }

  function load() {
    const client = getRemoteBridgeClient();
    if (!client || !canUse) return;
    const generation = ++loadGeneration.current;
    setLoading(true);
    setNotice(null);
    client
      .listPorts()
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
        if (loadGeneration.current !== generation) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    setDetected([]);
    setForwards([]);
    setNotice(null);
    setLoaded(false);
    if (!canUse) return;
    load();
    // Re-fetch only when the eligible desktop changes; refreshing otherwise
    // happens through the explicit refresh button (no polling for ports yet).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on desktop/eligibility, not `load`'s identity
  }, [activeDesktop?.desktopId, canUse]);

  function startForward(targetPort: number) {
    const client = getRemoteBridgeClient();
    if (!client) return;
    setBusyPort(targetPort);
    client
      .startPortForward(targetPort)
      .then((result) => {
        // Invalidate any in-flight load() so its (possibly stale) response
        // can't overwrite this optimistic update once it resolves.
        loadGeneration.current++;
        setForwards((current) => [
          // Dedupe by id and by targetPort: a stale row for the same port
          // (e.g. left over from a previous session) can't produce a
          // duplicate row alongside the fresh one.
          ...current.filter(
            (forward) => forward.id !== result.forward.id && forward.targetPort !== targetPort,
          ),
          result.forward,
        ]);
        openForwardTarget(result.enterPath, result.forward.listenPort);
        // Reconcile with server truth once the optimistic update has landed.
        load();
      })
      .catch((error: unknown) => toast.danger(describeError(error)))
      .finally(() => setBusyPort(null));
  }

  function stopForward(forward: ActivePortForward) {
    const client = getRemoteBridgeClient();
    if (!client) return;
    setStoppingForwardId(forward.id);
    client
      .stopPortForward(forward.id)
      .then(() => {
        loadGeneration.current++;
        setForwards((current) => current.filter((entry) => entry.id !== forward.id));
        load();
      })
      .catch((error: unknown) => toast.danger(describeError(error)))
      .finally(() => setStoppingForwardId(null));
  }

  /**
   * Tapping an already-open forward mints a fresh enter token first — the one
   * from the original `forward` response (if any) may have expired, tokens
   * are TTL'd to 10 minutes — then opens it. If the forward has since closed
   * server-side (`forward_not_found`), refresh the list instead of opening a
   * dead link.
   */
  function openActiveForward(forward: ActivePortForward) {
    const client = getRemoteBridgeClient();
    if (!client) return;
    setOpeningForwardId(forward.id);
    client
      .enterPortForward(forward.id)
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

  /**
   * Copy target for an active forward: the raw LAN URL on a direct endpoint
   * (always available, no round trip needed); otherwise a freshly minted
   * enter URL (it expires in 10 minutes, but that's fine for a one-time paste).
   */
  function copyForwardUrl(forward: ActivePortForward) {
    if (direct) {
      void navigator.clipboard
        .writeText(buildForwardUrl(host, forward.listenPort))
        .then(() => toast.success(t`Copied`))
        .catch((error: unknown) => toast.danger(friendlyError(error)));
      return;
    }
    const client = getRemoteBridgeClient();
    if (!client || !activeDesktop) return;
    setCopyingForwardId(forward.id);
    client
      .enterPortForward(forward.id)
      .then((result) =>
        navigator.clipboard.writeText(buildEnterUrl(activeDesktop.endpoint, result.enterPath)),
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

  // A detected port that already has an active forward is redundant with the
  // "Active forwards" row above it, so it's dropped from Detected instead of
  // showing the same port twice.
  const visibleDetected = detected.filter(
    (port) => !forwards.some((forward) => forward.targetPort === port.port),
  );
  // Once every detection is already forwarded, an empty Detected section would
  // read as "nothing running" right below a list that says otherwise — hide
  // the section instead. With no forwards at all, fall back to the original
  // "no dev servers detected" empty state.
  const showDetectedSection = visibleDetected.length > 0 || forwards.length === 0;

  const manualPortNumber = Number(manualPort);
  const manualPortValid =
    manualPort.trim() !== "" &&
    Number.isInteger(manualPortNumber) &&
    manualPortNumber >= 1 &&
    manualPortNumber <= 65535;

  return (
    <div className="m-subscreen">
      <section className={canUse ? "m-page m-page--fab" : "m-page"}>
        <div className="m-page-head flex items-center justify-between gap-2">
          <div>
            <h1>
              <Trans>Ports</Trans>
            </h1>
            <p>
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
            {loading ? <Loader2 className="size-4 m-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>

        {!activeDesktop ? (
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
            icon={<Loader2 className="size-5 m-spin" />}
            title={<Trans>Looking for dev servers…</Trans>}
          />
        ) : (
          <>
            {forwards.length > 0 ? (
              <div className="m-settings-group">
                <div className="m-settings-group__head">
                  <strong>
                    <Trans>Active forwards</Trans>
                  </strong>
                </div>
                <div className="m-thread-list">
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
                      copying={copyingForwardId === forward.id}
                      stopping={stoppingForwardId === forward.id}
                      onOpen={() => openActiveForward(forward)}
                      onCopy={() => copyForwardUrl(forward)}
                      onStop={() => stopForward(forward)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {showDetectedSection ? (
              <div className="m-settings-group">
                <div className="m-settings-group__head">
                  <strong>
                    <Trans>Detected</Trans>
                  </strong>
                </div>
                {visibleDetected.length > 0 ? (
                  <div className="m-thread-list">
                    {visibleDetected.map((port) => (
                      <DetectedPortRow
                        key={port.port}
                        port={port}
                        busy={busyPort === port.port}
                        onForward={() => startForward(port.port)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Plug className="size-5" />}
                    title={<Trans>No dev servers detected</Trans>}
                    hint={<Trans>Start a dev server on your desktop, then tap refresh.</Trans>}
                  />
                )}
              </div>
            ) : null}
          </>
        )}

        {canUse ? <Fab label={t`Forward a port`} onPress={() => forwardDrawer.open(true)} /> : null}

        {canUse && forwardDrawer.target ? (
          <BottomSheet
            label={t`Forward a port`}
            closeLabel={t`Close forward a port`}
            closing={forwardDrawer.closing}
            onClose={forwardDrawer.close}
          >
            <div className="m-sheet-head">
              <span className="truncate">{t`Forward a port`}</span>
            </div>
            <div className="m-form">
              <p className="m-card__hint">
                <Trans>Enter the port a dev server on your desktop is listening on.</Trans>
              </p>
              <label className="m-field">
                <span className="m-field__label">
                  <Trans>Port</Trans>
                </span>
                <input
                  value={manualPort}
                  aria-label={t`Port`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={65535}
                  placeholder="3000"
                  onChange={(event) => setManualPort(event.currentTarget.value)}
                />
              </label>
              <Button
                className="m-form__submit text-foreground"
                size="sm"
                variant="tertiary"
                isDisabled={!manualPortValid}
                onPress={() => {
                  startForward(manualPortNumber);
                  setManualPort("");
                  forwardDrawer.close();
                }}
              >
                <Plug className="size-4" />
                <Trans>Forward</Trans>
              </Button>
            </div>
          </BottomSheet>
        ) : null}
      </section>
    </div>
  );
}
