import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UNSAFE_PortalProvider } from "react-aria";
import {
  DEVICE_PREVIEW_WINDOW_NAME,
  DEVICE_PREVIEW_WINDOW_URL,
} from "@/shared/devicePreviewWindow";
import type { ConnectionStatus } from "@expo/hub-client";
import { Button, Dropdown, Input, Label, Modal, Tooltip } from "@heroui/react";
import {
  ArrowLeft,
  ArrowUp,
  Camera,
  Check,
  Code,
  Box,
  Copy,
  CornerDownLeft,
  Delete,
  Eye,
  Home,
  Keyboard,
  Layers,
  MousePointer2,
  PanelsTopLeft,
  Power,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
  Unplug,
  Video,
  X,
} from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type {
  DeviceAction,
  DeviceControl,
  DeviceControlState,
  DeviceFrame,
  DeviceInventory,
  DeviceSession,
  DeviceTarget,
} from "@/shared/deviceWorkspace";
import { RemoteClientError } from "@/shared/remote/client";
import { supportsDeviceLivePreview } from "@/shared/remote/clientDevicePreview";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { ConfirmDialog } from "@/renderer/components/common/ConfirmDialog";
import {
  panelHeaderIconButtonClass,
  panelHeaderTooltipTriggerResetClass,
} from "@/renderer/components/layout/sidebarChrome";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useAppStore } from "@/renderer/state/appStore";
import { selectFocusedThreadId } from "@/renderer/hooks/uiSelectors";
import { PANEL_EXIT_DURATION_MS } from "@/renderer/components/layout/panelMotion";
import { withThreadDeviceClient } from "./deviceClient";
import { useDeviceLivePreview } from "./useDeviceLivePreview";
import { LiveDevicePreview } from "./LiveDevicePreview";
import { DeviceTools } from "./DeviceTools";
import { DevicePreviewStage } from "./DevicePreviewStage";
import { DeviceDetachedWindow } from "./DeviceDetachedWindow";

function isDevicesSurfaceActive(panel: ReturnType<typeof usePanelStore.getState>): boolean {
  return panel.rightPanelTab === "devices" || panel.rightPanelSplit?.tab === "devices";
}

export function DeviceWorkspace({
  threadId,
  visible = true,
  titleTarget = null,
  actionsTarget = null,
}: {
  threadId: string;
  visible?: boolean;
  titleTarget?: HTMLElement | null;
  actionsTarget?: HTMLElement | null;
}) {
  const { t } = useLingui();
  const [inventory, setInventory] = useState<DeviceInventory | null>(null);
  const [session, setSession] = useState<DeviceSession | null>(null);
  const sessionRef = useRef<DeviceSession | null>(null);
  const detachSessionRef = useRef<((sessionId: string) => Promise<unknown>) | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [control, setControl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<DeviceFrame | null>(null);
  const [inspection, setInspection] = useState<string | null>(null);
  const [copiedInspection, setCopiedInspection] = useState(false);
  const [text, setText] = useState("");
  const [showTextInput, setShowTextInput] = useState(true);
  const [framed, setFramed] = useState(false);
  const [depth, setDepth] = useState(false);
  const detached = usePanelStore((state) => state.deviceWorkspaceDetached);
  const setDetached = usePanelStore((state) => state.setDeviceWorkspaceDetached);
  const [detachedWindow, setDetachedWindow] = useState<Window | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [controlState, setControlState] = useState<DeviceControlState | null>(null);
  const [confirmPowerOff, setConfirmPowerOff] = useState(false);
  const [contentHost] = useState(() => document.createElement("div"));
  const [panelBody, setPanelBody] = useState<HTMLDivElement | null>(null);
  const [detachedBody, setDetachedBody] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const target = detached ? detachedBody : panelBody;
    contentHost.className = "h-full min-h-0";
    target?.append(contentHost);
    return () => {
      contentHost.remove();
    };
  }, [contentHost, detached, detachedBody, panelBody]);
  const [liveClientStatus, setLiveClientStatus] = useState<ConnectionStatus>("idle");
  const [livePressButton, setLivePressButton] = useState<((button: "recents") => void) | null>(
    null,
  );
  const [paused, setPaused] = useState(document.hidden);
  useEffect(() => {
    const owner = detached && detachedWindow ? detachedWindow.document : document;
    const visibility = () => setPaused(owner.hidden);
    visibility();
    owner.addEventListener("visibilitychange", visibility);
    return () => owner.removeEventListener("visibilitychange", visibility);
  }, [detached, detachedWindow]);

  const [liveAvailable, setLiveAvailable] = useState(false);
  const [snapshotMode, setSnapshotMode] = useState(false);
  const mounted = useRef(true);
  const operationRef = useRef<symbol | null>(null);
  const gesture = useRef<{
    x: number;
    y: number;
    time: number;
    frameId: string;
    element: HTMLButtonElement;
  } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const device = inventory?.devices.find((entry) => entry.id === selected);
  const wantsLive = liveAvailable && !snapshotMode && !paused && visible;
  const live = useDeviceLivePreview(threadId, session, wantsLive, (error, id) => {
    if (sessionRef.current?.id === id) report(error);
  });
  const effectiveLiveClientStatus: ConnectionStatus =
    wantsLive && live.state ? liveClientStatus : "idle";
  const effectiveLivePressButton = wantsLive && live.state ? livePressButton : null;

  async function refresh(signal?: AbortSignal, isCurrent?: () => boolean) {
    const result = await withThreadDeviceClient(threadId, async (client) => {
      const descriptor = await client.environment();
      if (!descriptor.capabilities?.deviceWorkspace?.versions.includes(1))
        throw new Error(t`This host does not support the device workspace.`);
      return {
        inventory: await client.deviceInventory(signal),
        live: supportsDeviceLivePreview(descriptor),
      };
    });
    if (mounted.current && !signal?.aborted && (!isCurrent || isCurrent())) {
      setInventory(result.inventory);
      setLiveAvailable(result.live);
    }
  }
  function report(error: unknown) {
    if (!mounted.current) return;
    setError(error instanceof Error ? error.message : t`Device operation failed.`);
    if (error instanceof RemoteClientError && [401, 403, 404, 410].includes(error.status)) {
      sessionRef.current = null;
      setSession(null);
      setFrame(null);
    }
  }
  async function perform(operation: (isCurrent: () => boolean) => Promise<void>) {
    const id = Symbol();
    operationRef.current = id;
    const isCurrent = () => mounted.current && operationRef.current === id;
    setBusy(true);
    setError(null);
    try {
      await operation(isCurrent);
    } catch (error) {
      if (isCurrent()) report(error);
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }
  async function detach() {
    const current = sessionRef.current;
    const release = detachSessionRef.current;
    sessionRef.current = null;
    detachSessionRef.current = null;
    setSession(null);
    setFrame(null);
    setInspection(null);
    setToolsOpen(false);
    setControlState(null);
    setConfirmPowerOff(false);
    setLiveClientStatus("idle");
    setLivePressButton(null);
    if (current && release) await release(current.id);
  }
  const refreshFromEffect = useEffectEvent((signal: AbortSignal) => refresh(signal));
  const reportFromEffect = useEffectEvent((cause: unknown) => report(cause));

  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    void refreshFromEffect(abort.signal).catch((error: unknown) => {
      if (!abort.signal.aborted) reportFromEffect(error);
    });

    return () => {
      mounted.current = false;
      operationRef.current = null;
      abort.abort();

      const current = sessionRef.current;
      const release = detachSessionRef.current;
      sessionRef.current = null;
      detachSessionRef.current = null;
      if (current && release) void release(current.id).catch(() => undefined);
      requestAnimationFrame(() => {
        window.setTimeout(() => {
          const panel = usePanelStore.getState();
          if (panel.deviceWorkspaceThreadId !== null || !isDevicesSurfaceActive(panel)) return;
          if (selectFocusedThreadId(useAppStore.getState()) !== threadId) return;
          if (document.activeElement !== document.body) return;
          const entry = [
            document.getElementById(`panel-devices-${threadId}`),
            document.getElementById(`thread-tool-devices-${threadId}`),
            document.getElementById(`thread-tools-${threadId}`),
          ].find(
            (element) =>
              element &&
              !element.closest("[inert]") &&
              getComputedStyle(element).visibility === "visible",
          );
          entry?.focus();
        }, PANEL_EXIT_DURATION_MS);
      });
    };
  }, [threadId]);

  useEffect(() => {
    if (detached || !visible || document.activeElement !== document.body) return;
    const panel = usePanelStore.getState();
    if (panel.deviceWorkspaceThreadId !== threadId || !isDevicesSurfaceActive(panel)) return;
    if (selectFocusedThreadId(useAppStore.getState()) !== threadId) return;
    document.getElementById(`panel-devices-${threadId}`)?.focus();
  }, [threadId, visible, detached]);

  useEffect(() => {
    if (!session || paused || !visible || wantsLive) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function capture() {
      try {
        if (gesture.current && !gesture.current.element.isConnected) gesture.current = null;
        if (!gesture.current) {
          const next = await withThreadDeviceClient(threadId, (client, id) =>
            client.deviceFrame(id, session!.id, abort.signal),
          );
          if (!abort.signal.aborted && sessionRef.current?.id === session!.id) {
            setFrame(next);
            setError(null);
          }
        }
      } catch (error) {
        if (!abort.signal.aborted && sessionRef.current?.id === session!.id)
          reportFromEffect(error);
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(() => void capture(), 750);
      }
    }
    void capture();
    return () => {
      abort.abort();
      clearTimeout(timer);
      gesture.current = null;
    };
  }, [threadId, session, paused, visible, wantsLive]);

  useEffect(() => {
    if (
      session ||
      paused ||
      !visible ||
      !inventory?.devices.some((entry) => entry.state === "starting")
    )
      return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void refreshFromEffect(abort.signal).catch((error: unknown) => {
        if (!abort.signal.aborted) reportFromEffect(error);
      });
    }, 2000);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [inventory, paused, visible, session]);

  async function attach(target: DeviceTarget, isCurrent: () => boolean, start = false) {
    if (!inventory) return;
    await detach();
    if (!isCurrent()) return;
    const attached = await withThreadDeviceClient(threadId, async (client, id) => ({
      client,
      threadId: id,
      session: await client.attachDevice(id, {
        version: 1,
        generation: inventory.generation,
        deviceId: target.id,
        access: start || control ? "control" : "view",
        agentAccess: start ? "none" : control ? "control" : "view",
      }),
    }));
    const next = attached.session;
    const release = (sessionId: string) =>
      attached.client.detachDevice(attached.threadId, sessionId);
    if (!isCurrent()) {
      await release(next.id);
      return;
    }
    sessionRef.current = next;
    detachSessionRef.current = release;
    setSnapshotMode(false);
    if (!start) setSession(next);
    if (start) {
      try {
        await withThreadDeviceClient(threadId, (client, id) =>
          client.deviceAction(id, next.id, { kind: "start" }),
        );
      } finally {
        if (sessionRef.current?.id === next.id) await detach();
        if (isCurrent()) await refresh(undefined, isCurrent);
      }
    }
  }
  async function send(action: DeviceAction) {
    const current = sessionRef.current;
    if (!current) return;
    await withThreadDeviceClient(threadId, (client, id) =>
      client.deviceAction(id, current.id, action),
    );
  }
  function applyControl(action: DeviceControl) {
    const current = sessionRef.current;
    if (!current || current.access !== "control" || !visible || busy) return;
    void perform(async (isCurrent) => {
      const result = await withThreadDeviceClient(threadId, async (client, id) => {
        const response = await client.deviceAction(id, current.id, {
          kind: "control",
          version: 1,
          control: action,
        });
        if (
          action.type !== "powerOff" &&
          action.type !== "read" &&
          current.device.controls?.actions.includes("read")
        )
          return client.deviceAction(id, current.id, {
            kind: "control",
            version: 1,
            control: { type: "read" },
          });
        return response;
      });
      if (!isCurrent() || sessionRef.current?.id !== current.id) return;
      if (action.type === "powerOff") {
        await detach();
        await refresh(undefined, isCurrent);
      } else if (result.controls) setControlState(result.controls);
    });
  }
  function captureScreenshot() {
    if (!session) return;
    const activeSession = session;
    void perform(async (isCurrent) => {
      const next = await withThreadDeviceClient(threadId, (client, id) =>
        client.deviceFrame(id, activeSession.id),
      );
      if (!isCurrent() || sessionRef.current?.id !== activeSession.id) return;
      setFrame(next);
      const link = document.createElement("a");
      link.href = `data:${next.mimeType};base64,${next.base64}`;
      link.download = `device-${next.id}.jpg`;
      link.click();
    });
  }
  function inspectAccessibility() {
    if (!session) return;
    const activeSession = session;
    void perform(async (isCurrent) => {
      const result = await withThreadDeviceClient(threadId, (client, id) =>
        client.inspectDevice(id, activeSession.id),
      );
      if (isCurrent()) {
        setInspection(result.text);
        setCopiedInspection(false);
      }
    });
  }
  function position(clientX: number, clientY: number) {
    const rect = imageRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }
  const canInput =
    visible && !depth && session?.access === "control" && session.device.input && !busy;
  const canLiveRecents =
    canInput &&
    session?.device.platform === "android" &&
    wantsLive &&
    Boolean(live.state) &&
    effectiveLiveClientStatus === "streaming" &&
    effectiveLivePressButton !== null;

  const streamStatus = !session
    ? null
    : !wantsLive
      ? { kind: "snapshots" as const, label: t`Snapshots` }
      : live.error || effectiveLiveClientStatus === "error"
        ? { kind: "unavailable" as const, label: t`Unavailable` }
        : live.state && effectiveLiveClientStatus === "streaming"
          ? { kind: "live" as const, label: t`Live` }
          : live.state && effectiveLiveClientStatus === "reconnecting"
            ? { kind: "reconnecting" as const, label: t`Reconnecting` }
            : { kind: "connecting" as const, label: t`Connecting` };

  const statusLabels = {
    ready: t`Ready`,
    unsupported_host: t`iOS Simulator requires a macOS host with Xcode.`,
    missing_sdk: t`Install Android SDK Emulator and platform-tools, then create an AVD.`,
    missing_xcode: t`Install Xcode and an iOS Simulator runtime on this host.`,
    missing_idb: t`Install Meta idb and idb_companion on this host for iOS input and accessibility.`,
    unavailable: t`Device tooling is unavailable.`,
  };
  function moveToWindow() {
    const child = window.open(DEVICE_PREVIEW_WINDOW_URL, DEVICE_PREVIEW_WINDOW_NAME, "popup");
    if (!child) {
      setError(t`Unable to open device window.`);
      return;
    }
    setDetachedWindow(child);
    setDetached(true);
  }
  function dockToPanel() {
    setDetached(false);
    setDetachedWindow(null);
    window.focus();
    requestAnimationFrame(() => {
      const panel = usePanelStore.getState();
      if (
        panel.deviceWorkspaceThreadId === threadId &&
        !panel.deviceWorkspaceDetached &&
        isDevicesSurfaceActive(panel) &&
        selectFocusedThreadId(useAppStore.getState()) === threadId
      )
        document.getElementById(`panel-devices-${threadId}`)?.focus();
    });
  }
  function close() {
    const panel = usePanelStore.getState();
    if (
      panel.deviceWorkspaceThreadId === threadId &&
      (panel.deviceWorkspaceDetached || isDevicesSurfaceActive(panel))
    )
      panel.setDeviceWorkspaceThreadId(null);
  }
  const closeFromEffect = useEffectEvent(close);
  const dockFromEffect = useEffectEvent(dockToPanel);

  useEffect(() => {
    if (!visible) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        !event.target ||
        !("nodeType" in event.target)
      )
        return;
      const context = usePanelStore.getState();
      if (
        context.deviceWorkspaceThreadId !== threadId ||
        (!context.deviceWorkspaceDetached && !isDevicesSurfaceActive(context))
      )
        return;
      const workspace = contentHost.querySelector(`[id="device-workspace-${threadId}"]`);
      const panel =
        workspace?.closest("[data-poracode-panel], [data-testid=device-detached-window]") ??
        workspace;
      const opener = document.getElementById(`thread-tool-devices-${threadId}`);
      if (!panel?.contains(event.target as Node) && event.target !== opener) return;
      event.preventDefault();
      event.stopPropagation();
      if (detached) dockFromEffect();
      else closeFromEffect();
    };
    window.addEventListener("keydown", escape);
    detachedWindow?.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
      detachedWindow?.removeEventListener("keydown", escape);
    };
  }, [threadId, visible, detached, detachedWindow, contentHost, setDetached]);

  const accessLabel = session ? (session.access === "control" ? t`Control` : t`View only`) : null;
  const headerTitle = (
    <>
      <Smartphone className="size-3.5 shrink-0 text-muted" />
      <Tooltip>
        <Tooltip.Trigger
          className={`${panelHeaderTooltipTriggerResetClass} min-w-0`}
          style={{ flexShrink: 1 }}
        >
          <span className="block truncate text-xs font-medium text-muted">
            {session?.device.name ?? t`Devices`}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content>{session?.device.name ?? t`Devices`}</Tooltip.Content>
      </Tooltip>
      {session && accessLabel ? (
        <Tooltip>
          <Tooltip.Trigger aria-label={accessLabel} className="shrink-0">
            <span className="flex text-muted">
              {session.access === "control" ? (
                <MousePointer2 className="size-3" />
              ) : (
                <Eye className="size-3" />
              )}
            </span>
          </Tooltip.Trigger>
          <Tooltip.Content>{accessLabel}</Tooltip.Content>
        </Tooltip>
      ) : null}
      {streamStatus ? (
        <span
          data-testid="device-stream-status"
          data-status={streamStatus.kind}
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-none font-medium ${
            streamStatus.kind === "live"
              ? "bg-success/15 text-success"
              : streamStatus.kind === "unavailable"
                ? "bg-danger/15 text-danger"
                : "bg-[var(--row-hover)] text-foreground-muted"
          }`}
        >
          {streamStatus.label}
        </span>
      ) : null}
    </>
  );
  const headerActions = (
    <>
      {!session ? (
        <Tooltip>
          <Tooltip.Trigger tabIndex={-1} role="none">
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              className={`${panelHeaderIconButtonClass} h-auto w-auto min-h-0 min-w-0`}
              aria-label={t`Refresh devices`}
              isDisabled={busy}
              onPress={() => void perform((isCurrent) => refresh(undefined, isCurrent))}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{t`Refresh devices`}</Tooltip.Content>
        </Tooltip>
      ) : (
        <>
          <Tooltip>
            <Tooltip.Trigger
              {...(liveAvailable
                ? { tabIndex: -1, role: "none" as const }
                : {
                    "aria-label": t`This host provides snapshots. Live streaming is unavailable.`,
                  })}
            >
              {liveAvailable ? (
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className={`${panelHeaderIconButtonClass} h-auto w-auto min-h-0 min-w-0`}
                  aria-label={snapshotMode ? t`Use live preview` : t`Use snapshots`}
                  aria-pressed={!snapshotMode}
                  isDisabled={busy}
                  onPress={() => setSnapshotMode((value) => !value)}
                >
                  {snapshotMode ? <Camera className="size-3.5" /> : <Video className="size-3.5" />}
                </Button>
              ) : (
                <span className="flex p-0.5 text-muted">
                  <Camera className="size-3.5" />
                </span>
              )}
            </Tooltip.Trigger>
            <Tooltip.Content>
              {liveAvailable
                ? snapshotMode
                  ? t`Use live preview`
                  : t`Use snapshots`
                : t`This host provides snapshots. Live streaming is unavailable.`}
            </Tooltip.Content>
          </Tooltip>
          <Dropdown>
            <Dropdown.Trigger aria-label={t`Actions`} className={panelHeaderIconButtonClass}>
              <SlidersHorizontal className="size-3.5" />
            </Dropdown.Trigger>
            <Dropdown.Popover placement="bottom end">
              <Dropdown.Menu
                aria-label={t`Device workspace`}
                className="poracode-menu min-w-48"
                disabledKeys={
                  busy
                    ? ["screenshot", "inspect", "tools", "powerOff"]
                    : !session.device.accessibility
                      ? ["inspect"]
                      : []
                }
                onAction={(key) => {
                  if (key === "reconnect") live.retry();
                  else if (key === "screenshot") captureScreenshot();
                  else if (key === "inspect") inspectAccessibility();
                  else if (key === "window") moveToWindow();
                  else if (key === "tools") {
                    setToolsOpen(true);
                    if (session.access === "control") applyControl({ type: "read" });
                  } else if (key === "powerOff") setConfirmPowerOff(true);
                }}
              >
                {liveAvailable && !snapshotMode ? (
                  <Dropdown.Item id="reconnect" textValue={t`Reconnect live preview`}>
                    <RefreshCw className="size-3.5 text-muted" />
                    <Label>{t`Reconnect live preview`}</Label>
                  </Dropdown.Item>
                ) : null}
                <Dropdown.Item id="screenshot" textValue={t`Screenshot`}>
                  <Camera className="size-3.5 text-muted" />
                  <Label>{t`Screenshot`}</Label>
                </Dropdown.Item>
                <Dropdown.Item id="inspect" textValue={t`Inspect`}>
                  <Code className="size-3.5 text-muted" />
                  <Label>{t`Inspect`}</Label>
                </Dropdown.Item>
                {!detached ? (
                  <Dropdown.Item id="window" textValue={t`Move device to window`}>
                    <PanelsTopLeft className="size-3.5 text-muted" />
                    <Label>{t`Move device to window`}</Label>
                  </Dropdown.Item>
                ) : null}
                {session.device.controls ? (
                  <Dropdown.Item id="tools" textValue={t`Device settings`}>
                    <SlidersHorizontal className="size-3.5 text-muted" />
                    <Label>{t`Device settings`}</Label>
                  </Dropdown.Item>
                ) : null}
                {session.access === "control" &&
                session.device.controls?.actions.includes("powerOff") ? (
                  <Dropdown.Item
                    id="powerOff"
                    textValue={t`Power off device`}
                    className="text-danger"
                  >
                    <Power className="size-3.5" />
                    <Label>{t`Power off device`}</Label>
                  </Dropdown.Item>
                ) : null}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
          <Tooltip>
            <Tooltip.Trigger tabIndex={-1} role="none">
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={t`Detach`}
                className={`${panelHeaderIconButtonClass} h-auto w-auto min-h-0 min-w-0`}
                onPress={() => void perform(detach)}
              >
                <Unplug className="size-3.5" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>{t`Detaching leaves the device running.`}</Tooltip.Content>
          </Tooltip>
        </>
      )}
    </>
  );

  const content = (
    <aside
      id={`device-workspace-${threadId}`}
      data-testid="device-workspace"
      data-placement="right"
      aria-label={t`Device workspace`}
      className="flex h-full min-h-0 w-full min-w-0 flex-col bg-[var(--content-background)] text-sm"
      inert={!visible}
      aria-hidden={!visible}
    >
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {errorMessage ? (
          <p role="alert" className="mb-3 break-words text-xs text-danger">
            {errorMessage}
          </p>
        ) : null}
        {!session ? (
          <div className="space-y-3">
            <div className="min-w-0 space-y-2 overflow-auto">
              <p className="text-xs text-foreground-muted">
                <Trans>Simulators and emulators on this thread’s host</Trans>
              </p>
              {!inventory ? (
                !errorMessage ? (
                  <p>
                    <Trans>Loading…</Trans>
                  </p>
                ) : null
              ) : (
                <>
                  {inventory.platforms
                    .filter((entry) => entry.status !== "ready" || entry.diagnostic)
                    .map((entry) => (
                      <div
                        key={entry.platform}
                        className="rounded-lg bg-[var(--row-hover)] p-2 text-xs text-foreground-muted"
                      >
                        <p>
                          {entry.status === "ready"
                            ? t`A device failed to start.`
                            : statusLabels[entry.status]}
                        </p>
                        {entry.diagnostic ? (
                          <details className="mt-1 break-words">
                            <summary>
                              <Trans>Details</Trans>
                            </summary>
                            {entry.diagnostic}
                          </details>
                        ) : null}
                      </div>
                    ))}
                  {inventory.devices.length === 0 ? (
                    <p className="py-4 text-center text-foreground-muted">
                      <Trans>No simulators or emulators found.</Trans>
                    </p>
                  ) : (
                    inventory.devices.map((entry) => (
                      <Button
                        key={entry.id}
                        fullWidth
                        variant={selected === entry.id ? "tertiary" : "ghost"}
                        className="h-auto justify-start gap-2 px-2 py-2 text-left"
                        aria-pressed={selected === entry.id}
                        onPress={() => setSelected(entry.id)}
                      >
                        <Smartphone className="size-4 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 truncate">
                          {entry.name}
                          <span className="block text-xs text-foreground-muted">
                            {entry.platform === "ios" ? "iOS" : "Android"} ·{" "}
                            {entry.state === "running"
                              ? t`Running`
                              : entry.state === "starting"
                                ? t`Starting`
                                : t`Stopped`}
                          </span>
                        </span>
                      </Button>
                    ))
                  )}
                </>
              )}
            </div>
            {device ? (
              <div className="space-y-2 border-t border-[var(--border)] pt-3">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={!control ? "secondary" : "ghost"}
                    aria-pressed={!control}
                    onPress={() => setControl(false)}
                  >
                    <Trans>View only</Trans>
                  </Button>
                  <Button
                    size="sm"
                    variant={control ? "secondary" : "ghost"}
                    aria-pressed={control}
                    isDisabled={!device.input}
                    onPress={() => setControl(true)}
                  >
                    <Trans>Control</Trans>
                  </Button>
                </div>
                <Button
                  size="sm"
                  fullWidth
                  variant="tertiary"
                  isDisabled={busy || device.state !== "running"}
                  onPress={() => void perform((isCurrent) => attach(device, isCurrent))}
                >
                  <Trans>Attach</Trans>
                </Button>
                {device.state === "stopped" ? (
                  <Button
                    size="sm"
                    fullWidth
                    variant="secondary"
                    isDisabled={busy}
                    onPress={() => void perform((isCurrent) => attach(device, isCurrent, true))}
                  >
                    <Trans>Start device</Trans>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            data-testid="device-session-layout"
            data-layout="vertical"
            className="flex h-full min-h-0 flex-col gap-2"
          >
            <div
              className="flex min-h-32 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-[var(--row-hover)] p-2"
              style={{ containerType: "size" }}
            >
              <DevicePreviewStage depth={depth}>
                {wantsLive ? (
                  live.state ? (
                    <LiveDevicePreview
                      state={live.state}
                      control={canInput}
                      framed={framed || depth}
                      onStatusChange={setLiveClientStatus}
                      onLivePressButtonChange={(pressButton) =>
                        setLivePressButton(() => pressButton)
                      }
                    />
                  ) : (
                    <p className="p-6 text-xs text-foreground-muted">
                      {live.error
                        ? t`Live preview is unavailable. Retry or use snapshots.`
                        : t`Connecting to the device…`}
                    </p>
                  )
                ) : frame ? (
                  <button
                    type="button"
                    aria-label={t`Live device preview`}
                    disabled={!canInput}
                    data-frame={framed || depth ? "framed" : "flat"}
                    className={`flex h-full min-h-0 max-w-full touch-none items-center justify-center ${
                      canInput ? "cursor-crosshair" : ""
                    } ${
                      framed || depth
                        ? "rounded-[18px] border-2 border-white/15 bg-black p-1 shadow-sm"
                        : ""
                    }`}
                    onKeyDown={(event) => {
                      if (!canInput || !["Enter", "Backspace", "Home"].includes(event.key)) return;
                      event.preventDefault();
                      void perform(() =>
                        send({
                          kind: "key",
                          key:
                            event.key === "Home"
                              ? "home"
                              : event.key === "Enter"
                                ? "enter"
                                : "backspace",
                        }),
                      );
                    }}
                    onPointerDown={(event) => {
                      if (!canInput) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      gesture.current = {
                        ...position(event.clientX, event.clientY),
                        time: Date.now(),
                        frameId: frame.id,
                        element: event.currentTarget,
                      };
                    }}
                    onPointerCancel={() => {
                      gesture.current = null;
                    }}
                    onPointerUp={(event) => {
                      const start = gesture.current;
                      gesture.current = null;
                      if (!start || !canInput) return;
                      const end = position(event.clientX, event.clientY);
                      const moved = Math.hypot(end.x - start.x, end.y - start.y) > 0.02;
                      void perform(() =>
                        send(
                          moved
                            ? {
                                kind: "swipe",
                                frameId: start.frameId,
                                x: start.x,
                                y: start.y,
                                endX: end.x,
                                endY: end.y,
                                durationMs: Math.min(2000, Math.max(100, Date.now() - start.time)),
                              }
                            : { kind: "tap", frameId: start.frameId, x: end.x, y: end.y },
                        ),
                      );
                    }}
                  >
                    <img
                      ref={imageRef}
                      alt=""
                      draggable={false}
                      src={`data:${frame.mimeType};base64,${frame.base64}`}
                      className="max-h-full max-w-full select-none object-contain"
                    />
                  </button>
                ) : (
                  <p className="p-6 text-xs text-foreground-muted">
                    <Trans>Waiting for the device…</Trans>
                  </p>
                )}
              </DevicePreviewStage>
            </div>

            <div
              data-testid="device-controls"
              className="flex shrink-0 flex-col gap-2 border-t border-[var(--border)] pt-2"
            >
              {live.error ? (
                <div
                  role="alert"
                  data-testid="device-live-error"
                  className="space-y-1.5 rounded-lg bg-danger/10 p-2 text-xs text-danger"
                >
                  <p className="break-words">{live.error}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={busy}
                      onPress={() => live.retry()}
                    >
                      <Trans>Retry live</Trans>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      isDisabled={busy}
                      onPress={() => setSnapshotMode(true)}
                    >
                      <Trans>Use snapshots</Trans>
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div
                  role="group"
                  aria-label={t`Navigation controls`}
                  data-testid="device-controls-navigation"
                  className="flex items-center gap-1"
                >
                  <Tooltip>
                    <Tooltip.Trigger tabIndex={-1} role="none">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="ghost"
                        aria-label={t`Home`}
                        isDisabled={!canInput}
                        onPress={() => void perform(() => send({ kind: "key", key: "home" }))}
                      >
                        <Home className="size-4" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>{t`Home`}</Tooltip.Content>
                  </Tooltip>
                  {session.device.platform === "android" ? (
                    <Tooltip>
                      <Tooltip.Trigger tabIndex={-1} role="none">
                        <Button
                          size="sm"
                          isIconOnly
                          variant="ghost"
                          aria-label={t`Back`}
                          isDisabled={!canInput}
                          onPress={() => void perform(() => send({ kind: "key", key: "back" }))}
                        >
                          <ArrowLeft className="size-4" />
                        </Button>
                      </Tooltip.Trigger>
                      <Tooltip.Content>{t`Back`}</Tooltip.Content>
                    </Tooltip>
                  ) : null}
                  {canLiveRecents ? (
                    <Tooltip>
                      <Tooltip.Trigger tabIndex={-1} role="none">
                        <Button
                          size="sm"
                          isIconOnly
                          variant="ghost"
                          aria-label={t`Recents`}
                          onPress={() => effectiveLivePressButton?.("recents")}
                        >
                          <Layers className="size-4" />
                        </Button>
                      </Tooltip.Trigger>
                      <Tooltip.Content>{t`Recents`}</Tooltip.Content>
                    </Tooltip>
                  ) : null}
                </div>

                <div
                  role="group"
                  aria-label={t`Input controls`}
                  data-testid="device-controls-input"
                  className="flex items-center gap-1"
                >
                  <Tooltip>
                    <Tooltip.Trigger tabIndex={-1} role="none">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="ghost"
                        aria-label={t`Enter`}
                        isDisabled={!canInput}
                        onPress={() => void perform(() => send({ kind: "key", key: "enter" }))}
                      >
                        <CornerDownLeft className="size-4" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>{t`Enter`}</Tooltip.Content>
                  </Tooltip>
                  <Tooltip>
                    <Tooltip.Trigger tabIndex={-1} role="none">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="ghost"
                        aria-label={t`Backspace`}
                        isDisabled={!canInput}
                        onPress={() => void perform(() => send({ kind: "key", key: "backspace" }))}
                      >
                        <Delete className="size-4" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>{t`Backspace`}</Tooltip.Content>
                  </Tooltip>
                  {session.access === "control" ? (
                    <Tooltip>
                      <Tooltip.Trigger tabIndex={-1} role="none">
                        <Button
                          size="sm"
                          isIconOnly
                          variant={showTextInput ? "secondary" : "ghost"}
                          aria-label={t`Toggle text input`}
                          aria-pressed={showTextInput}
                          onPress={() => setShowTextInput((value) => !value)}
                        >
                          <Keyboard className="size-4" />
                        </Button>
                      </Tooltip.Trigger>
                      <Tooltip.Content>{t`Toggle text input`}</Tooltip.Content>
                    </Tooltip>
                  ) : null}
                </div>

                <div
                  role="group"
                  aria-label={t`Capture and view controls`}
                  data-testid="device-controls-capture"
                  className="flex items-center gap-1"
                >
                  <Tooltip>
                    <Tooltip.Trigger tabIndex={-1} role="none">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="ghost"
                        aria-label={t`Screenshot`}
                        isDisabled={busy}
                        onPress={captureScreenshot}
                      >
                        <Camera className="size-4" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>{t`Screenshot`}</Tooltip.Content>
                  </Tooltip>
                  <Tooltip>
                    <Tooltip.Trigger tabIndex={-1} role="none">
                      <Button
                        size="sm"
                        isIconOnly
                        variant={inspection ? "secondary" : "ghost"}
                        aria-label={t`Inspect`}
                        isDisabled={busy || !session.device.accessibility}
                        onPress={inspectAccessibility}
                      >
                        <Code className="size-4" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>{t`Inspect`}</Tooltip.Content>
                  </Tooltip>
                  {liveAvailable && !snapshotMode ? (
                    <Tooltip>
                      <Tooltip.Trigger tabIndex={-1} role="none">
                        <Button
                          size="sm"
                          isIconOnly
                          variant="ghost"
                          aria-label={t`Reconnect live preview`}
                          isDisabled={busy}
                          onPress={() => live.retry()}
                        >
                          <RefreshCw className="size-4" />
                        </Button>
                      </Tooltip.Trigger>
                      <Tooltip.Content>{t`Reconnect live preview`}</Tooltip.Content>
                    </Tooltip>
                  ) : null}
                  <Tooltip>
                    <Tooltip.Trigger tabIndex={-1} role="none">
                      <Button
                        size="sm"
                        isIconOnly
                        variant={framed ? "secondary" : "ghost"}
                        aria-label={framed ? t`Flat preview` : t`Framed preview`}
                        aria-pressed={framed}
                        onPress={() => setFramed((value) => !value)}
                      >
                        <Smartphone className="size-4" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      {framed ? t`Flat preview` : t`Framed preview`}
                    </Tooltip.Content>
                  </Tooltip>
                  <Tooltip>
                    <Tooltip.Trigger tabIndex={-1} role="none">
                      <Button
                        size="sm"
                        isIconOnly
                        variant={depth ? "secondary" : "ghost"}
                        aria-label={t`3D preview`}
                        aria-pressed={depth}
                        onPress={() => setDepth((value) => !value)}
                      >
                        <Box className="size-4" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>{t`3D preview`}</Tooltip.Content>
                  </Tooltip>
                </div>
              </div>

              {session.access === "control" && showTextInput ? (
                <form
                  className="flex w-full min-w-0 items-center gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!text || !canInput) return;
                    void perform(async (isCurrent) => {
                      await send({ kind: "text", text });
                      if (isCurrent()) setText("");
                    });
                  }}
                >
                  <Input
                    className="h-9 min-w-0 flex-1"
                    aria-label={t`Type on device`}
                    placeholder={t`Type on device`}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    disabled={!canInput}
                  />
                  <Button
                    size="sm"
                    isIconOnly
                    className="poracode-composer-send shrink-0"
                    aria-label={t`Send`}
                    type="submit"
                    isDisabled={!canInput || !text}
                    isPending={busy}
                  >
                    {({ isPending }) =>
                      isPending ? <PixelLoader size="xs" /> : <ArrowUp className="size-4" />
                    }
                  </Button>
                </form>
              ) : null}

              {inspection ? (
                <div
                  data-testid="device-inspector"
                  className="flex min-h-0 flex-col gap-1 rounded-lg bg-[var(--row-hover)] p-2"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[11px] font-medium text-foreground-muted">
                      <Trans>Accessibility inspector</Trans>
                    </span>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <Tooltip.Trigger tabIndex={-1} role="none">
                          <Button
                            size="sm"
                            isIconOnly
                            variant="ghost"
                            className="size-6 min-h-0 min-w-0"
                            aria-label={t`Copy accessibility tree`}
                            onPress={() => {
                              void navigator.clipboard?.writeText(inspection);
                              setCopiedInspection(true);
                            }}
                          >
                            {copiedInspection ? (
                              <Check className="size-3.5" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content>{t`Copy accessibility tree`}</Tooltip.Content>
                      </Tooltip>
                      <Tooltip>
                        <Tooltip.Trigger tabIndex={-1} role="none">
                          <Button
                            size="sm"
                            isIconOnly
                            variant="ghost"
                            className="size-6 min-h-0 min-w-0"
                            aria-label={t`Close inspector`}
                            onPress={() => setInspection(null)}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content>{t`Close inspector`}</Tooltip.Content>
                      </Tooltip>
                    </div>
                  </div>
                  <pre
                    aria-label={t`Device accessibility`}
                    className="max-h-48 overflow-auto text-[10px] whitespace-pre-wrap"
                  >
                    {inspection}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
  return (
    <UNSAFE_PortalProvider
      getContainer={() =>
        detached && detachedWindow ? detachedWindow.document.body : document.body
      }
    >
      {!detached && visible && titleTarget ? createPortal(headerTitle, titleTarget) : null}
      {!detached && visible && actionsTarget ? createPortal(headerActions, actionsTarget) : null}
      <div ref={setPanelBody} className={detached ? "hidden" : "h-full min-h-0"} />
      {detached && detachedWindow ? (
        <DeviceDetachedWindow
          window={detachedWindow}
          title={headerTitle}
          actions={headerActions}
          onDock={dockToPanel}
        >
          <div ref={setDetachedBody} className="h-full min-h-0" />
        </DeviceDetachedWindow>
      ) : null}
      {createPortal(content, contentHost)}
      {session?.device.controls ? (
        <Modal.Backdrop isOpen={toolsOpen && visible} onOpenChange={setToolsOpen}>
          <Modal.Container placement="center" size="sm" className="max-sm:p-0">
            <Modal.Dialog className="max-sm:h-dvh max-sm:w-screen max-sm:max-w-none max-sm:rounded-none! sm:max-w-[460px]">
              <Modal.CloseTrigger aria-label={t`Close device settings`} />
              <Modal.Header>
                <Modal.Heading>{t`Device settings`}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="min-h-0 gap-3 p-4">
                <DeviceTools
                  device={session.device}
                  state={controlState}
                  disabled={!visible || busy || session.access !== "control"}
                  onAction={applyControl}
                />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      ) : null}
      <ConfirmDialog
        isOpen={confirmPowerOff && visible}
        title={t`Power off device?`}
        body={t`This shuts down the selected emulator and disconnects every viewer. Detach instead to leave it running.`}
        confirmLabel={t`Power off device`}
        isPending={busy}
        onConfirm={() => applyControl({ type: "powerOff" })}
        onClose={() => setConfirmPowerOff(false)}
      />
    </UNSAFE_PortalProvider>
  );
}
