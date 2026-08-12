import { FolderPlus, Globe, Search, WifiOff } from "lucide-react";
import { Button, Dropdown, Label, Separator, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useIsPanelTabVisible } from "@/renderer/state/panelDockSelectors";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  selectBrowserPanelAvailable,
  selectBrowserBridgeServer,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { toggleBrowserPanel } from "@/renderer/actions/panelActions";
import {
  type ThreadSortMode,
  listLayoutIcon,
  listLayoutLabel,
  listLayoutOrder,
  sortModeOrder,
  sortModeIcon,
  sortModeLabel,
} from "@/renderer/views/MainView/parts/Sidebar/parts/sortMode";
import { CreateProjectMenu } from "@/renderer/views/MainView/parts/CreateProject/CreateProjectMenu";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";

export function SidebarHeaderControls() {
  const { t } = useLingui();
  const compactLayout = useCompactLayout();
  const threadSortMode = usePanelStore((s) => s.threadSortMode);
  const threadListLayout = usePanelStore((s) => s.threadListLayout);
  const browserPanelOpen = usePanelStore((s) => s.browserPanelOpen);
  const browserOnScreen = useIsPanelTabVisible("browser");
  const browserVisible = browserPanelOpen && browserOnScreen;
  const browserPanelAvailable = useRemoteServersStore(selectBrowserPanelAvailable);
  const selectedBrowserServer = useRemoteServersStore(selectBrowserBridgeServer);

  if (compactLayout) {
    const connected = !isBrowserClientRuntime() || selectedBrowserServer !== undefined;
    if (connected) return null;
    return (
      <div className="poracode-mobile-home-status ml-auto flex items-center">
        <Button
          isIconOnly
          aria-label={t`Remote Environments`}
          size="sm"
          variant="ghost"
          className="size-9 min-w-0 text-muted"
          onPress={() => {
            usePanelStore.getState().openSettingsSection("remoteServers");
          }}
        >
          <WifiOff className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="poracode-overlay-header__controls flex items-center gap-1.5">
      <Tooltip delay={150}>
        <Tooltip.Trigger>
          <Button
            isIconOnly
            aria-label={t`Search`}
            size="sm"
            variant="ghost"
            className="size-6 min-w-0 text-muted hover:text-foreground"
            onPress={() => usePanelStore.getState().openThreadSearch()}
          >
            <Search className="size-3.5" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content placement="bottom">
          <Trans>Search</Trans>
        </Tooltip.Content>
      </Tooltip>
      <CreateProjectMenu>
        <Button
          isIconOnly
          aria-label={t`Add project`}
          size="sm"
          variant="ghost"
          className="size-6 min-w-0 text-muted hover:text-foreground"
        >
          <FolderPlus className="size-3.5" />
        </Button>
      </CreateProjectMenu>
      <Dropdown>
        <Button
          isIconOnly
          aria-label={t`List options`}
          size="sm"
          variant="ghost"
          className="size-6 min-w-0 text-muted hover:text-foreground"
        >
          {(() => {
            const Icon =
              threadListLayout === "flat" ? listLayoutIcon.flat : sortModeIcon[threadSortMode];
            return <Icon className="size-3.5" />;
          })()}
        </Button>
        <Dropdown.Popover>
          <Dropdown.Menu
            aria-label={t`Thread list options`}
            selectionMode="multiple"
            selectedKeys={[threadSortMode, threadListLayout]}
            onAction={(key) => {
              const state = usePanelStore.getState();
              if (key === "grouped" || key === "flat") state.setThreadListLayout(key);
              else state.setThreadSortMode(key as ThreadSortMode);
            }}
          >
            {sortModeOrder.map((mode) => {
              const Icon = sortModeIcon[mode];
              const label = t(sortModeLabel[mode]);
              return (
                <Dropdown.Item key={mode} id={mode} textValue={label}>
                  <Icon className="size-4 shrink-0 text-muted" />
                  <Label>{label}</Label>
                  <Dropdown.ItemIndicator />
                </Dropdown.Item>
              );
            })}
            <Separator />
            {listLayoutOrder.map((layout) => {
              const Icon = listLayoutIcon[layout];
              const label = t(listLayoutLabel[layout]);
              return (
                <Dropdown.Item key={layout} id={layout} textValue={label}>
                  <Icon className="size-4 shrink-0 text-muted" />
                  <Label>{label}</Label>
                  <Dropdown.ItemIndicator />
                </Dropdown.Item>
              );
            })}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {browserPanelAvailable ? (
        <Tooltip delay={150}>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              aria-label={browserVisible ? t`Hide browser` : t`Open browser`}
              size="sm"
              variant="ghost"
              className="size-6 min-w-0 text-muted hover:text-foreground"
              onPress={toggleBrowserPanel}
            >
              <Globe className="size-3.5" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom">
            <Trans>Browser</Trans>
          </Tooltip.Content>
        </Tooltip>
      ) : null}
    </div>
  );
}
