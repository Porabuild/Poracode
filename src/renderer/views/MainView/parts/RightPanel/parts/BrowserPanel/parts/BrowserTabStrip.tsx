import { Globe, Plus, X } from "lucide-react";
import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { useShallow } from "zustand/shallow";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import type { BrowserTabGroupInfo, BrowserTabInfo } from "@/shared/ipc";
import { BrowserTabGroupMenu } from "./BrowserTabGroupMenu";
import { groupColor } from "./groupColors";

function TabFavicon(props: { faviconUrl?: string; loading: boolean }) {
  if (props.loading) {
    return (
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <span className="size-2 animate-pulse rounded-full bg-accent/70" />
      </span>
    );
  }
  if (props.faviconUrl) {
    return (
      <img
        src={props.faviconUrl}
        alt=""
        className="size-3.5 shrink-0 rounded-[2px]"
        loading="lazy"
        draggable={false}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return <Globe className="size-3.5 shrink-0 text-foreground/50" />;
}

/**
 * Chrome-style group header: a colored pill the SAME height as a tab, sitting
 * inline at the start of its tab run. Click toggles collapse; right-click opens
 * the group context menu.
 */
function GroupChip(props: {
  group: BrowserTabGroupInfo;
  displayTitle: string;
  count: number;
  noDrag: string;
  isHeader: boolean;
  marginClass: string;
  onContextMenu: (e: ReactMouseEvent) => void;
}) {
  const { t } = useLingui();
  const { group, displayTitle, count, noDrag, isHeader, marginClass, onContextMenu } = props;
  const color = groupColor(group.color);
  const toggle = () => {
    readBridge()
      .browserSetGroupCollapsed({ groupId: group.id, collapsed: !group.collapsed })
      .catch(() => {});
  };
  return (
    <div
      role="button"
      tabIndex={0}
      data-lc-group={group.id}
      title={group.collapsed ? t`Expand group` : t`Collapse group`}
      className={`flex shrink-0 cursor-pointer select-none items-center gap-1.5 self-center rounded-t-md px-2 text-[12px] font-medium ${marginClass} ${
        isHeader ? "" : "py-0.5"
      } ${noDrag}`}
      style={{ backgroundColor: `${color}2b`, boxShadow: `inset 0 -1px 0 ${color}99`, color }}
      onClick={toggle}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {displayTitle ? <span className="max-w-[120px] truncate">{displayTitle}</span> : null}
      <span className="tabular-nums opacity-70">{count}</span>
    </div>
  );
}

/**
 * Tab strip with an always-present "new tab" affordance and tab groups.
 *
 * `variant="row"` — standalone row below the toolbar (docked / drawer).
 * `variant="header"` — embedded into the window/fullscreen drag-region header,
 * so individual tabs opt out of the drag region (`__controls`) while empty
 * strip space stays draggable, browser-style.
 *
 * Grouped tabs are preceded by a colored {@link GroupChip}; collapsing a group
 * hides its tabs behind the chip.
 */
export function BrowserTabStrip(props: { onCreateTab: () => void; variant?: "row" | "header" }) {
  const { t } = useLingui();
  const variant = props.variant ?? "row";
  const tabs = useBrowserPanelStore((s) => s.tabs);
  const groups = useBrowserPanelStore((s) => s.groups);
  const activeTabId = useBrowserPanelStore((s) => s.activeTabId);
  const attentionTabId = useBrowserPanelStore((s) => s.attentionTabId);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ group: BrowserTabGroupInfo; x: number; y: number } | null>(
    null,
  );

  // Thread-owned groups display the thread's LIVE task title (which updates as
  // AI title generation completes), falling back to the stored label. Keep this
  // subscription above the empty-state return so the component always calls the
  // same hooks when the first browser tab arrives.
  const threadTitles = useAppStore(
    useShallow((s) => {
      const map: Record<string, string> = {};
      for (const g of groups) {
        if (!g.threadId) continue;
        const thread = s.threads.find((th) => th.id === g.threadId);
        if (thread) map[g.threadId] = thread.title;
      }
      return map;
    }),
  );

  if (tabs.length === 0) {
    return null;
  }

  const isHeader = variant === "header";
  const noDrag = isHeader ? "poracode-overlay-header__controls" : "";
  const containerClass = isHeader
    ? // Stretch tabs to the full titlebar height so their hit area reaches the
      // very top pixel: in fullscreen the cursor can slam to the top edge and
      // still land on a tab (Fitts's law). Empty strip space stays a window-drag
      // region; tabs themselves opt out via `__controls`.
      "flex h-full min-w-0 flex-1 items-stretch overflow-x-auto"
    : "poracode-browser-tab-strip flex items-center overflow-x-auto border-b border-border bg-[var(--content-background)] px-1 py-0.5";

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const countByGroup = new Map<string, number>();
  for (const tab of tabs) {
    if (tab.groupId) countByGroup.set(tab.groupId, (countByGroup.get(tab.groupId) ?? 0) + 1);
  }

  const titleFor = (g: BrowserTabGroupInfo) =>
    (g.threadId ? threadTitles[g.threadId] : undefined) ?? g.title;

  const renderTab = (
    tab: BrowserTabInfo,
    opts: { grouped: boolean; color?: string; marginClass: string },
  ) => {
    const active = tab.tabId === activeTabId;
    const attention = !active && tab.tabId === attentionTabId;
    const activate = () => {
      if (!active) {
        readBridge()
          .browserActivateTab({ tabId: tab.tabId })
          .catch(() => {});
      }
    };
    return (
      <div
        key={tab.tabId}
        role="button"
        tabIndex={0}
        draggable
        className={`poracode-browser-tab group flex w-40 min-w-[48px] shrink cursor-pointer items-center gap-1 px-2 text-left text-[12px] ${
          opts.grouped ? "rounded-t-md" : "rounded-md"
        } ${opts.marginClass} ${isHeader ? "" : "py-0.5"} ${noDrag} ${
          active
            ? "bg-[var(--surface-tertiary)] text-foreground"
            : "bg-transparent text-foreground/60 hover:bg-[var(--surface-secondary)] hover:text-foreground/80"
        } ${attention ? "ring-1 ring-amber-400/60" : ""} ${draggingTabId === tab.tabId ? "opacity-50" : ""}`}
        style={
          opts.grouped && opts.color ? { boxShadow: `inset 0 -1px 0 ${opts.color}99` } : undefined
        }
        onDragStart={(e) => {
          setDraggingTabId(tab.tabId);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", tab.tabId);
        }}
        onDragEnd={() => setDraggingTabId(null)}
        onDragOver={(e) => {
          if (!draggingTabId || draggingTabId === tab.tabId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          const sourceTabId = e.dataTransfer.getData("text/plain") || draggingTabId;
          setDraggingTabId(null);
          if (!sourceTabId || sourceTabId === tab.tabId) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const position = e.clientX > rect.left + rect.width / 2 ? "after" : "before";
          readBridge()
            .browserMoveTab({ tabId: sourceTabId, targetTabId: tab.tabId, position })
            .catch(() => {});
        }}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate();
          }
        }}
        title={tab.url}
      >
        <TabFavicon
          loading={tab.loading}
          {...(tab.faviconUrl ? { faviconUrl: tab.faviconUrl } : {})}
        />
        <span className="flex-1 truncate">{tab.title || tab.url || t`New tab`}</span>
        <button
          type="button"
          aria-label={t`Close tab`}
          className="poracode-browser-tab-close invisible flex h-4 w-4 items-center justify-center rounded text-foreground/50 hover:bg-[var(--row-hover)] hover:text-foreground group-hover:visible group-focus-within:visible"
          title={t`Close tab`}
          onClick={(e) => {
            e.stopPropagation();
            readBridge()
              .browserCloseTab({ tabId: tab.tabId })
              .catch(() => {});
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              readBridge()
                .browserCloseTab({ tabId: tab.tabId })
                .catch(() => {});
            }
          }}
        >
          <X className="size-3" />
        </button>
      </div>
    );
  };

  // All tabs + group chips render FLAT (direct flex children) so grouped tabs
  // size exactly like normal tabs. Spacing is per-item (`ml-1`) instead of a
  // container gap, and members of the same group render FLUSH (no left margin)
  // with square bottoms + a 1px inset underline — so those underlines join into
  // one continuous line spanning the group, Chrome-style.
  const nodes: ReactNode[] = [];
  let prevGid: string | undefined;
  // First item has no left margin; same-group members render flush (no margin)
  // so their underlines join; everything else gets `ml-1` (the removed container gap).
  const marginFor = (flush: boolean) => (nodes.length === 0 || flush ? "" : "ml-1");
  for (const tab of tabs) {
    const gid = tab.groupId;
    const group = gid ? groupById.get(gid) : undefined;
    const color = group ? groupColor(group.color) : undefined;
    if (gid && group && gid !== prevGid) {
      const g = group;
      nodes.push(
        <GroupChip
          key={`g-${gid}`}
          group={g}
          displayTitle={titleFor(g)}
          count={countByGroup.get(gid) ?? 0}
          noDrag={noDrag}
          isHeader={isHeader}
          marginClass={marginFor(false)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ group: g, x: e.clientX, y: e.clientY });
          }}
        />,
      );
      prevGid = gid;
    }
    if (group?.collapsed) {
      prevGid = gid;
      continue;
    }
    // Groups are contiguous, so a rendered grouped tab is always flush with the
    // chip/previous member before it.
    nodes.push(
      renderTab(tab, {
        grouped: !!group,
        marginClass: marginFor(!!group),
        ...(color ? { color } : {}),
      }),
    );
    prevGid = gid;
  }

  return (
    <>
      <div className={containerClass}>
        {nodes}
        <button
          type="button"
          aria-label={t`New tab`}
          title={t`New tab`}
          className={`ml-1 flex size-6 shrink-0 self-center items-center justify-center rounded text-foreground/60 hover:bg-[var(--surface-secondary)] hover:text-foreground ${noDrag}`}
          onClick={props.onCreateTab}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      {menu ? (
        <BrowserTabGroupMenu
          group={menu.group}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}
