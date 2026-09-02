import { type CSSProperties, type ReactNode, useRef } from "react";
import { Lock, LockOpen, Maximize2, PanelRightClose, PictureInPicture2, X } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { PanelHeaderProjectName } from "@/renderer/components/layout/PanelHeaderProjectName";
import { PanelDockDropZone } from "@/renderer/components/layout/PanelDock/PanelDockDropZone";
import { PanelSectionHeader } from "@/renderer/components/layout/PanelDock/PanelSectionHeader";
import { PanelTabDragButton } from "@/renderer/components/layout/PanelDock/PanelTabDragButton";
import {
  PANEL_TAB_ICONS,
  usePanelTabLabels,
} from "@/renderer/components/layout/PanelDock/panelTabMeta";
import { useSplitPercent } from "@/renderer/components/layout/PanelDock/useSplitPercent";
import {
  panelHeaderIconButtonClass,
  panelHeaderRowClass,
  panelHeaderTabIconButtonClass,
} from "@/renderer/components/layout/sidebarChrome";
import { DOCKABLE_PANEL_TABS, type RightPanelTab } from "@/renderer/state/panelStore";

export type { RightPanelTab };

export function UnifiedRightPanel(props: {
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  terminalContent?: ReactNode;
  gitContent: ReactNode;
  filesContent: ReactNode;
  browserContent: ReactNode;
  usageContent?: ReactNode;
  notesContent?: ReactNode;
  portsContent?: ReactNode;
  docksContent?: ReactNode;
  subagentContent?: ReactNode;
  subagentModel?: ReactNode;
  subagentTitle?: ReactNode;
  /** Tab-specific action buttons rendered in the header when the usage tab is active. */
  usageHeaderActions?: ReactNode;
  showTerminalTab?: boolean;
  showFilesTab?: boolean;
  showGitTab?: boolean;
  showUsageTab?: boolean;
  showNotesTab?: boolean;
  showPortsTab?: boolean;
  showDocksTab?: boolean;
  showSubagentTab?: boolean;
  showBrowserTab?: boolean;
  onCloseSubagent?: () => void;
  projectName: string | undefined;
  onExpandGitToOverlay?: () => void;
  onExpandFilesToOverlay?: () => void;
  onExpandBrowserToOverlay?: () => void;
  onExtractBrowserToWindow?: () => void;
  onOpenGit?: () => void;
  onOpenTerminal?: () => void;
  onOpenFiles?: () => void;
  onOpenBrowser?: () => void;
  onOpenUsage?: () => void;
  onOpenNotes?: () => void;
  onOpenPorts?: () => void;
  /** Whether the panel re-scopes itself to whichever thread is open. */
  followsThread?: boolean;
  onToggleFollowsThread?: () => void;
  /** Second tab rendered stacked with the active one (drag-and-drop split). */
  splitTab?: RightPanelTab;
  /** Which half of the panel the split tab occupies. */
  splitPlacement?: "top" | "bottom";
  onCloseSplit?: () => void;
  /** Tabs painted in the bottom row; their icons stay lit even though this panel skips them. */
  dockedTabs?: readonly RightPanelTab[];
  onClose: () => void;
}) {
  const {
    activeTab,
    onTabChange,
    terminalContent,
    gitContent,
    filesContent,
    browserContent,
    usageContent,
    notesContent,
    portsContent,
    docksContent,
    subagentContent,
    subagentModel,
    subagentTitle,
    usageHeaderActions,
    showTerminalTab = true,
    showFilesTab = true,
    showGitTab = true,
    showUsageTab = true,
    showNotesTab = true,
    showPortsTab = false,
    showDocksTab = false,
    showSubagentTab = false,
    showBrowserTab = true,
    onCloseSubagent,
    projectName,
    onExpandGitToOverlay,
    onExpandFilesToOverlay,
    onExpandBrowserToOverlay,
    onExtractBrowserToWindow,
    onOpenGit,
    onOpenTerminal,
    onOpenFiles,
    onOpenBrowser,
    onOpenUsage,
    onOpenNotes,
    onOpenPorts,
    followsThread = false,
    onToggleFollowsThread,
    splitTab,
    splitPlacement = "bottom",
    onCloseSplit,
    dockedTabs = [],
    onClose,
  } = props;
  const { t } = useLingui();
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const splitFirstPaneRef = useRef<HTMLDivElement>(null);
  const {
    percent: splitPercent,
    minPercent: splitMinPercent,
    maxPercent: splitMaxPercent,
    handleResizeStart: handleSplitResizeStart,
    handleResizeKeyDown: handleSplitResizeKeyDown,
  } = useSplitPercent({
    storageKey: "poracode-right-panel-split-percent",
    orientation: "column",
    containerRef: splitContainerRef,
    paneRef: splitFirstPaneRef,
    defaultPercent: 50,
    minPercent: 20,
  });
  const hasSubagentModel = activeTab === "subagent" && subagentModel !== undefined;
  const hasSubagentTitle = activeTab === "subagent" && subagentTitle !== undefined;

  /** Inline opacity/transition so animation is not dropped if Tailwind misses dynamic class strings. */
  const tabLayerStyle = (tab: RightPanelTab): CSSProperties => {
    const on = activeTab === tab;
    return {
      opacity: on ? 1 : 0,
      zIndex: on ? 10 : 0,
      pointerEvents: on ? "auto" : "none",
      transition: "opacity 120ms ease-out",
    };
  };

  const dragCtl = "poracode-overlay-header__controls";
  const labels = usePanelTabLabels();
  const tabs = [
    {
      id: "docks",
      label: labels.docks,
      icon: PANEL_TAB_ICONS.docks,
      content: docksContent,
      visible: showDocksTab,
      onOpen: undefined,
    },
    {
      id: "subagent",
      label: labels.subagent,
      icon: PANEL_TAB_ICONS.subagent,
      content: subagentContent,
      visible: showSubagentTab,
      onOpen: undefined,
    },
    {
      id: "terminal",
      label: labels.terminal,
      icon: PANEL_TAB_ICONS.terminal,
      content: terminalContent,
      visible: showTerminalTab,
      onOpen: onOpenTerminal,
    },
    {
      id: "files",
      label: labels.files,
      icon: PANEL_TAB_ICONS.files,
      content: filesContent,
      visible: showFilesTab,
      onOpen: onOpenFiles,
    },
    {
      id: "git",
      label: labels.git,
      icon: PANEL_TAB_ICONS.git,
      content: gitContent,
      visible: showGitTab,
      onOpen: onOpenGit,
    },
    {
      id: "usage",
      label: labels.usage,
      icon: PANEL_TAB_ICONS.usage,
      content: usageContent,
      visible: showUsageTab,
      onOpen: onOpenUsage,
    },
    {
      id: "notes",
      label: labels.notes,
      icon: PANEL_TAB_ICONS.notes,
      content: notesContent,
      visible: showNotesTab,
      onOpen: onOpenNotes,
    },
    {
      id: "ports",
      label: labels.ports,
      icon: PANEL_TAB_ICONS.ports,
      content: portsContent,
      visible: showPortsTab,
      onOpen: onOpenPorts,
    },
    {
      id: "browser",
      label: labels.browser,
      icon: PANEL_TAB_ICONS.browser,
      content: browserContent,
      visible: showBrowserTab,
      onOpen: onOpenBrowser,
    },
  ] as const;

  const splitEntry =
    splitTab && splitTab !== activeTab
      ? tabs.find((tab) => tab.id === splitTab && tab.visible && tab.content !== undefined)
      : undefined;
  /** Painted right now: the active layer, the split section, or a bottom dock slot. */
  const isTabOnScreen = (tab: RightPanelTab) =>
    tab === activeTab || tab === splitEntry?.id || dockedTabs.includes(tab);

  return (
    <div
      data-poracode-panel=""
      className="flex h-full min-h-0 flex-col bg-[var(--content-background)]"
    >
      <div className={`poracode-overlay-header ${panelHeaderRowClass}`} data-active-tab={activeTab}>
        {hasSubagentModel ? (
          <div className="flex min-w-0 flex-1 items-center">{subagentModel}</div>
        ) : projectName ? (
          <PanelHeaderProjectName
            name={projectName}
            maxWidthClass="max-w-[100px]"
            triggerClassName={dragCtl}
          />
        ) : null}
        {hasSubagentModel ? null : <div className="flex-1" />}
        {activeTab === "git" && onExpandGitToOverlay && (
          <button
            type="button"
            className={`${dragCtl} ${panelHeaderIconButtonClass}`}
            title={t`Maximize`}
            onClick={onExpandGitToOverlay}
          >
            <Maximize2 className="size-3.5" />
          </button>
        )}
        {activeTab === "files" && onExpandFilesToOverlay && (
          <button
            type="button"
            className={`${dragCtl} ${panelHeaderIconButtonClass}`}
            title={t`Maximize`}
            onClick={onExpandFilesToOverlay}
          >
            <Maximize2 className="size-3.5" />
          </button>
        )}
        {activeTab === "browser" && onExpandBrowserToOverlay && (
          <button
            type="button"
            className={`${dragCtl} ${panelHeaderIconButtonClass}`}
            title={t`Maximize`}
            onClick={onExpandBrowserToOverlay}
          >
            <Maximize2 className="size-3.5" />
          </button>
        )}
        {activeTab === "browser" && onExtractBrowserToWindow && (
          <button
            type="button"
            className={`${dragCtl} ${panelHeaderIconButtonClass}`}
            title={t`Move browser to window`}
            onClick={onExtractBrowserToWindow}
          >
            <PictureInPicture2 className="size-3.5" />
          </button>
        )}
        {activeTab === "usage" ? usageHeaderActions : null}
        <div className="mx-0.5 h-3 w-px bg-border" />
        {tabs.map((tab) => {
          if (!tab.visible) return null;
          const Icon = tab.icon;
          // Lit whenever the panel is painted somewhere — the active layer, the
          // split half, or a bottom dock slot.
          const onScreen = isTabOnScreen(tab.id);
          const buttonClass = `${dragCtl} ${panelHeaderTabIconButtonClass(onScreen)}`;
          const handlePress = () => {
            if (tab.onOpen) tab.onOpen();
            else onTabChange(tab.id);
          };
          if (DOCKABLE_PANEL_TABS.has(tab.id)) {
            return (
              <PanelTabDragButton
                key={tab.id}
                tab={tab.id}
                label={tab.label}
                className={buttonClass}
                aria-pressed={onScreen}
                onPress={handlePress}
              >
                <Icon className="size-3.5" />
              </PanelTabDragButton>
            );
          }
          return (
            <button
              key={tab.id}
              type="button"
              className={buttonClass}
              title={tab.label}
              aria-pressed={onScreen}
              onClick={handlePress}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
        {onToggleFollowsThread ? (
          <button
            type="button"
            className={`${dragCtl} ${panelHeaderTabIconButtonClass(followsThread)}`}
            title={
              followsThread
                ? t`Unlock panel from the open thread`
                : t`Lock panel to the open thread`
            }
            aria-pressed={followsThread}
            onClick={onToggleFollowsThread}
          >
            {followsThread ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
          </button>
        ) : null}
        <button
          type="button"
          className={`${dragCtl} ${panelHeaderIconButtonClass}`}
          title={t`Hide panel`}
          onClick={onClose}
        >
          <PanelRightClose className="size-3.5" />
        </button>
      </div>
      {hasSubagentTitle ? (
        <div className="poracode-right-panel-subagent-meta flex h-6 shrink-0 items-center gap-2 border-b border-[color:var(--border)] px-3">
          <div className="min-w-0 flex-1">{subagentTitle}</div>
          {onCloseSubagent ? (
            <button
              type="button"
              className={`${dragCtl} ${panelHeaderIconButtonClass}`}
              title={t`Close subagent`}
              onClick={onCloseSubagent}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Content — stacked layers cross-fade on tab change; a dropped panel-tab
          splits this area into two stacked sections. */}
      <PanelDockDropZone
        zone="right-panel"
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {(() => {
          const layerStack = (
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {tabs.map((tab) =>
                tab.visible && tab.id !== splitEntry?.id ? (
                  <div
                    key={tab.id}
                    className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
                    style={tabLayerStyle(tab.id)}
                  >
                    {tab.content}
                  </div>
                ) : null,
              )}
            </div>
          );

          if (!splitEntry) return layerStack;

          const splitSection = (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <PanelSectionHeader
                tab={splitEntry.id}
                label={splitEntry.label}
                icon={splitEntry.icon}
                {...(onCloseSplit ? { onClose: onCloseSplit } : {})}
              />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {splitEntry.content}
              </div>
            </div>
          );

          return (
            <div ref={splitContainerRef} className="flex h-full min-h-0 flex-col">
              <div
                ref={splitFirstPaneRef}
                className="flex min-h-0 flex-col overflow-hidden"
                style={{ flexBasis: `${splitPercent}%`, flexGrow: 0, flexShrink: 0 }}
              >
                {splitPlacement === "top" ? splitSection : layerStack}
              </div>
              <div
                className="poracode-pane-divider-horizontal"
                onPointerDown={handleSplitResizeStart}
                onKeyDown={handleSplitResizeKeyDown}
                role="separator"
                tabIndex={0}
                aria-orientation="horizontal"
                aria-label={t`Resize split`}
                aria-valuenow={Math.round(splitPercent)}
                aria-valuemin={splitMinPercent}
                aria-valuemax={splitMaxPercent}
              />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {splitPlacement === "top" ? layerStack : splitSection}
              </div>
            </div>
          );
        })()}
      </PanelDockDropZone>
    </div>
  );
}
