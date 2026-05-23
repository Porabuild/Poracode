import { useEffect } from "react";
import { readBridge } from "@/renderer/bridge";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { usePanelStore } from "@/renderer/state/panelStore";

export function useBrowserSync(): void {
  const setState = useBrowserPanelStore((s) => s.setState);
  const upsertTab = useBrowserPanelStore((s) => s.upsertTab);
  const setAttention = useBrowserPanelStore((s) => s.setAttention);
  const setPickerActive = useBrowserPanelStore((s) => s.setPickerActive);

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
        if (event.mode === "overlay") {
          panel.setBrowserOverlayOpen(true);
        } else {
          if (event.mode === "panel") {
            panel.setBrowserOverlayOpen(false);
          }
          panel.openBrowserPanel();
        }
      } else if (event.type === "picker-cancelled") {
        setPickerActive(false);
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
  }, [setState, upsertTab, setAttention, setPickerActive]);
}
