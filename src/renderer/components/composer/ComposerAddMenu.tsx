import { useState } from "react";
import { Monitor, Paperclip, Plus } from "lucide-react";
import type { Selection } from "@heroui/react";
import { Header, Label, ListBox, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import type { ComposerMcpServerDescriptor } from "./composerMcpServers";

export type ComposerMcpMenuItem = {
  descriptor: ComposerMcpServerDescriptor;
  enabled: boolean;
  visible: boolean;
  onToggle: (next: boolean) => void;
};

/**
 * Presentational switch used inside the MCP rows. The desktop rows are a
 * multi-selection listbox, so the accessible checked state comes from
 * selection; this visual is aria-hidden.
 */
function MenuSwitch(props: { checked: boolean }) {
  const { checked } = props;
  return (
    <span
      aria-hidden
      className={`relative ms-auto h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? "bg-success" : "bg-surface-tertiary"
      }`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </span>
  );
}

export function ComposerAddMenu(props: {
  mcpServers: readonly ComposerMcpMenuItem[];
  showFileOption?: boolean;
  onPickFiles: () => void;
  /**
   * Computer Use is a launch-time capability handled separately from the MCP
   * registry (it gates on project location + agent kind, not the shared MCP
   * scope). Omitted — or with `visible: false` — the row is not offered.
   */
  computerUse?: {
    enabled: boolean;
    visible: boolean;
    onToggle: (next: boolean) => void;
  };
}) {
  const { mcpServers, showFileOption = true, onPickFiles, computerUse } = props;
  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);
  const visibleMcpServers = mcpServers.filter((server) => server.visible);

  const enabledKeys = new Set(
    visibleMcpServers.filter((server) => server.enabled).map((server) => server.descriptor.id),
  );

  if (!showFileOption && visibleMcpServers.length === 0 && computerUse?.visible !== true)
    return null;

  const handlePickFiles = () => {
    setIsOpen(false);
    onPickFiles();
  };

  // Multiple-selection menu: diff the new selection against current state to
  // fire only the single toggle that changed.
  const handleMcpSelection = (keys: Selection) => {
    for (const server of visibleMcpServers) {
      const next = keys !== "all" && keys.has(server.descriptor.id);
      if (next !== server.enabled) server.onToggle(next);
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
        <button type="button" className="m-sheet-action" onClick={handlePickFiles}>
          <Paperclip className="size-4 text-muted" />
          <span className="flex-1 truncate">
            <Trans>File</Trans>
          </span>
          <span className="shrink-0 text-xs text-muted">
            <Trans>Attach</Trans>
          </span>
        </button>
      ) : null}
      {visibleMcpServers.length > 0 ? (
        <>
          <span className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
            <Trans>MCP servers</Trans>
          </span>
          {visibleMcpServers.map((server) => {
            const Icon = server.descriptor.icon;
            const label = t(server.descriptor.label);
            return (
              <button
                key={server.descriptor.id}
                type="button"
                className="m-sheet-action"
                aria-pressed={server.enabled}
                onClick={() => server.onToggle(!server.enabled)}
              >
                <Icon className="size-4 text-muted" />
                <span className="flex-1 truncate">{label}</span>
                <MenuSwitch checked={server.enabled} />
              </button>
            );
          })}
        </>
      ) : null}
      {computerUse?.visible ? (
        <button
          type="button"
          className="m-sheet-action"
          aria-pressed={computerUse.enabled}
          onClick={() => computerUse.onToggle(!computerUse.enabled)}
        >
          <Monitor className="size-4 text-muted" />
          <span className="flex-1 truncate">
            <Trans>Computer Use</Trans>
          </span>
          <MenuSwitch checked={computerUse.enabled} />
        </button>
      ) : null}
    </div>
  );

  const desktopList = (
    <div className="min-w-52">
      {showFileOption ? (
        <ListBox
          aria-label={t`Add to composer`}
          className="lightcode-menu max-h-60 overflow-y-auto"
          selectionMode="none"
          onAction={handlePickFiles}
        >
          <ListBox.Item id="file" textValue={t`File`} className="focus-visible:outline-none">
            <Paperclip className="size-4 text-muted" />
            <Label className="flex-1 truncate">
              <Trans>File</Trans>
            </Label>
            <span className="ms-auto truncate text-xs text-muted">
              <Trans>Attach</Trans>
            </span>
          </ListBox.Item>
        </ListBox>
      ) : null}
      {visibleMcpServers.length > 0 ? (
        <div className={showFileOption ? "mt-1 border-t border-border pt-1" : undefined}>
          <Header className="block px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
            <Trans>MCP servers</Trans>
          </Header>
          <ListBox
            aria-label={t`MCP servers`}
            className="lightcode-menu max-h-60 overflow-y-auto"
            selectionMode="multiple"
            selectedKeys={enabledKeys}
            onSelectionChange={handleMcpSelection}
          >
            {visibleMcpServers.map((server) => {
              const Icon = server.descriptor.icon;
              const label = t(server.descriptor.label);
              return (
                <ListBox.Item
                  key={server.descriptor.id}
                  id={server.descriptor.id}
                  textValue={label}
                  className="focus-visible:outline-none data-[selected=true]:bg-transparent"
                >
                  <Icon className="size-4 text-muted" />
                  <Label className="flex-1 truncate">{label}</Label>
                  <MenuSwitch checked={server.enabled} />
                </ListBox.Item>
              );
            })}
          </ListBox>
        </div>
      ) : null}
      {computerUse?.visible ? (
        <div
          className={
            showFileOption || visibleMcpServers.length > 0
              ? "mt-1 border-t border-border pt-1"
              : undefined
          }
        >
          <ListBox
            aria-label={t`Computer Use`}
            className="lightcode-menu max-h-60 overflow-y-auto"
            selectionMode="none"
            onAction={() => computerUse.onToggle(!computerUse.enabled)}
          >
            <ListBox.Item
              id="computer-use"
              textValue={t`Computer Use`}
              className="focus-visible:outline-none"
            >
              <Monitor className="size-4 text-muted" />
              <Label className="flex-1 truncate">
                <Trans>Computer Use</Trans>
              </Label>
              <MenuSwitch checked={computerUse.enabled} />
            </ListBox.Item>
          </ListBox>
        </div>
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
      {mobile ? mobileList : desktopList}
    </ResponsiveMenuSurface>
  );
}
