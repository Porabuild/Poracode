import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  ChartNoAxesColumn,
  CircleUserRound,
  Ellipsis,
  FolderOpen,
  Globe,
  NotebookPen,
  Plug,
  Search,
  Server,
  Settings2,
} from "lucide-react";
import { closeAllPanels, openSettings } from "@/renderer/actions/panelActions";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import { usePanelStore, type MobileUtilityPage } from "@/renderer/state/panelStore";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import {
  selectBrowserBridgeServer,
  selectBrowserPanelAvailable,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { useSidebarShortcuts } from "./sidebarShortcuts";

const SHEET_EXIT_MS = 200;

export function MobileHomeActions() {
  const { t } = useLingui();
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreClosing, setMoreClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationFrame = useRef<number | null>(null);
  const shortcuts = useSidebarShortcuts();
  const browserPanelAvailable = useRemoteServersStore(selectBrowserPanelAvailable);
  const projectServer = useRemoteServersStore(
    (state) => selectBrowserBridgeServer(state) ?? state.servers[0],
  );
  const remoteToolsAvailable = isBrowserClientRuntime();
  // Navigation stays available while a paired server exists. Individual pages
  // own their live/offline affordances; requiring the transient runtime status
  // to be exactly `online` made every destination flash disabled while the
  // connection refreshed even though its projects were already available.
  const remoteToolsDisabled = remoteToolsAvailable && !projectServer;

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
      if (navigationFrame.current !== null) cancelAnimationFrame(navigationFrame.current);
    },
    [],
  );

  const openMore = () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = null;
    setMoreClosing(false);
    setMoreOpen(true);
  };

  const closeMore = (action?: () => void) => {
    if (exitTimer.current) return;
    setMoreClosing(true);
    exitTimer.current = setTimeout(() => {
      exitTimer.current = null;
      setMoreClosing(false);
      setMoreOpen(false);
      if (action) {
        // Let React unmount the modal and release its focus scope before the
        // destination hides the canonical home sidebar.
        navigationFrame.current = requestAnimationFrame(() => {
          navigationFrame.current = null;
          action();
        });
      }
    }, SHEET_EXIT_MS);
  };

  const run = (action: () => void) => closeMore(action);

  const openPage = (page: MobileUtilityPage) =>
    run(() => {
      closeAllPanels();
      usePanelStore.getState().openMobileUtilityPage(page);
    });

  return (
    <>
      <div className="m-home-compose-actions">
        <MobileCircleButton
          aria-label={t`Search`}
          onPointerDown={() => usePanelStore.getState().openThreadSearch()}
          onPress={() => usePanelStore.getState().openThreadSearch()}
        >
          <Search className="size-5" />
        </MobileCircleButton>
        <MobileCircleButton aria-label={t`More`} onPointerDown={openMore} onPress={openMore}>
          <Ellipsis className="size-5" />
        </MobileCircleButton>
      </div>

      {moreOpen ? (
        <BottomSheet label={t`More`} closing={moreClosing} onClose={() => closeMore()}>
          <div className="m-sheet-scroll">
            <div className="m-sheet-head">
              <span>{t`More`}</span>
            </div>
            <div className="m-sheet-list">
              <SidebarButton
                icon={<CircleUserRound className="size-4" />}
                label={t`Profile`}
                isDisabled={remoteToolsDisabled}
                onPress={() => openPage("profile")}
              />
              {remoteToolsAvailable ? (
                <SidebarButton
                  icon={<ChartNoAxesColumn className="size-4" />}
                  label={t`Usage`}
                  isDisabled={remoteToolsDisabled}
                  onPress={() => openPage("usage")}
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
                  onPress={() => openPage("projects")}
                />
              ) : null}
              {remoteToolsAvailable && browserPanelAvailable ? (
                <SidebarButton
                  icon={<Globe className="size-4" />}
                  label={t`Browser`}
                  onPress={() => openPage("browser")}
                />
              ) : null}
              {remoteToolsAvailable ? (
                <SidebarButton
                  icon={<Plug className="size-4" />}
                  label={t`Ports`}
                  isDisabled={remoteToolsDisabled}
                  onPress={() => openPage("ports")}
                />
              ) : null}
              <SidebarButton
                icon={<NotebookPen className="size-4" />}
                label={t`Notes`}
                isDisabled={remoteToolsDisabled}
                onPress={() => openPage("notes")}
              />
              {shortcuts.map((shortcut) => (
                <SidebarButton
                  key={shortcut.id}
                  icon={shortcut.icon}
                  label={shortcut.label}
                  isActive={shortcut.isActive}
                  isDisabled={remoteToolsDisabled}
                  onPress={() => {
                    if (shortcut.id === "pullRequests" || shortcut.id === "schedules") {
                      openPage(shortcut.id);
                      return;
                    }
                    run(shortcut.onPress);
                  }}
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
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}
