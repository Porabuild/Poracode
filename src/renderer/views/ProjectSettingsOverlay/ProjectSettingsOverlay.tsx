import { useEffect, useState } from "react";
import { useAppStore } from "@/renderer/state/appStore";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { SettingsSidebar } from "./parts/SettingsSidebar";
import { GeneralSection } from "./parts/GeneralSection";
import { ScriptsSection } from "./parts/ScriptsSection";
import { ActionsSection } from "./parts/ActionsSection";
import { SearchSection } from "./parts/SearchSection";
import { AgentsSection } from "./parts/AgentsSection";
import type { ProjectSettingsSection } from "./parts/types";

export { resolveActionIcon } from "@/renderer/utils/actionIcons";

export function ProjectSettingsOverlay(props: {
  projectId: string;
  initialSection?: ProjectSettingsSection;
  onClose: () => void;
}) {
  const { projectId, onClose } = props;
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId));
  const projectName = project?.name ?? "Project";
  const showAgents = project?.location.kind === "ssh";
  const resolvedInitialSection =
    props.initialSection === "agents" && !showAgents
      ? "general"
      : (props.initialSection ?? "general");
  const [activeSection, setActiveSection] =
    useState<ProjectSettingsSection>(resolvedInitialSection);

  useEffect(() => {
    setActiveSection(resolvedInitialSection);
  }, [resolvedInitialSection]);

  return (
    <PageLayout
      title={`${projectName} Settings`}
      sidebar={
        <SettingsSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onClose={onClose}
          showAgents={showAgents}
        />
      }
      content={
        activeSection === "general" ? (
          <GeneralSection projectId={projectId} />
        ) : activeSection === "worktrees" ? (
          <ScriptsSection projectId={projectId} />
        ) : activeSection === "actions" ? (
          <ActionsSection projectId={projectId} />
        ) : activeSection === "search" ? (
          <SearchSection projectId={projectId} />
        ) : activeSection === "agents" && showAgents ? (
          <AgentsSection projectId={projectId} />
        ) : null
      }
    />
  );
}
