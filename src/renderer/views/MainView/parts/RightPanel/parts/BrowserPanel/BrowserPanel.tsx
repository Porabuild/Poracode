import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Tooltip } from "@heroui/react";
import { Check, Copy, Maximize2, Minimize2, X } from "lucide-react";
import { isMac, readBridge } from "@/renderer/bridge";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  macosTrafficLightGutterClass,
  overlayHeaderStyle,
  panelHeaderIconButtonClass,
} from "@/renderer/components/layout/sidebarChrome";
import { BrowserEmptyState } from "./parts/BrowserEmptyState";
import { BrowserTabStrip } from "./parts/BrowserTabStrip";
import { BrowserToolbar } from "./parts/BrowserToolbar";
import { useElementPicker } from "./hooks/useElementPicker";

const DEFAULT_HOME = "https://www.google.com";

export function BrowserPanel(props: { visible: boolean }) {
  const tabs = useBrowserPanelStore((s) => s.tabs);
  const activeTabId = useBrowserPanelStore((s) => s.activeTabId);
  const browserPanelOpen = usePanelStore((s) => s.browserPanelOpen);
  const browserOverlayOpen = usePanelStore((s) => s.browserOverlayOpen);
  const browserOverlayMaximized = usePanelStore((s) => s.browserOverlayMaximized);
  const setBrowserPanelOpen = usePanelStore((s) => s.setBrowserPanelOpen);
  const setBrowserOverlayOpen = usePanelStore((s) => s.setBrowserOverlayOpen);
  const setBrowserOverlayMaximized = usePanelStore((s) => s.setBrowserOverlayMaximized);
  const setRightPanelTab = usePanelStore((s) => s.setRightPanelTab);
  const visible = props.visible || browserOverlayOpen;
  const [menuPreviewDataUrl, setMenuPreviewDataUrl] = useState<string | null>(null);
  const {
    pickerActive,
    startPicker,
    threadTargets,
    pendingPickerAttachment,
    chooseTargetForPendingPick,
    cancelPendingPick,
  } = useElementPicker();
  const everHadTabsRef = useRef(false);
  const hasActiveTab = tabs.length > 0 && activeTabId !== null;

  const createTab = useCallback(async () => {
    try {
      await readBridge().browserCreateTab({ url: DEFAULT_HOME, activate: true });
    } catch {}
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!activeTabId || !isBrowserReloadShortcut(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const bridge = readBridge();
    if (event.shiftKey) {
      bridge.browserHardReload({ tabId: activeTabId }).catch(() => {});
      return;
    }
    bridge.browserReload({ tabId: activeTabId }).catch(() => {});
  };

  const onPick = useCallback(() => {
    void startPicker();
  }, [startPicker]);

  useEffect(() => {
    if (tabs.length > 0) everHadTabsRef.current = true;
  }, [tabs.length]);

  useEffect(() => {
    if (!visible) return;
    if (tabs.length > 0) return;
    if (everHadTabsRef.current) return;
    // Small grace window so persisted tabs restored by main don't race with
    // an auto-create on cold start.
    const timer = setTimeout(() => {
      if (useBrowserPanelStore.getState().tabs.length === 0 && !everHadTabsRef.current) {
        void createTab();
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [createTab, visible, tabs.length]);

  const isFullscreenOverlay = browserOverlayOpen && browserOverlayMaximized;
  const headerButtonClass = `${
    isFullscreenOverlay ? "lightcode-overlay-header__controls " : ""
  }${panelHeaderIconButtonClass}`;
  const restoreToPanel = () => {
    setBrowserOverlayMaximized(false);
    setBrowserOverlayOpen(false);
    setBrowserPanelOpen(true);
    setRightPanelTab("browser");
  };
  return (
    <div
      role="group"
      aria-label="Browser"
      className="flex h-full min-h-0 flex-col bg-[var(--content-background)]"
      onKeyDown={onKeyDown}
    >
      {browserOverlayOpen ? (
        <div
          className={`${
            isFullscreenOverlay
              ? "lightcode-overlay-header"
              : "lightcode-overlay-header lightcode-overlay-header--no-drag"
          } flex shrink-0 items-center gap-1.5 border-b border-[color:var(--border)] bg-[var(--content-background)] px-2`}
          style={isFullscreenOverlay ? overlayHeaderStyle() : { height: "32px" }}
        >
          {isMac() && isFullscreenOverlay ? (
            <div className={macosTrafficLightGutterClass} aria-hidden />
          ) : null}
          <div className="text-xs font-medium text-foreground">Browser</div>
          <BrowserDeviceCodeButton />
          <div className="flex-1" />
          {browserPanelOpen ? (
            <button
              type="button"
              className={headerButtonClass}
              title="Minimize to panel"
              aria-label="Minimize browser to right panel"
              onClick={restoreToPanel}
            >
              <Minimize2 className="size-3.5" />
            </button>
          ) : (
            <>
              {browserOverlayMaximized ? (
                <button
                  type="button"
                  className={headerButtonClass}
                  title="Restore"
                  aria-label="Restore browser"
                  onClick={() => setBrowserOverlayMaximized(false)}
                >
                  <Minimize2 className="size-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  className={headerButtonClass}
                  title="Maximize"
                  aria-label="Maximize browser"
                  onClick={() => setBrowserOverlayMaximized(true)}
                >
                  <Maximize2 className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                className={headerButtonClass}
                title="Close"
                aria-label="Close browser"
                onClick={() => setBrowserOverlayOpen(false)}
              >
                <X className="size-3.5" />
              </button>
            </>
          )}
        </div>
      ) : null}
      <BrowserToolbar
        onPick={onPick}
        onCreateTab={createTab}
        pickerActive={pickerActive}
        pickerTargets={threadTargets}
        hasPendingPick={pendingPickerAttachment !== null}
        pendingPickAnchor={
          pendingPickerAttachment &&
          typeof pendingPickerAttachment.anchorX === "number" &&
          typeof pendingPickerAttachment.anchorY === "number"
            ? { x: pendingPickerAttachment.anchorX, y: pendingPickerAttachment.anchorY }
            : null
        }
        onChoosePickTarget={chooseTargetForPendingPick}
        onCancelPendingPick={cancelPendingPick}
        onMenuPreviewChange={setMenuPreviewDataUrl}
      />
      <BrowserTabStrip />
      <div className="relative flex-1 overflow-hidden bg-[var(--content-background)]">
        {tabs.map((tab) => (
          <BrowserTabWebview
            key={tab.tabId}
            tabId={tab.tabId}
            initialSrc={tab.url}
            visible={visible && !menuPreviewDataUrl && tab.tabId === activeTabId}
          />
        ))}
        {menuPreviewDataUrl ? (
          <img
            src={menuPreviewDataUrl}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full object-cover object-left-top"
          />
        ) : null}
        {!hasActiveTab ? (
          <div className="absolute inset-0">
            <BrowserEmptyState onCreateTab={createTab} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BrowserDeviceCodeButton() {
  const deviceCode = useBrowserPanelStore((s) => s.usageLoginDeviceCode);
  const [copied, setCopied] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!deviceCode) {
      setCopied(false);
      setTooltipOpen(false);
      return;
    }
    setCopied(true);
    setTooltipOpen(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 1_500);
  }, [deviceCode?.code, deviceCode]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  if (!deviceCode) return null;
  const activeDeviceCode = deviceCode;

  function copyDeviceCode() {
    navigator.clipboard
      .writeText(activeDeviceCode.code)
      .then(() => {
        setCopied(true);
        setTooltipOpen(true);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setCopied(false), 1_500);
      })
      .catch(() => {});
  }

  return (
    <Tooltip delay={0} isOpen={tooltipOpen} onOpenChange={setTooltipOpen}>
      <Tooltip.Trigger>
        <button
          type="button"
          className="ml-1.5 flex h-5 max-w-[170px] items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 text-[11px] text-foreground transition-colors hover:bg-accent/15"
          title={`Copy ${activeDeviceCode.providerLabel} device code ${activeDeviceCode.code}`}
          aria-label={`Copy ${activeDeviceCode.providerLabel} device code ${activeDeviceCode.code}`}
          onClick={copyDeviceCode}
        >
          {copied ? (
            <Check className="size-3 shrink-0 text-accent" />
          ) : (
            <Copy className="size-3 shrink-0 text-accent" />
          )}
          <span className="shrink-0 text-muted">Paste</span>
          <span className="truncate font-mono text-foreground">{activeDeviceCode.code}</span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="bottom" className="z-[1000] px-2 py-1.5 text-xs">
        <span className="block whitespace-nowrap">
          {copied ? "Code copied. " : ""}
          Paste <span className="font-mono text-foreground">{activeDeviceCode.code}</span> here.
          Click to copy.
        </span>
      </Tooltip.Content>
    </Tooltip>
  );
}

function BrowserTabWebview(props: { tabId: string; initialSrc: string; visible: boolean }) {
  const ref = useRef<HTMLWebViewElement | null>(null);
  const initialSrcRef = useRef(props.initialSrc);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const onDomReady = () => {
      if (cancelled) return;
      let webContentsId: number;
      try {
        webContentsId = el.getWebContentsId();
      } catch {
        return;
      }
      readBridge()
        .browserAttachWebContents({ tabId: props.tabId, webContentsId })
        .catch(() => {});
    };
    el.addEventListener("dom-ready", onDomReady);
    return () => {
      cancelled = true;
      el.removeEventListener("dom-ready", onDomReady);
    };
  }, [props.tabId]);

  return (
    <webview
      ref={ref}
      data-tab-id={props.tabId}
      partition="persist:lightcode-browser"
      src={initialSrcRef.current || "about:blank"}
      allowpopups={true}
      className="absolute inset-0 size-full"
      style={{ display: props.visible ? "flex" : "none" }}
    />
  );
}

function isBrowserReloadShortcut(event: KeyboardEvent): boolean {
  if (event.key === "F5") return true;
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r";
}
