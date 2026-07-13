import { FolderPlus, Globe, Search } from "lucide-react";
import { Button, Dropdown, Label, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { usePanelStore } from "@/renderer/state/panelStore";
import { toggleBrowserPanel } from "@/renderer/actions/panelActions";
import {
  type ThreadSortMode,
  sortModeOrder,
  sortModeIcon,
  sortModeLabel,
} from "@/renderer/views/MainView/parts/Sidebar/parts/sortMode";
import { CreateProjectMenu } from "@/renderer/views/MainView/parts/CreateProject/CreateProjectMenu";

export function SidebarHeaderControls() {
  const { t } = useLingui();
  const threadSortMode = usePanelStore((s) => s.threadSortMode);
  const browserPanelOpen = usePanelStore((s) => s.browserPanelOpen);
  const rightPanelTab = usePanelStore((s) => s.rightPanelTab);
  const browserVisible = browserPanelOpen && rightPanelTab === "browser";

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
          aria-label={t`Sort threads`}
          size="sm"
          variant="ghost"
          className="size-6 min-w-0 text-muted hover:text-foreground"
        >
          {(() => {
            const Icon = sortModeIcon[threadSortMode];
            return <Icon className="size-3.5" />;
          })()}
        </Button>
        <Dropdown.Popover>
          <Dropdown.Menu
            aria-label={t`Thread sort order`}
            selectionMode="single"
            selectedKeys={[threadSortMode]}
            onAction={(key) => {
              usePanelStore.getState().setThreadSortMode(key as ThreadSortMode);
            }}
          >
            {sortModeOrder.map((mode) => {
              const Icon = sortModeIcon[mode];
              const label = t(sortModeLabel[mode]);
              return (
                <Dropdown.Item key={mode} id={mode} textValue={label}>
                  <Icon className="size-4 shrink-0 text-muted" />
                  <Label>{label}</Label>
                </Dropdown.Item>
              );
            })}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
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
    </div>
  );
}
