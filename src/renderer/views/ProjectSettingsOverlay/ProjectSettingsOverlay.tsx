import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useAppStore } from "@/renderer/state/appStore";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { SettingsSidebar } from "./parts/SettingsSidebar";
import { GeneralSection } from "./parts/GeneralSection";
import { ScriptsSection } from "./parts/ScriptsSection";
import { ActionsSection } from "./parts/ActionsSection";
import { SearchSection } from "./parts/SearchSection";
import { McpSection } from "./parts/McpSection";
import { SkillsSection } from "./parts/SkillsSection";
import type { ProjectSettingsSection } from "./parts/types";

export { resolveActionIcon } from "@/renderer/utils/actionIcons";

export function ProjectSettingsOverlay(props: { projectId: string; onClose: () => void }) {
  const { projectId, onClose } = props;
  const { t } = useLingui();
  const projectName = useAppStore(
    (s) => s.projects.find((p) => p.id === projectId)?.name ?? t`Project`,
  );
  const [activeSection, setActiveSection] = useState<ProjectSettingsSection>("general");

  return (
    <PageLayout
      title={t`${projectName} Settings`}
      sidebar={
        <SettingsSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onClose={onClose}
        />
      }
      content={
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
        ) : null
      }
    />
  );
}
