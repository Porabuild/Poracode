import { useEffect, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Copy, Ellipsis, ExternalLink, Globe, Loader2, Network, Plug, Unplug } from "lucide-react";
import type { LocalPortInfo } from "@/shared/ipc";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { hasClientCapability } from "@/renderer/clientRuntime";
import { ConfirmDialog } from "@/renderer/components/common/ConfirmDialog";
import {
  ContextMenuSurface,
  type ContextMenuEntry,
} from "@/renderer/components/common/ContextMenu";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { panelHeaderIconButtonClass } from "@/renderer/components/layout/sidebarChrome";
import { usePortsPanelChromeStore } from "./portsPanelStore";

export function LocalPortsPanel() {
  const { t } = useLingui();
  const [ports, setPorts] = useState<LocalPortInfo[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ port: LocalPortInfo; x: number; y: number } | null>(null);
  const [confirmPort, setConfirmPort] = useState<LocalPortInfo | null>(null);
  const [closing, setClosing] = useState(false);
  const refreshVersion = usePortsPanelChromeStore((state) => state.refreshVersion);
  const loading = usePortsPanelChromeStore((state) => state.loading);
  const canOpenInApp = hasClientCapability("nativeBrowserWebContents");

  useEffect(() => {
    let active = true;
    const chrome = usePortsPanelChromeStore.getState();
    const isCurrent = () =>
      active && usePortsPanelChromeStore.getState().refreshVersion === refreshVersion;
    chrome.setLoading(true);
    void readBridge()
      .listLocalPorts()
      .then((result) => {
        if (isCurrent()) {
          setNotice(null);
          setPorts(result.ports);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent()) setNotice(friendlyError(error));
      })
      .finally(() => {
        if (isCurrent()) chrome.setLoading(false);
      });
    return () => {
      active = false;
      chrome.setLoading(false);
    };
  }, [refreshVersion]);

  function openPort(port: LocalPortInfo, system: boolean): void {
    if (!port.url) return;
    const bridge = readBridge();
    void (
      system || !canOpenInApp
        ? bridge.openExternalNative(port.url)
        : bridge.browserCreateTab({ url: port.url, activate: true, reveal: true })
    ).catch((error: unknown) => toast.danger(friendlyError(error)));
  }

  function closePort(): void {
    if (!confirmPort?.pid || !confirmPort.processStartedAt || closing) return;
    setClosing(true);
    void readBridge()
      .closeLocalPort({
        port: confirmPort.port,
        address: confirmPort.address,
        pid: confirmPort.pid,
        processStartedAt: confirmPort.processStartedAt,
      })
      .then((result) => {
        if (!result.closed)
          toast.warning(t`Could not close this port. Refresh the list and try again.`);
        setConfirmPort(null);
        usePortsPanelChromeStore.getState().requestRefresh();
      })
      .catch((error: unknown) => toast.danger(friendlyError(error)))
      .finally(() => setClosing(false));
  }

  const items: ContextMenuEntry[] = [
    ...(canOpenInApp
      ? [
          {
            id: "open",
            label: t`Open in Poracode browser`,
            icon: <Globe className="size-4" />,
            isDisabled: !menu?.port.url,
          },
        ]
      : []),
    {
      id: "system",
      label: t`Open in system browser`,
      icon: <ExternalLink className="size-4" />,
      isDisabled: !menu?.port.url,
    },
    {
      id: "copy",
      label: t`Copy link`,
      icon: <Copy className="size-4" />,
      isDisabled: !menu?.port.url,
    },
    { id: "address", label: t`Copy address`, icon: <Network className="size-4" /> },
    { type: "separator" },
    {
      id: "close",
      label: t`Close port`,
      icon: <Unplug className="size-4" />,
      variant: "danger",
      isDisabled: !menu?.port.canClose || closing,
    },
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-1 overflow-y-auto p-2">
      <p className="px-2 pb-1 text-xs text-muted">
        <Trans>Listening ports on this computer.</Trans>
      </p>
      {notice ? (
        <div className="m-empty" role="alert">
          <strong>
            <Trans>Can't load ports</Trans>
          </strong>
          <p>{notice}</p>
          <Button
            size="sm"
            variant="secondary"
            isDisabled={loading}
            onPress={() => usePortsPanelChromeStore.getState().requestRefresh()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : ports === null ? (
        <div className="m-empty">
          <Loader2 className="size-5 animate-spin" />
          <strong>
            <Trans>Looking for listening ports…</Trans>
          </strong>
        </div>
      ) : ports.length === 0 ? (
        <div className="m-empty">
          <Plug className="size-5" />
          <strong>
            <Trans>No listening ports</Trans>
          </strong>
        </div>
      ) : (
        ports.map((port) => {
          const address = `${port.address.includes(":") ? `[${port.address}]` : port.address}:${port.port}`;
          const owner = port.processName ?? t`Unknown process`;
          return (
            <SidebarButton
              key={`${address}:${port.pid}`}
              className="poracode-sidebar-thread-row"
              size="xs"
              density="compact"
              icon={<Plug className="size-3.5 shrink-0" />}
              label={
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{address}</span>
                  <span className="truncate text-[11px] text-muted">
                    {owner}
                    {port.pid ? ` · ${port.pid}` : ""}
                  </span>
                </span>
              }
              onPress={() => openPort(port, false)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ port, x: event.clientX, y: event.clientY });
              }}
              suffix={
                <button
                  type="button"
                  className={panelHeaderIconButtonClass}
                  aria-label={t`Actions for port ${port.port}`}
                  aria-haspopup="menu"
                  onClick={(event) => {
                    event.stopPropagation();
                    const rect = event.currentTarget.getBoundingClientRect();
                    setMenu({ port, x: rect.right, y: rect.bottom });
                  }}
                >
                  <Ellipsis className="size-3.5" />
                </button>
              }
            />
          );
        })
      )}
      <ContextMenuSurface
        position={menu}
        items={items}
        onClose={() => setMenu(null)}
        onAction={(key) => {
          if (!menu) return;
          const port = menu.port;
          if (key === "open" || key === "system") openPort(port, key === "system");
          if (key === "close") setConfirmPort(port);
          if (key === "copy" || key === "address") {
            const address = `${port.address.includes(":") ? `[${port.address}]` : port.address}:${port.port}`;
            const text = key === "copy" ? port.url : address;
            if (!text) return;
            void navigator.clipboard
              .writeText(text)
              .then(() => toast.success(t`Copied`))
              .catch((error: unknown) => toast.danger(friendlyError(error)));
          }
        }}
      />
      {confirmPort ? (
        <ConfirmDialog
          isOpen
          title={t`Close port ${confirmPort.port}?`}
          body={t`This stops ${confirmPort.processName ?? confirmPort.pid} (PID ${confirmPort.pid}) and closes all ports used by that process.`}
          confirmLabel={t`Close port`}
          isPending={closing}
          onConfirm={closePort}
          onClose={() => {
            if (!closing) setConfirmPort(null);
          }}
        />
      ) : null}
    </div>
  );
}
