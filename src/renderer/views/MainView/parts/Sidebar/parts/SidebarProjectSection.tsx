import { useSortable } from "@dnd-kit/react/sortable";
import { useIsDraggingProject, type DragSourceData } from "@/renderer/dnd";
import { useProject } from "@/renderer/state/useThread";
import { useIsProjectCollapsed } from "@/renderer/state/sidebarUiStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { isRemoteProjectStatusUnreachable } from "@/renderer/state/remoteServers/reachability";
import { type ThreadSortMode } from "./sortMode";
import { SidebarProjectHeader } from "./SidebarProjectHeader";
import { SidebarProjectThreadList } from "./SidebarProjectThreadList";

export function SidebarProjectSection(props: {
  projectId: string;
  projectIndex: number;
  sortMode: ThreadSortMode;
}) {
  const project = useProject(props.projectId);
  const isProjectCollapsed = useIsProjectCollapsed(props.projectId);
  const remoteStatus = useRemoteServersStore((state) =>
    project?.remoteServerId ? state.runtime[project.remoteServerId]?.status : undefined,
  );
  const { ref } = useSortable({
    id: `project:${props.projectId}`,
    index: props.projectIndex,
    type: "project",
    accept: "project",
    group: "projects",
    data: { type: "project", projectId: props.projectId } satisfies DragSourceData,
    disabled: project?.remoteServerId !== undefined,
  });
  const isDragging = useIsDraggingProject(props.projectId);

  if (!project) return null;

  const isUnreachable = isRemoteProjectStatusUnreachable(project, remoteStatus);
  const isUnavailable = !!project.disabled || isUnreachable;
  const showBody = !isProjectCollapsed && !isUnavailable;

  return (
    <section ref={ref} className={`relative space-y-0.5 ${isDragging ? "opacity-60" : ""}`}>
      <SidebarProjectHeader
        project={project}
        isCollapsed={isProjectCollapsed}
        isDragging={isDragging}
        isUnreachable={isUnreachable}
      />
      {showBody ? <SidebarProjectThreadList project={project} sortMode={props.sortMode} /> : null}
    </section>
  );
}
