import { FolderPlus, Globe, Search } from "lucide-react";
import { Button, Dropdown, Label, Tooltip } from "@heroui/react";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  type ThreadSortMode,
  sortModeOrder,
  sortModeIcon,
  sortModeLabel,
} from "@/renderer/views/MainView/parts/Sidebar/parts/sortMode";
import { CreateProjectMenu } from "@/renderer/views/MainView/parts/CreateProject/CreateProjectMenu";

export function SidebarHeaderControls() {
  const threadSortMode = usePanelStore((s) => s.threadSortMode);
  const browserPanelOpen = usePanelStore((s) => s.browserPanelOpen);
  const rightPanelTab = usePanelStore((s) => s.rightPanelTab);
  const browserVisible = browserPanelOpen && rightPanelTab === "browser";

  return (
    <div className="lightcode-overlay-header__controls flex items-center gap-1.5">
      <Tooltip delay={150}>
        <Tooltip.Trigger>
          <Button
            isIconOnly
            aria-label="Search"
            size="sm"
            variant="ghost"
            className="size-6 min-w-0 text-muted hover:text-foreground"
            onPress={() => usePanelStore.getState().openThreadSearch()}
          >
            <Search className="size-3.5" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content placement="bottom">Search</Tooltip.Content>
      </Tooltip>
      <CreateProjectMenu>
        <Button
          isIconOnly
          aria-label="Add project"
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
          aria-label="Sort threads"
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
            aria-label="Thread sort order"
            selectionMode="single"
            selectedKeys={[threadSortMode]}
            onAction={(key) => {
              usePanelStore.getState().setThreadSortMode(key as ThreadSortMode);
            }}
          >
            {sortModeOrder.map((mode) => {
              const Icon = sortModeIcon[mode];
              return (
                <Dropdown.Item key={mode} id={mode} textValue={sortModeLabel[mode]}>
                  <Icon className="size-4 shrink-0 text-muted" />
                  <Label>{sortModeLabel[mode]}</Label>
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
            aria-label={browserVisible ? "Hide browser" : "Open browser"}
            size="sm"
            variant="ghost"
            className="size-6 min-w-0 text-muted hover:text-foreground"
            onPress={() => {
              const store = usePanelStore.getState();
              if (store.browserPanelOpen && store.rightPanelTab === "browser") {
                store.setBrowserPanelOpen(false);
              } else {
                store.setBrowserPanelOpen(true);
                store.setRightPanelTab("browser");
              }
            }}
          >
            <Globe className="size-3.5" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content placement="bottom">Browser</Tooltip.Content>
      </Tooltip>
    </div>
  );
}
