import { useState } from "react";
import { Globe, Monitor, Paperclip, Plus } from "lucide-react";
import { Label, ListBox, Popover, Tooltip } from "@heroui/react";
import { Button } from "@/renderer/components/common";

export function ComposerAddMenu(props: {
  browserMcpEnabled: boolean;
  computerUseEnabled: boolean;
  showBrowserOption: boolean;
  showComputerUseOption: boolean;
  onPickFiles: () => void;
  onToggleBrowserMcp: (next: boolean) => void;
  onToggleComputerUse: (next: boolean) => void;
}) {
  const {
    browserMcpEnabled,
    computerUseEnabled,
    showBrowserOption,
    showComputerUseOption,
    onPickFiles,
    onToggleBrowserMcp,
    onToggleComputerUse,
  } = props;
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (id: string) => {
    setIsOpen(false);
    if (id === "file") {
      onPickFiles();
      return;
    }
    if (id === "browser") {
      onToggleBrowserMcp(!browserMcpEnabled);
      return;
    }
    if (id === "computer-use") {
      onToggleComputerUse(!computerUseEnabled);
    }
  };

  const button = (
    <Button
      isIconOnly
      aria-label="Add attachment or capability"
      className="lightcode-composer-menu min-w-9 px-2"
      size="sm"
      variant="ghost"
    >
      <Plus className="size-4" />
    </Button>
  );

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <Tooltip delay={300}>
          {button}
          <Tooltip.Content placement="top">Add</Tooltip.Content>
        </Tooltip>
      </Popover.Trigger>
      {isOpen ? (
        <Popover.Content placement="top" className="p-0">
          <Popover.Dialog className="overflow-hidden">
            <ListBox
              aria-label="Add to composer"
              className="lightcode-menu max-h-60 overflow-y-auto"
              selectionMode="none"
              onAction={(key) => handleSelect(String(key))}
            >
              <ListBox.Item id="file" textValue="File" className="focus-visible:outline-none">
                <Paperclip className="size-4 text-muted" />
                <Label className="flex-1 truncate">File</Label>
                <span className="ms-auto truncate text-xs text-muted">Attach</span>
              </ListBox.Item>
              {showBrowserOption ? (
                <ListBox.Item
                  id="browser"
                  textValue="Browser"
                  className="focus-visible:outline-none"
                >
                  <Globe className="size-4 text-muted" />
                  <Label className="flex-1 truncate">Browser</Label>
                  <span className="ms-auto truncate text-xs text-muted">
                    {browserMcpEnabled ? "Disable" : "Enable"}
                  </span>
                </ListBox.Item>
              ) : null}
              {showComputerUseOption ? (
                <ListBox.Item
                  id="computer-use"
                  textValue="Computer Use"
                  className="focus-visible:outline-none"
                >
                  <Monitor className="size-4 text-muted" />
                  <Label className="flex-1 truncate">Computer Use</Label>
                  <span className="ms-auto truncate text-xs text-muted">
                    {computerUseEnabled ? "Disable" : "Enable"}
                  </span>
                </ListBox.Item>
              ) : null}
            </ListBox>
          </Popover.Dialog>
        </Popover.Content>
      ) : null}
    </Popover>
  );
}
