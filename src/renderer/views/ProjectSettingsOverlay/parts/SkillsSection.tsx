import { useAppStore } from "@/renderer/state/appStore";
import { SkillsManager } from "@/renderer/components/skills";

/**
 * Project settings → Skills. Shows the project's `.claude/skills` and
 * `.agents/skills` scopes plus the inherited global skills underneath.
 */
export function SkillsSection(props: { projectId: string }) {
  const project = useAppStore((s) => s.projects.find((p) => p.id === props.projectId));

  // If the project was removed while the overlay is open, say so rather than
  // silently degrading to a global-only view that still claims to be project-scoped.
  if (!project) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted">
        This project is no longer available.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4">
      <SkillsManager mode="project" projectLocation={project.location} />
    </div>
  );
}
