import { Loader2, Plus, RefreshCw } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { panelHeaderIconButtonClass } from "@/renderer/components/layout/sidebarChrome";
import {
  selectBrowserBridgeServer,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { usePortsPanelChromeStore } from "../portsPanelStore";

/**
 * Ports-tab actions rendered in the shared right-panel header so the panel
 * body does not grow a second toolbar.
 */
export function PortsPanelHeaderActions(props: { dragControlClass: string }) {
  const { t } = useLingui();
  const server = useRemoteServersStore(
    (state) => selectBrowserBridgeServer(state) ?? state.servers[0],
  );
  const loading = usePortsPanelChromeStore((state) => state.loading);
  const requestRefresh = usePortsPanelChromeStore((state) => state.requestRefresh);
  const requestManualForward = usePortsPanelChromeStore((state) => state.requestManualForward);
  const canUse = server?.scopes.includes("ports:forward") ?? false;
  const buttonClass = `${props.dragControlClass} ${panelHeaderIconButtonClass}`;

  return (
    <>
      {canUse ? (
        <button
          type="button"
          className={buttonClass}
          title={t`Forward a port`}
          onClick={requestManualForward}
        >
          <Plus className="size-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        className={buttonClass}
        title={t`Refresh`}
        disabled={!canUse || loading}
        onClick={requestRefresh}
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
      </button>
    </>
  );
}
