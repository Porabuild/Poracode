import { useEffect } from "react";
import { readBridge } from "@/renderer/bridge";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { selectAnyObstructingOverlayOpen, usePanelStore } from "@/renderer/state/panelStore";

export function useBrowserSync(): void {
  const setState = useBrowserPanelStore((s) => s.setState);
  const upsertTab = useBrowserPanelStore((s) => s.upsertTab);
  const setAttention = useBrowserPanelStore((s) => s.setAttention);
  const setPickerActive = useBrowserPanelStore((s) => s.setPickerActive);
  const setAutomationActive = useBrowserPanelStore((s) => s.setAutomationActive);
  const setUsageLoginConfirmation = useBrowserPanelStore((s) => s.setUsageLoginConfirmation);
  const clearUsageLoginConfirmation = useBrowserPanelStore((s) => s.clearUsageLoginConfirmation);
  const setUsageLoginDeviceCode = useBrowserPanelStore((s) => s.setUsageLoginDeviceCode);
  const clearUsageLoginDeviceCode = useBrowserPanelStore((s) => s.clearUsageLoginDeviceCode);

  useEffect(() => {
    let cancelled = false;
    const isMainWindow = readBridge().windowKind === "main";
    // Overlay/panel presentation side-effects belong to the main window alone,
    // and never while the browser is extracted to its own window — the extract
    // window subscribes purely to mirror tab/bookmark state.
    const reactsToPresentation = () => isMainWindow && !useBrowserPanelStore.getState().extracted;
    const unsub = readBridge().onBrowserEvent((event) => {
      if (event.type === "state") {
        const hadTabs = useBrowserPanelStore.getState().tabs.length > 0;
        setState(event.state);
        if (event.state.extracted && isMainWindow) {
          usePanelStore.getState().setBrowserOverlayOpen(false);
        }
        if (hadTabs && event.state.tabs.length === 0) {
          // Closing the last tab dismisses the browser entirely. The panel and
          // overlay are independent (hiding the panel no longer closes the
          // overlay), so dismiss both explicitly here.
          const panel = usePanelStore.getState();
          panel.setBrowserOverlayOpen(false);
          panel.setBrowserPanelOpen(false);
        }
      } else if (event.type === "tab-updated") {
        upsertTab(event.tab);
      } else if (event.type === "tab-attention") {
        setAttention(event.tabId);
      } else if (event.type === "open-panel") {
        if (!reactsToPresentation()) return;
        const panel = usePanelStore.getState();
        const wantsFullscreen = event.mode === "overlay";
        if (wantsFullscreen || selectAnyObstructingOverlayOpen()) {
          if (panel.browserPanelOpen) panel.setRightPanelTab("browser");
          // Float the overlay above any active z-50 surface. Fullscreen when the
          // user explicitly chose "overlay" presentation, drawer (z-60) when
          // forced because an obstructing overlay would otherwise hide the page.
          panel.setBrowserOverlayMaximized(wantsFullscreen);
          panel.setBrowserOverlayOpen(true);
        } else {
          if (event.mode === "panel") {
            panel.setBrowserOverlayOpen(false);
          }
          panel.openBrowserPanel();
        }
      } else if (event.type === "automation-active") {
        setAutomationActive(event.active);
      } else if (event.type === "picker-cancelled") {
        setPickerActive(false);
      } else if (event.type === "usage-login-confirmation") {
        setUsageLoginConfirmation(event.request);
      } else if (event.type === "usage-login-confirmation-closed") {
        clearUsageLoginConfirmation(event.requestId);
      } else if (event.type === "usage-login-device-code") {
        setUsageLoginDeviceCode(event.deviceCode);
      } else if (event.type === "usage-login-device-code-cleared") {
        clearUsageLoginDeviceCode(event.providerId);
      }
    });
    readBridge()
      .browserGetState()
      .then((state) => {
        if (!cancelled) setState(state);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsub();
    };
  }, [
    setState,
    upsertTab,
    setAttention,
    setPickerActive,
    setAutomationActive,
    setUsageLoginConfirmation,
    clearUsageLoginConfirmation,
    setUsageLoginDeviceCode,
    clearUsageLoginDeviceCode,
  ]);
}
