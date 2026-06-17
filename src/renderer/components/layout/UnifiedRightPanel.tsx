import { type CSSProperties, type ReactNode } from "react";
import {
  FileDiff,
  FolderOpen,
  Gauge,
  Globe,
  Maximize2,
  NotebookPen,
  PanelRightClose,
  TerminalSquare,
} from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { PanelHeaderProjectName } from "@/renderer/components/layout/PanelHeaderProjectName";
import {
  panelHeaderIconButtonClass,
  panelHeaderRowClass,
  panelHeaderTabIconButtonClass,
} from "@/renderer/components/layout/sidebarChrome";
import type { RightPanelTab } from "@/renderer/state/panelStore";

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
  /** Tab-specific action buttons rendered in the header when the usage tab is active. */
  usageHeaderActions?: ReactNode;
  showTerminalTab?: boolean;
  showFilesTab?: boolean;
  showGitTab?: boolean;
  showUsageTab?: boolean;
  showNotesTab?: boolean;
  projectName: string | undefined;
  onExpandGitToOverlay?: () => void;
  onExpandFilesToOverlay?: () => void;
  onExpandBrowserToOverlay?: () => void;
  onOpenGit?: () => void;
  onOpenTerminal?: () => void;
  onOpenFiles?: () => void;
  onOpenBrowser?: () => void;
  onOpenUsage?: () => void;
  onOpenNotes?: () => void;
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
    usageHeaderActions,
    showTerminalTab = true,
    showFilesTab = true,
    showGitTab = true,
    showUsageTab = true,
    showNotesTab = true,
    projectName,
    onExpandGitToOverlay,
    onExpandFilesToOverlay,
    onExpandBrowserToOverlay,
    onOpenGit,
    onOpenTerminal,
    onOpenFiles,
    onOpenBrowser,
    onOpenUsage,
    onOpenNotes,
    onClose,
  } = props;
  const { t } = useLingui();

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

  const dragCtl = "lightcode-overlay-header__controls";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--content-background)]">
      <div className={`lightcode-overlay-header ${panelHeaderRowClass}`}>
        {projectName && (
          <PanelHeaderProjectName
            name={projectName}
            maxWidthClass="max-w-[100px]"
            triggerClassName={dragCtl}
          />
        )}
        <div className="flex-1" />
        {activeTab === "git" && onExpandGitToOverlay && (
          <button
            type="button"
            className={`${dragCtl} ${panelHeaderIconButtonClass}`}
            title={t`Maximize`}
            onClick={onExpandGitToOverlay}
          >
            <Maximize2 className="size-3" />
          </button>
        )}
        {activeTab === "files" && onExpandFilesToOverlay && (
          <button
            type="button"
            className={`${dragCtl} ${panelHeaderIconButtonClass}`}
            title={t`Maximize`}
            onClick={onExpandFilesToOverlay}
          >
            <Maximize2 className="size-3" />
          </button>
        )}
        {activeTab === "browser" && onExpandBrowserToOverlay && (
          <button
            type="button"
            className={`${dragCtl} ${panelHeaderIconButtonClass}`}
            title={t`Maximize`}
            onClick={onExpandBrowserToOverlay}
          >
            <Maximize2 className="size-3" />
          </button>
        )}
        {activeTab === "usage" ? usageHeaderActions : null}
        <div className="mx-0.5 h-3 w-px bg-border" />
        {showTerminalTab ? (
          <button
            type="button"
            className={`${dragCtl} ${panelHeaderTabIconButtonClass(activeTab === "terminal")}`}
            title={t`Terminal`}
            onClick={() => {
              if (onOpenTerminal) onOpenTerminal();
              else onTabChange("terminal");
            }}
          >
            <TerminalSquare className="size-3.5" />
          </button>
        ) : null}
        {showFilesTab ? (
          <button
            type="button"
            className={`${dragCtl} ${panelHeaderTabIconButtonClass(activeTab === "files")}`}
            title={t`Files`}
            onClick={() => {
              if (onOpenFiles) onOpenFiles();
              else onTabChange("files");
            }}
          >
            <FolderOpen className="size-3.5" />
          </button>
        ) : null}
        {showGitTab ? (
          <button
            type="button"
            className={`${dragCtl} ${panelHeaderTabIconButtonClass(activeTab === "git")}`}
            title={t`Git`}
            onClick={() => {
              if (onOpenGit) onOpenGit();
              else onTabChange("git");
            }}
          >
            <FileDiff className="size-3.5" />
          </button>
        ) : null}
        {showUsageTab ? (
          <button
            type="button"
            className={`${dragCtl} ${panelHeaderTabIconButtonClass(activeTab === "usage")}`}
            title={t`Usage`}
            onClick={() => {
              if (onOpenUsage) onOpenUsage();
              else onTabChange("usage");
            }}
          >
            <Gauge className="size-3.5" />
          </button>
        ) : null}
        {showNotesTab ? (
          <button
            type="button"
            className={`${dragCtl} ${panelHeaderTabIconButtonClass(activeTab === "notes")}`}
            title={t`Notes`}
            onClick={() => {
              if (onOpenNotes) onOpenNotes();
              else onTabChange("notes");
            }}
          >
            <NotebookPen className="size-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          className={`${dragCtl} ${panelHeaderTabIconButtonClass(activeTab === "browser")}`}
          title={t`Browser`}
          onClick={() => {
            if (onOpenBrowser) onOpenBrowser();
            else onTabChange("browser");
          }}
        >
          <Globe className="size-3.5" />
        </button>
        <button
          type="button"
          className={`${dragCtl} ${panelHeaderIconButtonClass}`}
          title={t`Hide panel`}
          onClick={onClose}
        >
          <PanelRightClose className="size-3.5" />
        </button>
      </div>

      {/* Content — stacked layers cross-fade on tab change */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {showTerminalTab ? (
          <div className="absolute inset-0 overflow-hidden" style={tabLayerStyle("terminal")}>
            {terminalContent}
          </div>
        ) : null}
        <div className="absolute inset-0 overflow-hidden" style={tabLayerStyle("git")}>
          {gitContent}
        </div>
        <div className="absolute inset-0 overflow-hidden" style={tabLayerStyle("files")}>
          {filesContent}
        </div>
        <div className="absolute inset-0 overflow-hidden" style={tabLayerStyle("browser")}>
          {browserContent}
        </div>
        <div className="absolute inset-0 overflow-hidden" style={tabLayerStyle("usage")}>
          {usageContent}
        </div>
        <div className="absolute inset-0 overflow-hidden" style={tabLayerStyle("notes")}>
          {notesContent}
        </div>
      </div>
    </div>
  );
}
