import { Dropdown, Label } from "@heroui/react";
import { ChevronsDown, ChevronsUp, Ellipsis, PanelLeftClose, Settings2 } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { SidebarButton, sidebarIconButtonClass } from "@/renderer/components/common/SidebarButton";
import { sidebarFooterNavClass } from "@/renderer/components/layout/sidebarChrome";
import { DeferredSettingsOverlay } from "@/renderer/deferredFeatures";
import { openRemoteAccessSettings, openSettings } from "@/renderer/actions/panelActions";
import { usePanelStore } from "@/renderer/state/panelStore";
import { isPanelResizing } from "@/renderer/state/panelResizeSignal";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { useSidebar } from "@/renderer/views/MainView/parts/AppShell/AppShell";
import {
  RemoteAccessSidebarIcon,
  type RemoteAccessSidebarStatus,
  RemoteAccessSidebarTooltip,
} from "@/renderer/views/MainView/parts/Sidebar/parts/RemoteAccessSidebarIcon";
import { useSidebarShortcuts } from "@/renderer/views/MainView/parts/Sidebar/parts/sidebarShortcuts";
import {
  SidebarWorkspaceSwitcher,
  useHasSwitchableWorkspaces,
} from "@/renderer/views/MainView/parts/Sidebar/parts/SidebarWorkspaceSwitcher";
import {
  UpdateButtons,
  useUpdateEntryVisible,
} from "@/renderer/views/MainView/parts/Sidebar/parts/UpdateButtons";
import {
  WhatsNewButton,
  useWhatsNewEntryVisible,
} from "@/renderer/views/MainView/parts/Sidebar/parts/WhatsNewButton";

function prewarmSettings(): void {
  void DeferredSettingsOverlay.preload();
}

/** Icon buttons are 32px wide on a 4px gap. */
const FOOTER_ITEM_PITCH_PX = 36;

interface FooterActionItem {
  key: string;
  icon: ReactNode;
  label: string;
  isActive: boolean;
  onPress: () => void;
  onPreload?: () => void;
  tooltip?: ReactNode;
}

/**
 * Sticky footer nav of the expanded sidebar: workspace switcher, optional
 * update/changelog entries, the configurable shortcuts, Settings/Remote
 * Access, and Hide sidebar. `footerCollapsed` (persisted) swaps the labeled
 * rows for a single icon row to give the thread list more vertical room; the
 * chevron toggle on the Hide-sidebar row switches modes.
 *
 * The icon row never wraps (wrapping made icons jump rows during the sidebar
 * expand animation). Items that stop fitting after a *settled* resize move
 * into a trailing kebab menu; Hide sidebar anchors the left edge and the
 * expand toggle the right.
 */
export function SidebarFooterNav(props: { remoteAccessStatus: RemoteAccessSidebarStatus }) {
  const { remoteAccessStatus } = props;
  const { t } = useLingui();
  const settingsOpen = usePanelStore((s) => s.settingsOpen);
  const settingsSection = usePanelStore((s) => s.settingsSection);
  // Remote Access has its own sidebar entry, so the generic Settings button
  // lights up for every other section.
  const remoteAccessSettingsActive = settingsOpen && settingsSection === "remoteAccess";
  const otherSettingsActive = settingsOpen && !remoteAccessSettingsActive;
  const footerCollapsed = useSidebarUiStore((s) => s.footerCollapsed);
  const toggleFooterCollapsed = useSidebarUiStore((s) => s.toggleFooterCollapsed);
  const sidebarShortcuts = useSidebarShortcuts();
  const { isCollapsed, collapse } = useSidebar();
  const hasSwitchableWorkspaces = useHasSwitchableWorkspaces();
  const updateEntryVisible = useUpdateEntryVisible();
  const whatsNewEntryVisible = useWhatsNewEntryVisible();

  const rowRef = useRef<HTMLDivElement | null>(null);
  const enabledRef = useRef(!isCollapsed);
  enabledRef.current = !isCollapsed;
  const [settledWidth, setSettledWidth] = useState<number | null>(null);

  // Two resize paths with different responsiveness needs: a divider drag
  // (panelResizeSignal) should overflow live with the pointer, so it applies
  // immediately; the sidebar expand/collapse *animation* (or a window resize)
  // changes the width every frame without a drag, so it is debounced until
  // the width settles and the row reshuffles exactly once. Updates are
  // skipped while the sidebar is collapsed (the footer is invisible then, and
  // keeping the pre-collapse layout means a re-expand starts with the icons
  // exactly where they were). A zero width (jsdom, or a fully collapsed
  // column) reads as "unmeasured" so the row shows everything.
  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const read = () => el.getBoundingClientRect().width;
    // First measurement applies synchronously so the row never flashes
    // un-overflowed before paint.
    const initial = read();
    if (initial > 0) {
      setSettledWidth((current) => (current === initial ? current : initial));
    }
    if (typeof ResizeObserver === "undefined") return;
    let timer: number | undefined;
    const apply = () => {
      if (!enabledRef.current) return;
      const next = read();
      if (next > 0) {
        setSettledWidth((current) => (current === next ? current : next));
      }
    };
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      if (isPanelResizing()) {
        apply();
      } else {
        timer = window.setTimeout(apply, 150);
      }
    });
    observer.observe(el);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
    // The row only exists while the footer is collapsed, so re-run when that
    // toggles to attach (or detach) the observer.
  }, [footerCollapsed]);

  if (footerCollapsed) {
    const hideSidebarButton = (
      <SidebarButton
        iconOnly
        icon={<PanelLeftClose className="size-4" />}
        label={t`Hide sidebar`}
        tooltipPlacement="top"
        onPress={collapse}
      />
    );
    // ml-auto pins the expand toggle to the right edge of the row whenever
    // there is free space (no overflow); the wrapper owns the margin because
    // SidebarButton's className lands on the inner button, not the flex item.
    const expandButton = (
      <div className="ml-auto flex min-h-0 flex-col">
        <SidebarButton
          iconOnly
          icon={<ChevronsUp className="size-4" />}
          label={t`Expand footer`}
          tooltipPlacement="top"
          onPress={toggleFooterCollapsed}
        />
      </div>
    );
    // Leading entries with their own visibility rules and trigger semantics
    // (dropdown, live status tooltip, unread badge); they never overflow.
    const specialItems: ReactNode[] = [
      hasSwitchableWorkspaces ? <SidebarWorkspaceSwitcher key="workspace" iconOnly /> : null,
      updateEntryVisible ? <UpdateButtons key="update" iconOnly tooltipPlacement="top" /> : null,
      whatsNewEntryVisible ? (
        <WhatsNewButton key="whatsNew" iconOnly tooltipPlacement="top" />
      ) : null,
    ].filter(Boolean);
    const actionItems: FooterActionItem[] = [
      ...sidebarShortcuts.map((shortcut) => ({
        key: shortcut.id,
        icon: shortcut.icon,
        label: shortcut.label,
        isActive: shortcut.isActive,
        onPress: shortcut.onPress,
      })),
      {
        key: "settings",
        icon: <Settings2 className="size-4" />,
        label: t`Settings`,
        isActive: otherSettingsActive,
        onPress: openSettings,
        onPreload: prewarmSettings,
      },
      {
        key: "remoteAccess",
        icon: <RemoteAccessSidebarIcon status={remoteAccessStatus} />,
        label: t`Remote Access`,
        isActive: remoteAccessSettingsActive,
        onPress: openRemoteAccessSettings,
        onPreload: prewarmSettings,
        tooltip: <RemoteAccessSidebarTooltip status={remoteAccessStatus} />,
      },
    ];

    // Hide + expand are pinned, so they always claim two slots; the kebab
    // claims one more whenever anything overflows.
    const capacity =
      settledWidth === null
        ? Number.POSITIVE_INFINITY
        : Math.floor((settledWidth + 4) / FOOTER_ITEM_PITCH_PX);
    const totalCount = 2 + specialItems.length + actionItems.length;
    const needsOverflow = totalCount > capacity;
    const visibleActionCount = needsOverflow
      ? Math.max(0, capacity - 2 - specialItems.length - 1)
      : actionItems.length;
    const visibleActions = actionItems.slice(0, visibleActionCount);
    const overflowedActions = actionItems.slice(visibleActionCount);

    return (
      <div className={sidebarFooterNavClass}>
        <div ref={rowRef} className="flex flex-nowrap items-center gap-1 overflow-hidden">
          {hideSidebarButton}
          {specialItems}
          {visibleActions.map((item) => (
            <SidebarButton
              key={item.key}
              iconOnly
              icon={item.icon}
              label={item.label}
              tooltipPlacement="top"
              isActive={item.isActive}
              {...(item.tooltip ? { tooltip: item.tooltip } : {})}
              {...(item.onPreload ? { onPreload: item.onPreload } : {})}
              onPress={item.onPress}
            />
          ))}
          {needsOverflow && overflowedActions.length > 0 ? (
            <Dropdown
              onOpenChange={(open) => {
                // Overflowed entries lose the row's hover/focus preload, so the
                // menu opening is the earliest signal that one may be picked —
                // it still buys the lazy Settings chunk a head start.
                if (open) {
                  for (const item of overflowedActions) item.onPreload?.();
                }
              }}
            >
              <Dropdown.Trigger
                aria-label={t`More`}
                // The trigger stands in for the icons it hides, so it carries
                // their active state when the current destination is in there.
                className={sidebarIconButtonClass({
                  isActive: overflowedActions.some((item) => item.isActive),
                })}
              >
                <Ellipsis className="size-4" />
              </Dropdown.Trigger>
              <Dropdown.Popover placement="top end">
                <Dropdown.Menu
                  aria-label={t`More`}
                  className="poracode-menu min-w-48"
                  onAction={(key) => {
                    overflowedActions.find((item) => item.key === String(key))?.onPress();
                  }}
                >
                  {overflowedActions.map((item) => (
                    <Dropdown.Item key={item.key} id={item.key} textValue={item.label}>
                      {/* Row icons inherit the button's color; menu entries
                          follow the muted-icon convention instead. */}
                      <span className="flex size-4 shrink-0 items-center justify-center text-muted">
                        {item.icon}
                      </span>
                      <Label>{item.label}</Label>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          ) : null}
          {expandButton}
        </div>
      </div>
    );
  }

  return (
    <div className={sidebarFooterNavClass}>
      <SidebarWorkspaceSwitcher />
      <UpdateButtons />
      <WhatsNewButton />
      {sidebarShortcuts.map((shortcut) => (
        <SidebarButton
          key={shortcut.id}
          icon={shortcut.icon}
          label={shortcut.label}
          isActive={shortcut.isActive}
          onPress={shortcut.onPress}
        />
      ))}
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <SidebarButton
            icon={<Settings2 className="size-4" />}
            label={t`Settings`}
            isActive={otherSettingsActive}
            onPreload={prewarmSettings}
            onPress={openSettings}
          />
        </div>
        <SidebarButton
          iconOnly
          icon={<RemoteAccessSidebarIcon status={remoteAccessStatus} />}
          label={t`Remote Access`}
          tooltip={<RemoteAccessSidebarTooltip status={remoteAccessStatus} />}
          isActive={remoteAccessSettingsActive}
          onPreload={prewarmSettings}
          onPress={openRemoteAccessSettings}
        />
      </div>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <SidebarButton
            icon={<PanelLeftClose className="size-4" />}
            label={t`Hide sidebar`}
            onPress={collapse}
          />
        </div>
        <SidebarButton
          iconOnly
          icon={<ChevronsDown className="size-4" />}
          label={t`Collapse footer`}
          onPress={toggleFooterCollapsed}
        />
      </div>
    </div>
  );
}
