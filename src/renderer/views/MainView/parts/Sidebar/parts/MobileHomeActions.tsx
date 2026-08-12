import { useState } from "react";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  ChartNoAxesColumn,
  Ellipsis,
  FolderOpen,
  Globe,
  NotebookPen,
  Plug,
  Search,
  Server,
  Settings2,
} from "lucide-react";
import {
  openNotesPanel,
  openPortsPanel,
  openSettings,
  openUsagePanel,
  toggleBrowserPanel,
} from "@/renderer/actions/panelActions";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { usePanelStore } from "@/renderer/state/panelStore";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import {
  selectBrowserBridgeServer,
  selectBrowserPanelAvailable,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { MobileRemoteProjectsSheet } from "@/renderer/views/SettingsOverlay/parts/MobileRemoteProjectsSheet";
import { useSidebarShortcuts } from "./sidebarShortcuts";

export function MobileHomeActions() {
  const { t } = useLingui();
  const [moreOpen, setMoreOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const shortcuts = useSidebarShortcuts();
  const browserPanelAvailable = useRemoteServersStore(selectBrowserPanelAvailable);
  const projectServer = useRemoteServersStore(
    (state) => selectBrowserBridgeServer(state) ?? state.servers[0],
  );
  const projectRuntime = useRemoteServersStore((state) =>
    projectServer ? state.runtime[projectServer.desktopId] : undefined,
  );
  const lastKnownProjects = useRemoteServersStore((state) =>
    projectServer ? state.lastKnownProjects[projectServer.desktopId] : undefined,
  );
  const remoteToolsAvailable = isBrowserClientRuntime();
  const remoteToolsDisabled = remoteToolsAvailable && projectRuntime?.status !== "online";

  const run = (action: () => void) => {
    setMoreOpen(false);
    action();
  };

  return (
    <>
      <div className="m-home-compose-actions">
        <Button
          isIconOnly
          aria-label={t`Search`}
          className="m-home-compose-action"
          variant="ghost"
          onPress={() => usePanelStore.getState().openThreadSearch()}
        >
          <Search className="size-5" />
        </Button>
        <Button
          isIconOnly
          aria-label={t`More`}
          className="m-home-compose-action"
          variant="ghost"
          onPress={() => setMoreOpen(true)}
        >
          <Ellipsis className="size-5" />
        </Button>
      </div>

      {moreOpen ? (
        <BottomSheet label={t`More`} onClose={() => setMoreOpen(false)}>
          <div className="m-sheet-head">
            <span>{t`More`}</span>
          </div>
          <div className="m-sheet-list">
            {remoteToolsAvailable ? (
              <SidebarButton
                icon={<ChartNoAxesColumn className="size-4" />}
                label={t`Usage`}
                isDisabled={remoteToolsDisabled}
                onPress={() => run(openUsagePanel)}
              />
            ) : null}
            <SidebarButton
              icon={<Server className="size-4" />}
              label={t`Connections`}
              onPress={() =>
                run(() => {
                  usePanelStore.getState().openSettingsSection("remoteServers");
                })
              }
            />
            {remoteToolsAvailable && projectServer ? (
              <SidebarButton
                icon={<FolderOpen className="size-4" />}
                label={t`Projects`}
                onPress={() => run(() => setProjectsOpen(true))}
              />
            ) : null}
            {remoteToolsAvailable && browserPanelAvailable ? (
              <SidebarButton
                icon={<Globe className="size-4" />}
                label={t`Browser`}
                onPress={() => run(toggleBrowserPanel)}
              />
            ) : null}
            {remoteToolsAvailable ? (
              <SidebarButton
                icon={<Plug className="size-4" />}
                label={t`Ports`}
                isDisabled={remoteToolsDisabled}
                onPress={() => run(openPortsPanel)}
              />
            ) : null}
            <SidebarButton
              icon={<NotebookPen className="size-4" />}
              label={t`Notes`}
              isDisabled={remoteToolsDisabled}
              onPress={() => run(openNotesPanel)}
            />
            {shortcuts.map((shortcut) => (
              <SidebarButton
                key={shortcut.id}
                icon={shortcut.icon}
                label={shortcut.label}
                isActive={shortcut.isActive}
                isDisabled={remoteToolsDisabled}
                onPress={() => run(shortcut.onPress)}
              />
            ))}
            <SidebarButton
              icon={<Settings2 className="size-4" />}
              label={t`Settings`}
              onPress={() =>
                run(() => {
                  openSettings();
                })
              }
            />
          </div>
        </BottomSheet>
      ) : null}

      {projectsOpen && projectServer ? (
        <MobileRemoteProjectsSheet
          server={projectServer}
          projects={projectRuntime?.projects ?? lastKnownProjects ?? []}
          isOnline={projectRuntime?.status === "online"}
          onClose={() => setProjectsOpen(false)}
        />
      ) : null}
    </>
  );
}
