import { useState, type CSSProperties } from "react";
import { useLingui } from "@lingui/react/macro";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { useProductViewTracking } from "@/renderer/analytics/useProductViewTracking";
import { useAppStore } from "@/renderer/state/appStore";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { SettingsSidebar } from "./parts/SettingsSidebar";
import { MobileProjectSettingsIndex } from "./parts/MobileProjectSettingsIndex";
import { GeneralSection } from "./parts/GeneralSection";
import { ScriptsSection } from "./parts/ScriptsSection";
import { ActionsSection } from "./parts/ActionsSection";
import { SearchSection } from "./parts/SearchSection";
import { McpSection } from "./parts/McpSection";
import { PluginsSection } from "./parts/PluginsSection";
import { SkillsSection } from "./parts/SkillsSection";
import type { ProjectSettingsSection } from "./parts/types";
import { useProjectEnvironmentMachines } from "@/renderer/components/common/ProjectEnvironment";
import {
  PROJECT_SETTINGS_SCOPE_BAR_SPACE,
  ProjectEnvironmentScopeBar,
} from "./parts/ProjectEnvironmentScope";

export { resolveActionIcon } from "@/renderer/utils/actionIcons";

type CompactSettingsPage = "index" | "section";

export function ProjectSettingsOverlay(props: {
  projectId: string;
  /** Deep-link target; mounts keyed on it, so it only seeds the first page. */
  initialSection?: ProjectSettingsSection | null;
  onClose: () => void;
}) {
  const { projectId, onClose } = props;
  const { t } = useLingui();
  const compactLayout = useCompactLayout();
  const projectName = useAppStore(
    (s) => s.projects.find((p) => p.id === projectId)?.name ?? t`Project`,
  );
  const showsScopeBar = useProjectEnvironmentMachines(projectId).length > 1;
  const [activeSection, setActiveSection] = useState<ProjectSettingsSection>(
    props.initialSection ?? "general",
  );
  const [compactPage, setCompactPage] = useState<CompactSettingsPage>(
    props.initialSection ? "section" : "index",
  );
  useProductViewTracking(
    {
      key: `project-settings:${activeSection}`,
      seenEvent: "settings.section_seen",
      durationEvent: "settings.section_duration",
      properties: {
        settings_scope: "project",
        settings_section: activeSection,
      },
    },
    "project_settings",
  );

  function openSection(section: ProjectSettingsSection) {
    setActiveSection(section);
    if (compactLayout) setCompactPage("section");
  }

  const sectionTitle =
    activeSection === "general"
      ? t`General`
      : activeSection === "worktrees"
        ? t`Worktrees`
        : activeSection === "actions"
          ? t`Actions`
          : activeSection === "skills"
            ? t`Skills`
            : activeSection === "mcp"
              ? t`MCP Servers`
              : activeSection === "plugins"
                ? t`Plugins`
                : t`Search`;

  const sectionBody =
    activeSection === "general" ? (
      <GeneralSection projectId={projectId} />
    ) : activeSection === "worktrees" ? (
      <ScriptsSection projectId={projectId} />
    ) : activeSection === "actions" ? (
      <ActionsSection projectId={projectId} />
    ) : activeSection === "skills" ? (
      <SkillsSection projectId={projectId} />
    ) : activeSection === "mcp" ? (
      <McpSection projectId={projectId} />
    ) : activeSection === "plugins" ? (
      <PluginsSection projectId={projectId} />
    ) : activeSection === "search" ? (
      <SearchSection projectId={projectId} />
    ) : null;
  // Like the Settings scope pill: floats over the section on desktop, and the
  // section reserves room below its last row through a CSS variable. Compact
  // layouts keep the picker in the page flow, clear of bottom page actions.
  const sectionContent = compactLayout ? (
    <div className="flex h-full min-h-0 flex-col">
      <ProjectEnvironmentScopeBar
        projectId={projectId}
        section={activeSection}
        placement="inline"
      />
      <div className="min-h-0 flex-1">{sectionBody}</div>
    </div>
  ) : (
    <div
      className="relative h-full min-h-0"
      style={
        showsScopeBar
          ? ({
              "--project-settings-bottom-space": PROJECT_SETTINGS_SCOPE_BAR_SPACE,
            } as CSSProperties)
          : undefined
      }
    >
      {sectionBody}
      <ProjectEnvironmentScopeBar
        projectId={projectId}
        section={activeSection}
        placement="floating"
      />
    </div>
  );

  return (
    <PageLayout
      title={t`${projectName} Settings`}
      compactTitle={compactPage === "section" ? sectionTitle : t`${projectName} Settings`}
      compactBackLabel={compactPage === "index" ? t`Return to app` : t`Back`}
      onCompactBack={() => {
        if (compactPage === "section") {
          setCompactPage("index");
          return;
        }
        onClose();
      }}
      mobileNavigation
      sidebar={
        <SettingsSidebar
          activeSection={activeSection}
          onSectionChange={openSection}
          onClose={onClose}
        />
      }
      content={
        compactLayout && compactPage === "index" ? (
          <MobileProjectSettingsIndex onOpenSection={openSection} />
        ) : compactLayout ? (
          <div
            className={`m-settings__body${activeSection === "actions" ? " m-settings__body--actions" : ""}`}
          >
            {sectionContent}
          </div>
        ) : (
          sectionContent
        )
      }
    />
  );
}
