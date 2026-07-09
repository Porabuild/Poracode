import { useState } from "react";
import { ChevronLeft, ChevronRight, Monitor, Paperclip, Plus, Server } from "lucide-react";
import type { Selection } from "@heroui/react";
import { Dropdown, Label, Separator, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { isRemoteSession } from "@/renderer/bridge";
import { Button } from "@/renderer/components/common";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import type { ComposerMcpServerDescriptor } from "./composerMcpServers";

/** Selection id for the Computer Use row inside the MCP submenu. */
const COMPUTER_USE_KEY = "computer-use";

export type ComposerMcpMenuItem = {
  descriptor: ComposerMcpServerDescriptor;
  enabled: boolean;
  visible: boolean;
  onToggle: (next: boolean) => void;
};

/**
 * Presentational switch used inside the MCP rows. The desktop rows are a
 * multi-selection menu, so the accessible checked state comes from selection;
 * this visual is aria-hidden.
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
  // Mobile sheet drill-in: the root list swaps to the MCP list in place.
  const [mobileView, setMobileView] = useState<"root" | "mcp">("root");
  const visibleMcpServers = mcpServers.filter((server) => server.visible);
  const showComputerUse = computerUse?.visible === true;
  const hasMcpMenu = visibleMcpServers.length > 0 || showComputerUse;
  const computerUseSubtitle = isRemoteSession()
    ? t`Controls the paired desktop while the agent clicks or types`
    : t`Takes over the desktop while the agent clicks or types`;

  const enabledMcpCount = visibleMcpServers.filter((server) => server.enabled).length;

  if (!showFileOption && !hasMcpMenu) return null;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    // Reset the drill-in when the sheet closes so it reopens at the root.
    if (!open) setMobileView("root");
  };

  const handlePickFiles = () => {
    setIsOpen(false);
    setMobileView("root");
    onPickFiles();
  };

  // The MCP submenu is a multiple-selection menu (Computer Use included as one
  // of its rows). Diff the new selection against current state to fire only the
  // single toggle that changed, and never close the parent menu on toggle.
  const submenuSelectedKeys = new Set<string>([
    ...visibleMcpServers.filter((server) => server.enabled).map((server) => server.descriptor.id),
    ...(showComputerUse && computerUse.enabled ? [COMPUTER_USE_KEY] : []),
  ]);

  const handleSubmenuSelection = (keys: Selection) => {
    for (const server of visibleMcpServers) {
      const next = keys !== "all" && keys.has(server.descriptor.id);
      if (next !== server.enabled) server.onToggle(next);
    }
    if (showComputerUse) {
      const next = keys !== "all" && keys.has(COMPUTER_USE_KEY);
      if (next !== computerUse.enabled) computerUse.onToggle(next);
    }
  };

  const persistenceCaption = <Trans>Enabled servers stay on for new threads</Trans>;

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

  // ── Mobile: bottom-sheet with a drill-in for the MCP list ──────────────
  const mobileRootList = (
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
      {hasMcpMenu ? (
        <button type="button" className="m-sheet-action" onClick={() => setMobileView("mcp")}>
          <Server className="size-4 text-muted" />
          <span className="flex-1 truncate">
            <Trans>MCP servers</Trans>
          </span>
          {enabledMcpCount > 0 ? (
            <span className="shrink-0 text-xs tabular-nums text-muted">{enabledMcpCount}</span>
          ) : null}
          <ChevronRight className="size-4 shrink-0 text-muted" />
        </button>
      ) : null}
    </div>
  );

  const mobileMcpList = (
    <div className="m-sheet-list">
      <button
        type="button"
        className="m-sheet-action"
        aria-label={t`Back`}
        onClick={() => setMobileView("root")}
      >
        <ChevronLeft className="size-4 text-muted" />
        <span className="flex-1 truncate font-medium">
          <Trans>MCP servers</Trans>
        </span>
      </button>
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
      {showComputerUse ? (
        <button
          type="button"
          className="m-sheet-action"
          aria-pressed={computerUse.enabled}
          onClick={() => computerUse.onToggle(!computerUse.enabled)}
        >
          <Monitor className="size-4 shrink-0 text-muted" />
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <span className="truncate">
              <Trans>Computer Use</Trans>
            </span>
            <span className="text-[11px] leading-snug text-muted">{computerUseSubtitle}</span>
          </span>
          <MenuSwitch checked={computerUse.enabled} />
        </button>
      ) : null}
      <p className="px-2 pt-0.5 text-[11px] leading-snug text-muted">{persistenceCaption}</p>
    </div>
  );

  if (mobile) {
    return (
      <ResponsiveMenuSurface
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        label={t`Add to composer`}
        trigger={button}
        placement="top"
        contentClassName="p-0"
        dialogClassName="overflow-hidden"
      >
        {mobileView === "mcp" && hasMcpMenu ? mobileMcpList : mobileRootList}
      </ResponsiveMenuSurface>
    );
  }

  // ── Desktop: HeroUI dropdown with a real flyout submenu for the MCP list ──
  return (
    <Dropdown>
      <Dropdown.Trigger>
        <Tooltip delay={300}>
          {button}
          <Tooltip.Content placement="top">
            <Trans>Add</Trans>
          </Tooltip.Content>
        </Tooltip>
      </Dropdown.Trigger>
      <Dropdown.Popover placement="top start">
        <Dropdown.Menu
          aria-label={t`Add to composer`}
          selectionMode="none"
          onAction={(key) => {
            if (key === "file") handlePickFiles();
          }}
          className="lightcode-menu min-w-52"
        >
          {showFileOption ? (
            <Dropdown.Item id="file" textValue={t`File`}>
              <Paperclip className="size-4 text-muted" />
              <Label className="flex-1 truncate">
                <Trans>File</Trans>
              </Label>
              <span className="ms-auto truncate text-xs text-muted">
                <Trans>Attach</Trans>
              </span>
            </Dropdown.Item>
          ) : null}
          {showFileOption && hasMcpMenu ? <Separator /> : null}
          {hasMcpMenu ? (
            <Dropdown.SubmenuTrigger>
              <Dropdown.Item id="mcp-servers" textValue={t`MCP servers`}>
                <Server className="size-4 text-muted" />
                <Label className="flex-1 truncate">
                  <Trans>MCP servers</Trans>
                </Label>
                {enabledMcpCount > 0 ? (
                  <span className="text-xs tabular-nums text-muted">{enabledMcpCount}</span>
                ) : null}
                <Dropdown.SubmenuIndicator />
              </Dropdown.Item>
              <Dropdown.Popover>
                <div className="flex flex-col">
                  <Dropdown.Menu
                    aria-label={t`MCP servers`}
                    selectionMode="multiple"
                    selectedKeys={submenuSelectedKeys}
                    onSelectionChange={handleSubmenuSelection}
                    className="lightcode-menu max-h-72 min-w-56 overflow-y-auto"
                  >
                    {visibleMcpServers.map((server) => {
                      const Icon = server.descriptor.icon;
                      const label = t(server.descriptor.label);
                      return (
                        <Dropdown.Item
                          key={server.descriptor.id}
                          id={server.descriptor.id}
                          textValue={label}
                          className="data-[selected=true]:bg-transparent"
                        >
                          <Icon className="size-4 text-muted" />
                          <Label className="flex-1 truncate">{label}</Label>
                          <MenuSwitch checked={server.enabled} />
                        </Dropdown.Item>
                      );
                    })}
                    {showComputerUse ? (
                      <Dropdown.Item
                        id={COMPUTER_USE_KEY}
                        textValue={t`Computer Use`}
                        className="data-[selected=true]:bg-transparent"
                      >
                        <Monitor className="size-4 shrink-0 self-start text-muted" />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <Label className="truncate">
                            <Trans>Computer Use</Trans>
                          </Label>
                          <span className="text-[11px] leading-snug text-muted">
                            {computerUseSubtitle}
                          </span>
                        </div>
                        <MenuSwitch checked={computerUse.enabled} />
                      </Dropdown.Item>
                    ) : null}
                  </Dropdown.Menu>
                  <p className="border-t border-border px-3 py-1.5 text-[11px] leading-snug text-muted">
                    {persistenceCaption}
                  </p>
                </div>
              </Dropdown.Popover>
            </Dropdown.SubmenuTrigger>
          ) : null}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
