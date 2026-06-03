import {
  ArrowLeft,
  Bot,
  GitFork,
  PanelLeft,
  PanelLeftClose,
  Play,
  Search,
  Settings2,
} from "lucide-react";
import {
  overlaySidebarColumnClass,
  overlaySidebarSurfaceClass,
  sidebarBodyScrollClass,
  sidebarFooterNavClass,
  sidebarIconRailFooterClass,
} from "@/renderer/components/layout/sidebarChrome";
import { SidebarButton } from "@/renderer/components/common";
import { useSidebar } from "@/renderer/views/MainView/parts/AppShell/AppShell";
import type { ProjectSettingsSection } from "./types";

export function SettingsSidebar(props: {
  activeSection: ProjectSettingsSection;
  onSectionChange: (section: ProjectSettingsSection) => void;
  onClose: () => void;
  showAgents?: boolean;
}) {
  const { activeSection, onSectionChange, onClose, showAgents } = props;
  const { isCollapsed, collapse, expand } = useSidebar();

  const sections: { id: ProjectSettingsSection; icon: React.ReactNode; label: string }[] = [
    { id: "general", icon: <Settings2 className="size-4" />, label: "General" },
    ...(showAgents
      ? [{ id: "agents" as const, icon: <Bot className="size-4" />, label: "Agents" }]
      : []),
    { id: "worktrees", icon: <GitFork className="size-4" />, label: "Worktrees" },
    { id: "actions", icon: <Play className="size-4" />, label: "Actions" },
    { id: "search", icon: <Search className="size-4" />, label: "Search" },
  ];

  return (
    <div className={`relative h-full ${overlaySidebarSurfaceClass}`}>
      {isCollapsed && (
        <div className="absolute inset-0 z-10 flex h-full min-h-0 flex-col items-start gap-3 pl-2 pb-1 pt-0">
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {sections.map((s) => (
              <SidebarButton
                key={s.id}
                iconOnly
                icon={s.icon}
                label={s.label}
                isActive={activeSection === s.id}
                onPress={() => onSectionChange(s.id)}
              />
            ))}
          </div>
          <div className={sidebarIconRailFooterClass}>
            <SidebarButton
              iconOnly
              icon={<ArrowLeft className="size-4" />}
              label="Return to app"
              onPress={onClose}
            />
            <SidebarButton
              iconOnly
              icon={<PanelLeft className="size-4" />}
              label="Show sidebar"
              onPress={expand}
            />
          </div>
        </div>
      )}

      <div
        className={`${overlaySidebarColumnClass} transition-opacity duration-150 ${isCollapsed ? "invisible opacity-0" : "opacity-100 delay-100"}`}
      >
        <div className={sidebarBodyScrollClass()}>
          <div className="space-y-0.5">
            {sections.map((s) => (
              <SidebarButton
                key={s.id}
                icon={s.icon}
                label={s.label}
                isActive={activeSection === s.id}
                onPress={() => onSectionChange(s.id)}
              />
            ))}
          </div>
        </div>

        <div className={sidebarFooterNavClass}>
          <SidebarButton
            icon={<ArrowLeft className="size-4" />}
            label="Return to app"
            onPress={onClose}
          />
          <SidebarButton
            icon={<PanelLeftClose className="size-4" />}
            label="Hide sidebar"
            onPress={collapse}
          />
        </div>
      </div>
    </div>
  );
}
