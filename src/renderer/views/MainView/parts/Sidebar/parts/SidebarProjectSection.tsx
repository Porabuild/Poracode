import { useSortable } from "@dnd-kit/react/sortable";
import { useIsDraggingProject, type DragSourceData } from "@/renderer/dnd";
import { useProject } from "@/renderer/state/useThread";
import { useIsProjectCollapsed } from "@/renderer/state/sidebarUiStore";
import { type ThreadSortMode } from "./sortMode";
import { SidebarProjectHeader } from "./SidebarProjectHeader";
import { SidebarProjectThreadList } from "./SidebarProjectThreadList";

export function SidebarProjectSection(props: {
  projectId: string;
  projectIndex: number;
  sortMode: ThreadSortMode;
  growableProjectId: string | null;
}) {
  const project = useProject(props.projectId);
  const isProjectCollapsed = useIsProjectCollapsed(props.projectId);
  const { ref } = useSortable({
    id: `project:${props.projectId}`,
    index: props.projectIndex,
    type: "project",
    accept: "project",
    group: "projects",
    data: { type: "project", projectId: props.projectId } satisfies DragSourceData,
  });
  const isDragging = useIsDraggingProject(props.projectId);

  if (!project) return null;

  const showBody = !isProjectCollapsed && !project.disabled;

  return (
    <section ref={ref} className={`relative space-y-0.5 ${isDragging ? "opacity-60" : ""}`}>
      <SidebarProjectHeader
        project={project}
        isCollapsed={isProjectCollapsed}
        isDragging={isDragging}
      />
      {showBody ? (
        <SidebarProjectThreadList
          project={project}
          sortMode={props.sortMode}
          growableProjectId={props.growableProjectId}
        />
      ) : null}
    </section>
  );
}
