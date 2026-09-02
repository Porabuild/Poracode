import { useState, type ReactNode } from "react";
import {
  Cable,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Monitor,
  Paperclip,
  Plus,
  Server,
} from "lucide-react";
import type { Selection } from "@heroui/react";
import { Dropdown, Label, Separator } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { isRemoteSession } from "@/renderer/bridge";
import { Button } from "@/renderer/components/common/Button";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import {
  InfoHint,
  MenuSwitch,
  readOnlyRowClassName,
  submenuCaptionClassName,
} from "./ComposerAddMenuParts";
import { COMPUTER_USE_MCP_ID } from "./composerMcpServers";
import type { ComposerMcpServerDescriptor } from "./composerMcpServers";
import {
  ComposerMcpServersMobileList,
  ComposerMcpServersSubmenuContent,
  type ComposerCustomMcpItem,
} from "./ComposerMcpServersMenu";

export type { ComposerCustomMcpItem } from "./ComposerMcpServersMenu";

/** Selection id for the Computer Use row inside the Plugins submenu. */
const COMPUTER_USE_KEY = COMPUTER_USE_MCP_ID;

export type ComposerMcpMenuItem = {
  descriptor: ComposerMcpServerDescriptor;
  enabled: boolean;
  visible: boolean;
  onToggle: (next: boolean) => void;
};

/** Stable empty map so an omitted `pluginLabels` prop doesn't churn renders. */
const EMPTY_PLUGIN_LABELS: Readonly<Record<string, string>> = {};

/** Mobile sheet drill-in target: the root list swaps to a sub-list in place. */
type MobileView = "root" | "plugins" | "mcp";

export function ComposerAddMenu(props: {
  /** First-party plugin MCP servers, listed under "Plugins". */
  mcpServers: readonly ComposerMcpMenuItem[];
  /** User-configured servers (global + workspace), listed under "MCP Servers". */
  customMcpServers?: readonly ComposerCustomMcpItem[];
  /**
   * Opens the MCP Servers settings page from the "MCP Servers" submenu. When
   * provided, the submenu is offered even with no server configured so the
   * user can always reach management from the composer.
   */
  onManageMcpServers?: () => void;
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
  experiment?: {
    enabled: boolean;
    disabled: boolean;
    onToggle: (next: boolean) => void;
  };
  /**
   * Display-only mode for an active thread: MCP bindings were fixed when the
   * session launched, so the lists show what this run has without switches
   * being interactive.
   */
  readOnly?: boolean;
  readOnlyCaption?: ReactNode;
  /**
   * Display name per built-in MCP server id for the servers a first-party
   * plugin packages, from `pluginLabelsForMcpServers`. The row then reads the
   * same as the plugin's `@`-mention instead of naming the raw server.
   */
  pluginLabels?: Readonly<Record<string, string>>;
}) {
  const { mcpServers, showFileOption = true, onPickFiles, computerUse, experiment } = props;
  const customMcpServers = props.customMcpServers ?? [];
  const onManageMcpServers = props.onManageMcpServers;
  const readOnly = props.readOnly === true;
  const pluginLabels = props.pluginLabels ?? EMPTY_PLUGIN_LABELS;
  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("root");
  const visiblePlugins = mcpServers.filter((server) => server.visible);
  const showComputerUse = computerUse?.visible === true;
  const hasPluginRows = visiblePlugins.length > 0 || showComputerUse;
  // Read-only mode keeps both entries visible even with nothing enabled so the
  // user gets an explicit "none for this run" answer instead of a missing row.
  const hasPluginsMenu = hasPluginRows || readOnly;
  const hasMcpServersMenu =
    customMcpServers.length > 0 || onManageMcpServers !== undefined || readOnly;
  const computerUseLabel = pluginLabels[COMPUTER_USE_MCP_ID] ?? t`Computer Use`;
  const computerUseHint = isRemoteSession()
    ? t`Controls the paired desktop while the agent clicks or types`
    : t`Takes over the desktop while the agent clicks or types`;
  const experimentHint = t`Run one prompt with multiple agents, then compare their work.`;

  // Counts every enabled row the Plugins submenu shows, Computer Use included —
  // it is not a registry entry but it renders as one of the switches, so
  // leaving it out makes the badge disagree with the list the user opens.
  const enabledPluginCount =
    visiblePlugins.filter((server) => server.enabled).length +
    (showComputerUse && computerUse.enabled ? 1 : 0);
  const enabledMcpServerCount = customMcpServers.filter((server) => server.enabled).length;

  if (!showFileOption && !hasPluginsMenu && !hasMcpServersMenu && !experiment) return null;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    // Reset the drill-in when the sheet closes so it reopens at the root.
    if (!open) setMobileView("root");
  };

  const closeMenu = () => {
    setIsOpen(false);
    setMobileView("root");
  };

  const handlePickFiles = () => {
    closeMenu();
    onPickFiles();
  };

  // The Plugins submenu is a multiple-selection menu (Computer Use included as
  // one of its rows). Diff the new selection against current state to fire only
  // the single toggle that changed, and never close the parent menu on toggle.
  const pluginSelectedKeys = new Set<string>([
    ...visiblePlugins.filter((server) => server.enabled).map((server) => server.descriptor.id),
    ...(showComputerUse && computerUse.enabled ? [COMPUTER_USE_KEY] : []),
  ]);

  const handlePluginSelection = (keys: Selection) => {
    for (const server of visiblePlugins) {
      const next = keys !== "all" && keys.has(server.descriptor.id);
      if (next !== server.enabled) server.onToggle(next);
    }
    if (showComputerUse) {
      const next = keys !== "all" && keys.has(COMPUTER_USE_KEY);
      if (next !== computerUse.enabled) computerUse.onToggle(next);
    }
  };

  const pluginsCaption = readOnly ? (
    (props.readOnlyCaption ?? (
      <Trans>Set when this session started — start a new thread to change plugins</Trans>
    ))
  ) : (
    <Trans>Enabled plugins stay on for new threads</Trans>
  );
  const emptyPluginsNote = <Trans>No plugins are enabled for this run</Trans>;

  const mcpServersMenuProps = {
    servers: customMcpServers,
    readOnly,
    ...(props.readOnlyCaption !== undefined ? { readOnlyCaption: props.readOnlyCaption } : {}),
    ...(onManageMcpServers ? { onManage: onManageMcpServers } : {}),
  };

  const button = (
    <Button
      isIconOnly
      aria-label={t`Add attachment or capability`}
      className="poracode-composer-menu min-w-9 px-2"
      size="sm"
      variant="ghost"
      {...(mobile ? { onPress: () => setIsOpen(true) } : {})}
    >
      <Plus className="size-4" />
    </Button>
  );

  // ── Mobile: bottom-sheet with drill-ins for the Plugins and MCP lists ─────
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
      {experiment ? (
        <button
          type="button"
          className="m-sheet-action"
          aria-pressed={experiment.enabled}
          disabled={experiment.disabled}
          onClick={() => experiment.onToggle(!experiment.enabled)}
        >
          <FlaskConical className="size-4 text-muted" />
          <span className="flex-1 truncate">
            <Trans>Experiment</Trans>
          </span>
          <InfoHint text={experimentHint} />
          <MenuSwitch checked={experiment.enabled} />
        </button>
      ) : null}
      {hasPluginsMenu ? (
        <button type="button" className="m-sheet-action" onClick={() => setMobileView("plugins")}>
          <Server className="size-4 text-muted" />
          <span className="flex-1 truncate">
            <Trans>Plugins</Trans>
          </span>
          {enabledPluginCount > 0 ? (
            <span className="shrink-0 text-xs tabular-nums text-muted">{enabledPluginCount}</span>
          ) : null}
          <ChevronRight className="size-4 shrink-0 text-muted" />
        </button>
      ) : null}
      {hasMcpServersMenu ? (
        <button type="button" className="m-sheet-action" onClick={() => setMobileView("mcp")}>
          <Cable className="size-4 text-muted" />
          <span className="flex-1 truncate">
            <Trans>MCP Servers</Trans>
          </span>
          {enabledMcpServerCount > 0 ? (
            <span className="shrink-0 text-xs tabular-nums text-muted">
              {enabledMcpServerCount}
            </span>
          ) : null}
          <ChevronRight className="size-4 shrink-0 text-muted" />
        </button>
      ) : null}
    </div>
  );

  const mobilePluginsList = (
    <div className="m-sheet-list">
      <button
        type="button"
        className="m-sheet-action"
        aria-label={t`Back`}
        onClick={() => setMobileView("root")}
      >
        <ChevronLeft className="size-4 text-muted" />
        <span className="flex-1 truncate font-medium">
          <Trans>Plugins</Trans>
        </span>
      </button>
      {visiblePlugins.map((server) => {
        const Icon = server.descriptor.icon;
        const label = pluginLabels[server.descriptor.id] ?? t(server.descriptor.label);
        return readOnly ? (
          <div
            key={server.descriptor.id}
            className="m-sheet-action"
            data-static="true"
            aria-disabled="true"
          >
            <Icon className="size-4 text-muted" />
            <span className="flex-1 truncate">{label}</span>
            <MenuSwitch checked={server.enabled} readOnly />
          </div>
        ) : (
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
      {readOnly && !hasPluginRows ? (
        <p className="px-2 py-1 text-sm text-muted">{emptyPluginsNote}</p>
      ) : null}
      {showComputerUse && readOnly ? (
        <div className="m-sheet-action" data-static="true" aria-disabled="true">
          <Monitor className="size-4 shrink-0 text-muted" />
          <span className="flex-1 truncate">{computerUseLabel}</span>
          <InfoHint text={computerUseHint} />
          <MenuSwitch checked={computerUse.enabled} readOnly />
        </div>
      ) : null}
      {showComputerUse && !readOnly ? (
        <button
          type="button"
          className="m-sheet-action"
          aria-pressed={computerUse.enabled}
          onClick={() => computerUse.onToggle(!computerUse.enabled)}
        >
          <Monitor className="size-4 shrink-0 text-muted" />
          <span className="flex-1 truncate">{computerUseLabel}</span>
          <InfoHint text={computerUseHint} />
          <MenuSwitch checked={computerUse.enabled} />
        </button>
      ) : null}
      <p className="px-2 pt-0.5 text-[11px] leading-snug text-muted">{pluginsCaption}</p>
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
        {mobileView === "plugins" && hasPluginsMenu ? (
          mobilePluginsList
        ) : mobileView === "mcp" && hasMcpServersMenu ? (
          <ComposerMcpServersMobileList
            {...mcpServersMenuProps}
            onBack={() => setMobileView("root")}
            onManaged={closeMenu}
          />
        ) : (
          mobileRootList
        )}
      </ResponsiveMenuSurface>
    );
  }

  // ── Desktop: HeroUI dropdown with real flyout submenus ──────────────────────
  return (
    <Dropdown>
      {button}
      <Dropdown.Popover placement="top start">
        <Dropdown.Menu
          aria-label={t`Add to composer`}
          selectionMode="none"
          onAction={(key) => {
            if (key === "file") handlePickFiles();
            if (key === "experiment" && experiment) {
              experiment.onToggle(!experiment.enabled);
            }
          }}
          className="poracode-menu min-w-52"
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
          {experiment ? (
            <Dropdown.Item
              id="experiment"
              textValue={t`Experiment`}
              isDisabled={experiment.disabled}
            >
              <FlaskConical className="size-4 text-muted" />
              <Label className="flex-1 truncate">
                <Trans>Experiment</Trans>
              </Label>
              <InfoHint text={experimentHint} />
              <MenuSwitch checked={experiment.enabled} />
            </Dropdown.Item>
          ) : null}
          {(showFileOption || experiment) && (hasPluginsMenu || hasMcpServersMenu) ? (
            <Separator />
          ) : null}
          {hasPluginsMenu ? (
            <Dropdown.SubmenuTrigger>
              <Dropdown.Item id="plugins" textValue={t`Plugins`}>
                <Server className="size-4 text-muted" />
                <Label className="flex-1 truncate">
                  <Trans>Plugins</Trans>
                </Label>
                {enabledPluginCount > 0 ? (
                  <span className="text-xs tabular-nums text-muted">{enabledPluginCount}</span>
                ) : null}
                <Dropdown.SubmenuIndicator />
              </Dropdown.Item>
              <Dropdown.Popover>
                <div className="flex flex-col">
                  {readOnly ? (
                    // Session bindings are fixed at launch — render a static list
                    // (not menu items) so rows do not look or act clickable.
                    <div
                      role="list"
                      aria-label={t`Plugins`}
                      className="poracode-menu max-h-72 min-w-56 overflow-y-auto p-1"
                    >
                      {visiblePlugins.map((server) => {
                        const Icon = server.descriptor.icon;
                        const label =
                          pluginLabels[server.descriptor.id] ?? t(server.descriptor.label);
                        return (
                          <div
                            key={server.descriptor.id}
                            role="listitem"
                            className={readOnlyRowClassName}
                          >
                            <Icon className="size-4 shrink-0 text-muted" />
                            <span className="min-w-0 flex-1 truncate">{label}</span>
                            <MenuSwitch checked={server.enabled} readOnly />
                          </div>
                        );
                      })}
                      {showComputerUse ? (
                        <div role="listitem" className={readOnlyRowClassName}>
                          <Monitor className="size-4 shrink-0 text-muted" />
                          <span className="min-w-0 flex-1 truncate">{computerUseLabel}</span>
                          <InfoHint text={computerUseHint} />
                          <MenuSwitch checked={computerUse.enabled} readOnly />
                        </div>
                      ) : null}
                      {!hasPluginRows ? (
                        <p className="px-2 py-1.5 text-sm text-muted">{emptyPluginsNote}</p>
                      ) : null}
                    </div>
                  ) : (
                    <Dropdown.Menu
                      aria-label={t`Plugins`}
                      selectionMode="multiple"
                      selectedKeys={pluginSelectedKeys}
                      onSelectionChange={handlePluginSelection}
                      className="poracode-menu max-h-72 min-w-56 overflow-y-auto"
                    >
                      {visiblePlugins.map((server) => {
                        const Icon = server.descriptor.icon;
                        const label =
                          pluginLabels[server.descriptor.id] ?? t(server.descriptor.label);
                        return (
                          <Dropdown.Item
                            key={server.descriptor.id}
                            id={server.descriptor.id}
                            textValue={label}
                          >
                            <Icon className="size-4 text-muted" />
                            <Label className="flex-1 truncate">{label}</Label>
                            <MenuSwitch checked={server.enabled} />
                          </Dropdown.Item>
                        );
                      })}
                      {showComputerUse ? (
                        <Dropdown.Item id={COMPUTER_USE_KEY} textValue={computerUseLabel}>
                          <Monitor className="size-4 shrink-0 text-muted" />
                          <Label className="flex-1 truncate">{computerUseLabel}</Label>
                          <InfoHint text={computerUseHint} />
                          <MenuSwitch checked={computerUse.enabled} />
                        </Dropdown.Item>
                      ) : null}
                    </Dropdown.Menu>
                  )}
                  <p className={submenuCaptionClassName}>{pluginsCaption}</p>
                </div>
              </Dropdown.Popover>
            </Dropdown.SubmenuTrigger>
          ) : null}
          {hasMcpServersMenu ? (
            <Dropdown.SubmenuTrigger>
              <Dropdown.Item id="mcp-servers" textValue={t`MCP Servers`}>
                <Cable className="size-4 text-muted" />
                <Label className="flex-1 truncate">
                  <Trans>MCP Servers</Trans>
                </Label>
                {enabledMcpServerCount > 0 ? (
                  <span className="text-xs tabular-nums text-muted">{enabledMcpServerCount}</span>
                ) : null}
                <Dropdown.SubmenuIndicator />
              </Dropdown.Item>
              <Dropdown.Popover>
                <ComposerMcpServersSubmenuContent {...mcpServersMenuProps} />
              </Dropdown.Popover>
            </Dropdown.SubmenuTrigger>
          ) : null}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
