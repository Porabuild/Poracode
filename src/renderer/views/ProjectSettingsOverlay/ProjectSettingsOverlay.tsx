import { useState } from "react";
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
import { SkillsSection } from "./parts/SkillsSection";
import type { ProjectSettingsSection } from "./parts/types";

export { resolveActionIcon } from "@/renderer/utils/actionIcons";

type CompactSettingsPage = "index" | "section";

export function ProjectSettingsOverlay(props: { projectId: string; onClose: () => void }) {
  const { projectId, onClose } = props;
  const { t } = useLingui();
  const compactLayout = useCompactLayout();
  const projectName = useAppStore(
    (s) => s.projects.find((p) => p.id === projectId)?.name ?? t`Project`,
  );
  const [activeSection, setActiveSection] = useState<ProjectSettingsSection>("general");
  const [compactPage, setCompactPage] = useState<CompactSettingsPage>("index");
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
              : t`Search`;

  const sectionContent =
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
    ) : activeSection === "search" ? (
      <SearchSection projectId={projectId} />
    ) : null;

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
