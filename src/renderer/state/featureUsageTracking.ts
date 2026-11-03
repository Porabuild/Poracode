import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { recordFeatureSignal } from "@/renderer/state/featureUsageStore";

/**
 * Record generic "the user opened this" signals for feature discovery:
 * Settings sections, app views, and right-panel tabs. Commands record
 * themselves where they are dispatched. Returns an uninstaller.
 */
export function installFeatureUsageTracking(): () => void {
  const unsubscribePanel = usePanelStore.subscribe((state, previous) => {
    // `activeSettingsSection` is the page on screen; `settingsSection` is only a
    // one-shot navigation request the overlay clears after applying it.
    const settingsVisible = state.settingsOpen || state.mobileUtilityPage === "settings";
    const wasVisible = previous.settingsOpen || previous.mobileUtilityPage === "settings";
    const section = state.activeSettingsSection;
    if (settingsVisible && section && (section !== previous.activeSettingsSection || !wasVisible)) {
      recordFeatureSignal(`settings:${section}`);
    }
    if (state.rightPanelTab !== previous.rightPanelTab) {
      recordFeatureSignal(`panel:${state.rightPanelTab}`);
    }
    if (state.browserPanelOpen && !previous.browserPanelOpen) recordFeatureSignal("panel:browser");
    if (state.usagePanelOpen && !previous.usagePanelOpen) recordFeatureSignal("panel:usage");
  });
  const unsubscribeApp = useAppStore.subscribe((state, previous) => {
    if (state.view.kind !== previous.view.kind) recordFeatureSignal(`view:${state.view.kind}`);
  });
  return () => {
    unsubscribePanel();
    unsubscribeApp();
  };
}
