import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner, Tooltip } from "@heroui/react";
import { useRendererActionStore } from "@/renderer/state/rendererActionStore";
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
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { readBridge } from "@/renderer/bridge";
import {
  createBrowserTab,
  runBrowserNavigation,
  printBrowserTab,
} from "@/renderer/actions/browserActions";
import { hasMacWindowChrome } from "@/renderer/components/layout/windowChrome";
import { hasClientCapability } from "@/renderer/clientRuntime";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  macosTrafficLightGutterClass,
  overlayHeaderStyle,
  panelHeaderIconButtonClass,
} from "@/renderer/components/layout/sidebarChrome";
import { BrowserBookmarkBar } from "./parts/BrowserBookmarkBar";
import { BrowserEmptyState } from "./parts/BrowserEmptyState";
import { BrowserTabStrip } from "./parts/BrowserTabStrip";
import { BrowserToolbar } from "./parts/BrowserToolbar";
import { RemoteBrowserMirror } from "./RemoteBrowserMirror";
import { extractBrowserToWindow, injectBrowserToMain } from "./browserWindowActions";
import { useElementPicker } from "./hooks/useElementPicker";

import { BrowserTabWebview } from "./parts/BrowserTabWebview";
import { BrowserDownloadsPage } from "./parts/BrowserDownloadsPage";
import { BrowserPasswordsPage } from "./parts/BrowserPasswordsPage";
import { BrowserDeviceToolbar } from "./parts/BrowserDeviceToolbar";
import { BrowserFindBar } from "./parts/BrowserFindBar";
import { BrowserImportModal } from "./parts/BrowserImportModal";
import { useBrowserFindStore } from "@/renderer/state/browserFindStore";

const DEFAULT_HOME = "https://duckduckgo.com";

export function BrowserPanel(props: { visible: boolean; surface?: "main" | "window" }) {
  const { t } = useLingui();
  const movingWindow = useRendererActionStore((state) => !!state.pending["browser:window"]);
  const compact = useCompactLayout();
  const tabs = useBrowserPanelStore((s) => s.tabs);
  const residentTabs = useBrowserPanelStore((s) => s.residentTabs);
  const activeTabId = useBrowserPanelStore((s) => s.activeTabId);
  const activeTab = tabs.find((tab) => tab.tabId === activeTabId);
  const initialized = useBrowserPanelStore((s) => s.initialized);
  const browserPanelOpen = usePanelStore((s) => s.browserPanelOpen);
  const browserOverlayOpen = usePanelStore((s) => s.browserOverlayOpen);
  const browserOverlayMaximized = usePanelStore((s) => s.browserOverlayMaximized);
  const setBrowserPanelOpen = usePanelStore((s) => s.setBrowserPanelOpen);
  const setBrowserOverlayOpen = usePanelStore((s) => s.setBrowserOverlayOpen);
  const setBrowserOverlayMaximized = usePanelStore((s) => s.setBrowserOverlayMaximized);
  const setRightPanelTab = usePanelStore((s) => s.setRightPanelTab);
  const isWindowSurface = props.surface === "window";
  const nativeBrowserWebContents = hasClientCapability("nativeBrowserWebContents");
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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (browserOverlayOpen || isWindowSurface) rootRef.current?.focus({ preventScroll: true });
  }, [browserOverlayOpen, isWindowSurface]);

  const createTab = useCallback(() => {
    createBrowserTab(DEFAULT_HOME);
  }, []);

  // Attached imperatively (rather than a JSX onKeyDown) because this container
  // is a plain grouping element, not a widget — the reload shortcut is a
  // global-ish capture over the panel's focused descendants, not an
  // interaction of the group itself.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeTabId || activeTab?.internalPage) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "f" &&
        nativeBrowserWebContents
      ) {
        event.preventDefault();
        event.stopPropagation();
        useBrowserFindStore.getState().open(activeTabId);
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "p" &&
        nativeBrowserWebContents
      ) {
        event.preventDefault();
        event.stopPropagation();
        void printBrowserTab(activeTabId);
        return;
      }
      if (!isBrowserReloadShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const bridge = readBridge();
      if (event.shiftKey) {
        runBrowserNavigation(activeTabId, () => bridge.browserHardReload({ tabId: activeTabId }));
        return;
      }
      runBrowserNavigation(activeTabId, () => bridge.browserReload({ tabId: activeTabId }));
    };
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, activeTab?.internalPage, nativeBrowserWebContents]);

  const onPick = useCallback(() => {
    void startPicker();
  }, [startPicker]);

  useEffect(() => {
    if (tabs.length > 0) everHadTabsRef.current = true;
  }, [tabs.length]);

  useEffect(() => {
    if (!visible || !initialized) return;
    if (tabs.length > 0) return;
    if (everHadTabsRef.current) return;
    createTab();
  }, [createTab, visible, initialized, tabs.length]);

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
  const extractButton = nativeBrowserWebContents ? (
    <button
      type="button"
      className={headerButtonClass}
      title={t`Move browser to window`}
      aria-label={t`Move browser to window`}
      onClick={extractBrowserToWindow}
      disabled={movingWindow}
      aria-busy={movingWindow}
    >
      {movingWindow ? <Spinner size="sm" /> : <PictureInPicture2 className="size-3.5" />}
    </button>
  ) : null;
  const toolbar = (
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
  );
  const tabStrip = hasWindowHeader ? null : <BrowserTabStrip onCreateTab={createTab} />;
  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      data-poracode-browser=""
      role="group"
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
          {hasMacWindowChrome() && hasWindowHeader ? (
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
              disabled={movingWindow}
              aria-busy={movingWindow}
            >
              {movingWindow ? <Spinner size="sm" /> : <PanelRightOpen className="size-3.5" />}
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
      {compact ? null : toolbar}
      {compact ? null : tabStrip}
      {compact ? null : <BrowserBookmarkBar />}
      {nativeBrowserWebContents ? <BrowserDeviceToolbar /> : null}
      <div className="relative flex-1 overflow-hidden bg-[var(--content-background)]">
        {nativeBrowserWebContents ? (
          residentTabs
            .filter((tab) => !tab.internalPage)
            .map((tab) => (
              <BrowserTabWebview
                key={tab.tabId}
                tabId={tab.tabId}
                initialSrc={tab.url}
                {...(tab.deviceEmulation ? { emulation: tab.deviceEmulation } : {})}
                visible={visible && !menuPreviewDataUrl && tab.tabId === activeTabId}
              />
            ))
        ) : (
          <RemoteBrowserMirror activeTabId={activeTabId} visible={visible && !menuPreviewDataUrl} />
        )}
        {nativeBrowserWebContents && activeTab?.internalPage === "downloads" ? (
          <div className="absolute inset-0">
            <BrowserDownloadsPage />
          </div>
        ) : nativeBrowserWebContents && activeTab?.internalPage === "passwords" ? (
          <div className="absolute inset-0">
            <BrowserPasswordsPage />
          </div>
        ) : null}
        {nativeBrowserWebContents ? <BrowserFindBar /> : null}
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
      {compact ? (
        <div className="poracode-mobile-browser-chrome" data-mobile-browser-chrome="">
          {tabStrip}
          <BrowserBookmarkBar />
          {toolbar}
        </div>
      ) : null}
      {nativeBrowserWebContents ? <BrowserImportModal /> : null}
    </div>
  );
}

function BrowserDeviceCodeButton() {
  const { t } = useLingui();
  const deviceCode = useBrowserPanelStore((s) => s.usageLoginDeviceCode);
  const [copied, setCopied] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A fresh device code auto-copies and opens the tooltip; clearing it resets
  // both. Derived from `deviceCode`, so adjust during render — only the
  // timeout that clears "copied" stays in the effect.
  const [prevDeviceCode, setPrevDeviceCode] = useState(deviceCode);
  if (prevDeviceCode !== deviceCode) {
    setPrevDeviceCode(deviceCode);
    if (!deviceCode) {
      setCopied(false);
      setTooltipOpen(false);
    } else {
      setCopied(true);
      setTooltipOpen(true);
    }
  }

  useEffect(() => {
    if (!deviceCode) {
      return;
    }
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 1_500);
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = null;
      }
    };
  }, [deviceCode]);

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
