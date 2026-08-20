import { useCallback, useEffect, useRef, useState } from "react";
import { Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Check,
  Copy,
  Maximize2,
  Minimize2,
  PanelRightOpen,
  PictureInPicture2,
  X,
} from "lucide-react";
import { isMac, readBridge } from "@/renderer/bridge";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { useBrowserFindStore } from "@/renderer/state/browserFindStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  macosTrafficLightGutterClass,
  overlayHeaderStyle,
  panelHeaderIconButtonClass,
} from "@/renderer/components/layout/sidebarChrome";
import { BrowserBookmarkBar } from "./parts/BrowserBookmarkBar";
import { BrowserDeviceToolbar } from "./parts/BrowserDeviceToolbar";
import { BrowserDownloadsPage } from "./parts/BrowserDownloadsPage";
import { BrowserEmptyState } from "./parts/BrowserEmptyState";
import { BrowserFindBar } from "./parts/BrowserFindBar";
import { BrowserImportModal } from "./parts/BrowserImportModal";
import { BrowserPasswordsPage } from "./parts/BrowserPasswordsPage";
import { BrowserTabWebview } from "./parts/BrowserTabWebview";
import { BrowserTabStrip } from "./parts/BrowserTabStrip";
import { BrowserToolbar } from "./parts/BrowserToolbar";
import { extractBrowserToWindow, injectBrowserToMain } from "./browserWindowActions";
import { useElementPicker } from "./hooks/useElementPicker";

const DEFAULT_HOME = "https://duckduckgo.com";

export function BrowserPanel(props: { visible: boolean; surface?: "main" | "window" }) {
  const { t } = useLingui();
  const tabs = useBrowserPanelStore((s) => s.tabs);
  const activeTabId = useBrowserPanelStore((s) => s.activeTabId);
  const browserPanelOpen = usePanelStore((s) => s.browserPanelOpen);
  const browserOverlayOpen = usePanelStore((s) => s.browserOverlayOpen);
  const browserOverlayMaximized = usePanelStore((s) => s.browserOverlayMaximized);
  const setBrowserPanelOpen = usePanelStore((s) => s.setBrowserPanelOpen);
  const setBrowserOverlayOpen = usePanelStore((s) => s.setBrowserOverlayOpen);
  const setBrowserOverlayMaximized = usePanelStore((s) => s.setBrowserOverlayMaximized);
  const setRightPanelTab = usePanelStore((s) => s.setRightPanelTab);
  const isWindowSurface = props.surface === "window";
  const visible = props.visible || browserOverlayOpen || isWindowSurface;
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
  const activeTab = activeTabId ? tabs.find((tab) => tab.tabId === activeTabId) : undefined;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (browserOverlayOpen || isWindowSurface) rootRef.current?.focus({ preventScroll: true });
  }, [browserOverlayOpen, isWindowSurface]);

  const createTab = useCallback(() => {
    void readBridge()
      .browserCreateTab({ url: DEFAULT_HOME, activate: true })
      .catch(() => {});
  }, []);

  // Attached imperatively (rather than a JSX onKeyDown) because this container
  // is a plain grouping element, not a widget — the reload shortcut is a
  // global-ish capture over the panel's focused descendants, not an
  // interaction of the group itself.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeTabId) return;
      if (isBrowserFindShortcut(event)) {
        if (activeTab?.internalPage) return;
        event.preventDefault();
        event.stopPropagation();
        useBrowserFindStore.getState().open(activeTabId);
        return;
      }
      if (isBrowserPrintShortcut(event)) {
        if (activeTab?.internalPage) return;
        event.preventDefault();
        event.stopPropagation();
        readBridge()
          .browserPrint({ tabId: activeTabId })
          .catch(() => {});
        return;
      }
      if (!isBrowserReloadShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const bridge = readBridge();
      if (event.shiftKey) {
        bridge.browserHardReload({ tabId: activeTabId }).catch(() => {});
        return;
      }
      bridge.browserReload({ tabId: activeTabId }).catch(() => {});
    };
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [activeTab?.internalPage, activeTabId]);

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
  const hasWindowHeader = isFullscreenOverlay || isWindowSurface;
  const headerButtonClass = `${
    hasWindowHeader ? "poracode-overlay-header__controls " : ""
  }${panelHeaderIconButtonClass}`;
  const restoreToPanel = () => {
    setBrowserOverlayMaximized(false);
    setBrowserOverlayOpen(false);
    setBrowserPanelOpen(true);
    setRightPanelTab("browser");
  };
  const extractButton = (
    <button
      type="button"
      className={headerButtonClass}
      title={t`Move browser to window`}
      aria-label={t`Move browser to window`}
      onClick={extractBrowserToWindow}
    >
      <PictureInPicture2 className="size-3.5" />
    </button>
  );
  return (
    <div
      ref={rootRef}
      data-poracode-browser=""
      role="group"
      tabIndex={-1}
      aria-label={t`Browser`}
      className="flex h-full w-full min-h-0 flex-col bg-[var(--content-background)]"
    >
      {browserOverlayOpen || isWindowSurface ? (
        <div
          className={`${
            hasWindowHeader
              ? "poracode-overlay-header"
              : "poracode-overlay-header poracode-overlay-header--no-drag"
          } flex shrink-0 items-center gap-1 border-b border-[color:var(--border)] bg-[var(--content-background)] px-2`}
          style={hasWindowHeader ? overlayHeaderStyle() : { height: "32px" }}
        >
          {isMac() && hasWindowHeader ? (
            <div className={macosTrafficLightGutterClass} aria-hidden />
          ) : null}
          {hasWindowHeader ? (
            <BrowserTabStrip variant="header" onCreateTab={createTab} />
          ) : (
            <div className="text-xs font-medium text-foreground">
              <Trans>Browser</Trans>
            </div>
          )}
          <BrowserDeviceCodeButton />
          {hasWindowHeader ? null : <div className="flex-1" />}
          {isWindowSurface ? (
            <button
              type="button"
              className={headerButtonClass}
              title={t`Move browser back to main window`}
              aria-label={t`Move browser back to main window`}
              onClick={injectBrowserToMain}
            >
              <PanelRightOpen className="size-3.5" />
            </button>
          ) : browserPanelOpen ? (
            <>
              {extractButton}
              <button
                type="button"
                className={headerButtonClass}
                title={t`Minimize to panel`}
                aria-label={t`Minimize browser to right panel`}
                onClick={restoreToPanel}
              >
                <Minimize2 className="size-3.5" />
              </button>
            </>
          ) : (
            <>
              {browserOverlayMaximized ? (
                <button
                  type="button"
                  className={headerButtonClass}
                  title={t`Restore`}
                  aria-label={t`Restore browser`}
                  onClick={() => setBrowserOverlayMaximized(false)}
                >
                  <Minimize2 className="size-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  className={headerButtonClass}
                  title={t`Maximize`}
                  aria-label={t`Maximize browser`}
                  onClick={() => setBrowserOverlayMaximized(true)}
                >
                  <Maximize2 className="size-3.5" />
                </button>
              )}
              {extractButton}
              <button
                type="button"
                className={headerButtonClass}
                title={t`Close`}
                aria-label={t`Close browser`}
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
      {hasWindowHeader ? null : <BrowserTabStrip onCreateTab={createTab} />}
      <BrowserBookmarkBar />
      <BrowserDeviceToolbar />
      <div className="relative flex-1 overflow-hidden bg-[var(--content-background)]">
        {tabs
          .filter((tab) => !tab.internalPage)
          .map((tab) => (
            <BrowserTabWebview
              key={tab.tabId}
              tabId={tab.tabId}
              initialSrc={tab.url}
              visible={visible && !menuPreviewDataUrl && tab.tabId === activeTabId}
              {...(tab.deviceEmulation ? { emulation: tab.deviceEmulation } : {})}
            />
          ))}
        {activeTab?.internalPage === "downloads" ? (
          <div className="absolute inset-0">
            <BrowserDownloadsPage />
          </div>
        ) : activeTab?.internalPage === "passwords" ? (
          <div className="absolute inset-0">
            <BrowserPasswordsPage />
          </div>
        ) : null}
        <BrowserFindBar />
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
      <BrowserImportModal />
    </div>
  );
}

function BrowserDeviceCodeButton() {
  const { t } = useLingui();
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
  }, [deviceCode]);

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
          title={t`Copy ${activeDeviceCode.providerLabel} device code ${activeDeviceCode.code}`}
          aria-label={t`Copy ${activeDeviceCode.providerLabel} device code ${activeDeviceCode.code}`}
          onClick={copyDeviceCode}
        >
          {copied ? (
            <Check className="size-3 shrink-0 text-accent" />
          ) : (
            <Copy className="size-3 shrink-0 text-accent" />
          )}
          <span className="shrink-0 text-muted">
            <Trans>Paste</Trans>
          </span>
          <span className="truncate font-mono text-foreground">{activeDeviceCode.code}</span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="bottom" className="z-[1000] px-2 py-1.5 text-xs">
        <span className="block whitespace-nowrap">
          {copied ? <Trans>Code copied. </Trans> : ""}
          <Trans>
            Paste <span className="font-mono text-foreground">{activeDeviceCode.code}</span> here.
            Click to copy.
          </Trans>
        </span>
      </Tooltip.Content>
    </Tooltip>
  );
}

function isBrowserReloadShortcut(event: KeyboardEvent): boolean {
  if (event.key === "F5") return true;
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r";
}

function isBrowserFindShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "f"
  );
}

function isBrowserPrintShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "p"
  );
}
