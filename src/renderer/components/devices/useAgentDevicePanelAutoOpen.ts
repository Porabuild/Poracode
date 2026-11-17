import { useEffect, useRef } from "react";
import { useFocusedThreadId } from "@/renderer/hooks/uiSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { getThreadMap } from "@/renderer/state/useThread";
import { withThreadDeviceClient } from "./deviceClient";

/**
 * Opens the right-hand Devices panel automatically when the focused thread's
 * agent attaches a device via `open_device`, even if the panel was closed or
 * showing another tab.
 */
export function useAgentDevicePanelAutoOpen(enabled: boolean): void {
  const focusedThreadId = useFocusedThreadId();
  const deviceWorkspaceThreadId = usePanelStore((s) => s.deviceWorkspaceThreadId);
  const devicesPluginEnabled = useSharedSettings(
    (s) => s.installedPlugins?.devices?.enabled !== false,
  );
  const focusedWorking = useAppStore((s) =>
    focusedThreadId ? getThreadMap(s.threads).get(focusedThreadId)?.status === "working" : false,
  );
  const wasWorkingRef = useRef(false);

  useEffect(() => {
    const justFinished = wasWorkingRef.current && !focusedWorking;
    wasWorkingRef.current = focusedWorking;

    if (
      !enabled ||
      !focusedThreadId ||
      deviceWorkspaceThreadId === focusedThreadId ||
      !devicesPluginEnabled
    )
      return;
    if (!focusedWorking && !justFinished) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      try {
        const adopted = await withThreadDeviceClient(focusedThreadId, (client, id) =>
          client.adoptDeviceSession(id),
        );
        if (cancelled || !adopted) return;
        const panel = usePanelStore.getState();
        if (
          panel.deviceWorkspaceThreadId === focusedThreadId ||
          useAppStore.getState().view.kind !== "thread"
        ) {
          await withThreadDeviceClient(focusedThreadId, (client, id) =>
            client.detachDevice(id, adopted.id),
          ).catch(() => undefined);
          return;
        }
        panel.openAdoptedDeviceWorkspace(focusedThreadId, adopted);
      } catch {
        // Older hosts or disconnected threads simply leave the panel closed.
      } finally {
        if (!cancelled && focusedWorking) timer = setTimeout(() => void check(), 2000);
      }
    };

    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, focusedThreadId, deviceWorkspaceThreadId, devicesPluginEnabled, focusedWorking]);
}
