import { useEffect } from "react";
import { readBridge } from "@/renderer/bridge";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { selectAnyObstructingOverlayOpen, usePanelStore } from "@/renderer/state/panelStore";

export function useBrowserSync(): void {
  const setState = useBrowserPanelStore((s) => s.setState);
  const upsertTab = useBrowserPanelStore((s) => s.upsertTab);
  const setAttention = useBrowserPanelStore((s) => s.setAttention);
  const setPickerActive = useBrowserPanelStore((s) => s.setPickerActive);
  const setUsageLoginConfirmation = useBrowserPanelStore((s) => s.setUsageLoginConfirmation);
  const clearUsageLoginConfirmation = useBrowserPanelStore((s) => s.clearUsageLoginConfirmation);
  const setUsageLoginDeviceCode = useBrowserPanelStore((s) => s.setUsageLoginDeviceCode);
  const clearUsageLoginDeviceCode = useBrowserPanelStore((s) => s.clearUsageLoginDeviceCode);

  useEffect(() => {
    let cancelled = false;
    const unsub = readBridge().onBrowserEvent((event) => {
      if (event.type === "state") {
        setState(event.state);
      } else if (event.type === "tab-updated") {
        upsertTab(event.tab);
      } else if (event.type === "tab-attention") {
        setAttention(event.tabId);
      } else if (event.type === "open-panel") {
        const panel = usePanelStore.getState();
        const wantsFullscreen = event.mode === "overlay";
        if (wantsFullscreen || selectAnyObstructingOverlayOpen()) {
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
    setUsageLoginConfirmation,
    clearUsageLoginConfirmation,
    setUsageLoginDeviceCode,
    clearUsageLoginDeviceCode,
  ]);
}
