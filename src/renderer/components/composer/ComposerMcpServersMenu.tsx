import type { ReactNode } from "react";
import { ChevronLeft, Settings2, SlidersHorizontal } from "lucide-react";
import type { Selection } from "@heroui/react";
import { Dropdown, Label } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { MenuSwitch, readOnlyRowClassName, submenuCaptionClassName } from "./ComposerAddMenuParts";

/**
 * A user-configured MCP server (global or workspace scope) surfaced in the
 * composer's "MCP Servers" submenu. Toggling flips the server's persistent
 * `enabled` flag in settings — the same switch as on the MCP Servers settings
 * page.
 */
export type ComposerCustomMcpItem = {
  id: string;
  name: string;
  enabled: boolean;
  /** Omitted in read-only mode (an active thread's bindings can't change). */
  onToggle?: (next: boolean) => void;
};

/** Selection id of the "Manage MCP servers" action row. */
const MANAGE_KEY = "manage-mcp-servers";

export type ComposerMcpServersMenuProps = {
  servers: readonly ComposerCustomMcpItem[];
  /**
   * Display-only mode for an active thread: bindings were fixed when the
   * session launched, so switches are shown muted and never fire.
   */
  readOnly: boolean;
  /** Overrides the default read-only caption (e.g. provider-owned MCP). */
  readOnlyCaption?: ReactNode;
  /** Opens the MCP Servers settings page. Omitted — the manage row is hidden. */
  onManage?: () => void;
};

/** Shared by both surfaces so captions read identically. */
function useMcpServersMenuText(readOnly: boolean, readOnlyCaption: ReactNode | undefined) {
  const caption = readOnly ? (
    (readOnlyCaption ?? (
      <Trans>Set when this session started — start a new thread to change MCP servers</Trans>
    ))
  ) : (
    <Trans>Enabled MCP servers stay on for new threads</Trans>
  );
  const emptyNote = readOnly ? (
    <Trans>No MCP servers are enabled for this run</Trans>
  ) : (
    <Trans>No MCP servers configured</Trans>
  );
  return { caption, emptyNote };
}

/**
 * Desktop flyout body for the "MCP Servers" submenu: one switch per
 * user-configured server plus a "Manage" action that jumps to settings.
 * Rendered inside the parent `Dropdown.Popover`.
 */
export function ComposerMcpServersSubmenuContent(props: ComposerMcpServersMenuProps) {
  const { servers, readOnly, onManage } = props;
  const { t } = useLingui();
  const { caption, emptyNote } = useMcpServersMenuText(readOnly, props.readOnlyCaption);
  const selectedKeys = new Set(
    servers.filter((server) => server.enabled).map((server) => server.id),
  );

  // Diff the new selection against current state to fire only the single
  // toggle that changed, and never close the parent menu on toggle.
  const handleSelection = (keys: Selection) => {
    for (const server of servers) {
      const next = keys !== "all" && keys.has(server.id);
      if (next !== server.enabled) server.onToggle?.(next);
    }
  };

  return (
    <div className="flex flex-col">
      {readOnly ? (
        // Session bindings are fixed at launch — render a static list (not
        // menu items) so rows do not look or act clickable.
        <div
          role="list"
          aria-label={t`MCP Servers`}
          className="poracode-menu max-h-72 min-w-56 overflow-y-auto p-1"
        >
          {servers.map((server) => (
            <div key={server.id} role="listitem" className={readOnlyRowClassName}>
              <Settings2 className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{server.name}</span>
              <MenuSwitch checked={server.enabled} readOnly />
            </div>
          ))}
          {servers.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted">{emptyNote}</p>
          ) : null}
        </div>
      ) : servers.length > 0 ? (
        <Dropdown.Menu
          aria-label={t`MCP Servers`}
          selectionMode="multiple"
          selectedKeys={selectedKeys}
          onSelectionChange={handleSelection}
          className="poracode-menu max-h-72 min-w-56 overflow-y-auto"
        >
          {servers.map((server) => (
            <Dropdown.Item key={server.id} id={server.id} textValue={server.name}>
              <Settings2 className="size-4 text-muted" />
              <Label className="flex-1 truncate">{server.name}</Label>
              <MenuSwitch checked={server.enabled} />
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      ) : (
        <p className="min-w-56 px-3 py-2 text-sm text-muted">{emptyNote}</p>
      )}
      {onManage ? (
        // The server list above already takes focus when the flyout opens; a
        // second auto-focused menu would paint two focus rings at once.
        <Dropdown.Menu
          aria-label={t`MCP server actions`}
          autoFocus={false}
          selectionMode="none"
          onAction={(key) => {
            if (key === MANAGE_KEY) onManage();
          }}
          className="poracode-menu min-w-56 border-t border-border"
        >
          <Dropdown.Item id={MANAGE_KEY} textValue={t`Manage MCP servers`}>
            <SlidersHorizontal className="size-4 text-muted" />
            <Label className="flex-1 truncate">
              <Trans>Manage MCP servers</Trans>
            </Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      ) : null}
      <p className={submenuCaptionClassName}>{caption}</p>
    </div>
  );
}

/**
 * Mobile bottom-sheet drill-in for the "MCP Servers" list. Mirrors the desktop
 * flyout with sheet-native rows. `onManaged` lets the parent close the sheet
 * before the settings overlay opens.
 */
export function ComposerMcpServersMobileList(
  props: ComposerMcpServersMenuProps & { onBack: () => void; onManaged: () => void },
) {
  const { servers, readOnly, onManage, onBack, onManaged } = props;
  const { t } = useLingui();
  const { caption, emptyNote } = useMcpServersMenuText(readOnly, props.readOnlyCaption);

  return (
    <div className="m-sheet-list">
      <button type="button" className="m-sheet-action" aria-label={t`Back`} onClick={onBack}>
        <ChevronLeft className="size-4 text-muted" />
        <span className="flex-1 truncate font-medium">
          <Trans>MCP Servers</Trans>
        </span>
      </button>
      {servers.map((server) =>
        readOnly ? (
          <div key={server.id} className="m-sheet-action" data-static="true" aria-disabled="true">
            <Settings2 className="size-4 text-muted" />
            <span className="flex-1 truncate">{server.name}</span>
            <MenuSwitch checked={server.enabled} readOnly />
          </div>
        ) : (
          <button
            key={server.id}
            type="button"
            className="m-sheet-action"
            aria-pressed={server.enabled}
            onClick={() => server.onToggle?.(!server.enabled)}
          >
            <Settings2 className="size-4 text-muted" />
            <span className="flex-1 truncate">{server.name}</span>
            <MenuSwitch checked={server.enabled} />
          </button>
        ),
      )}
      {servers.length === 0 ? <p className="px-2 py-1 text-sm text-muted">{emptyNote}</p> : null}
      {onManage ? (
        <button
          type="button"
          className="m-sheet-action"
          onClick={() => {
            onManaged();
            onManage();
          }}
        >
          <SlidersHorizontal className="size-4 text-muted" />
          <span className="flex-1 truncate">
            <Trans>Manage MCP servers</Trans>
          </span>
        </button>
      ) : null}
      <p className="px-2 pt-0.5 text-[11px] leading-snug text-muted">{caption}</p>
    </div>
  );
}
