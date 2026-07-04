import { useState } from "react";
import { Globe, Paperclip, Plus } from "lucide-react";
import { Label, ListBox, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";

export function ComposerAddMenu(props: {
  browserMcpEnabled: boolean;
  showFileOption?: boolean;
  showBrowserOption: boolean;
  onPickFiles: () => void;
  onToggleBrowserMcp: (next: boolean) => void;
}) {
  const {
    browserMcpEnabled,
    showFileOption = true,
    showBrowserOption,
    onPickFiles,
    onToggleBrowserMcp,
  } = props;
  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);

  if (!showFileOption && !showBrowserOption) return null;

  const handleSelect = (id: string) => {
    setIsOpen(false);
    if (id === "file") {
      onPickFiles();
      return;
    }
    if (id === "browser") {
      onToggleBrowserMcp(!browserMcpEnabled);
    }
  };

  const button = (
    <Button
      isIconOnly
      aria-label={t`Add attachment or capability`}
      className="lightcode-composer-menu min-w-9 px-2"
      size="sm"
      variant="ghost"
      {...(mobile ? { onPress: () => setIsOpen(true) } : {})}
    >
      <Plus className="size-4" />
    </Button>
  );

  const mobileList = (
    <div className="m-sheet-list">
      {showFileOption ? (
        <button type="button" className="m-sheet-action" onClick={() => handleSelect("file")}>
          <Paperclip className="size-4 text-muted" />
          <span className="flex-1 truncate">
            <Trans>File</Trans>
          </span>
          <span className="shrink-0 text-xs text-muted">
            <Trans>Attach</Trans>
          </span>
        </button>
      ) : null}
      {showBrowserOption ? (
        <button type="button" className="m-sheet-action" onClick={() => handleSelect("browser")}>
          <Globe className="size-4 text-muted" />
          <span className="flex-1 truncate">
            <Trans>Browser</Trans>
          </span>
          <span className="shrink-0 text-xs text-muted">
            {browserMcpEnabled ? t`Disable` : t`Enable`}
          </span>
        </button>
      ) : null}
    </div>
  );

  return (
    <ResponsiveMenuSurface
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      label={t`Add to composer`}
      trigger={
        mobile ? (
          button
        ) : (
          <Tooltip delay={300}>
            {button}
            <Tooltip.Content placement="top">
              <Trans>Add</Trans>
            </Tooltip.Content>
          </Tooltip>
        )
      }
      placement="top"
      contentClassName="p-0"
      dialogClassName="overflow-hidden"
    >
      {mobile ? (
        mobileList
      ) : (
        <ListBox
          aria-label={t`Add to composer`}
          className="lightcode-menu max-h-60 overflow-y-auto"
          selectionMode="none"
          onAction={(key) => handleSelect(String(key))}
        >
          {showFileOption ? (
            <ListBox.Item id="file" textValue={t`File`} className="focus-visible:outline-none">
              <Paperclip className="size-4 text-muted" />
              <Label className="flex-1 truncate">
                <Trans>File</Trans>
              </Label>
              <span className="ms-auto truncate text-xs text-muted">
                <Trans>Attach</Trans>
              </span>
            </ListBox.Item>
          ) : null}
          {showBrowserOption ? (
            <ListBox.Item
              id="browser"
              textValue={t`Browser`}
              className="focus-visible:outline-none"
            >
              <Globe className="size-4 text-muted" />
              <Label className="flex-1 truncate">
                <Trans>Browser</Trans>
              </Label>
              <span className="ms-auto truncate text-xs text-muted">
                {browserMcpEnabled ? t`Disable` : t`Enable`}
              </span>
            </ListBox.Item>
          ) : null}
        </ListBox>
      )}
    </ResponsiveMenuSurface>
  );
}
