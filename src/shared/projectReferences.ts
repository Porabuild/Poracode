import type { AppView, Thread } from "./contracts";
import { isDraftPaneId, parseDraftProjectId } from "./paneId";
import type { PaneLayout } from "./paneLayout";

export function remapProjectView(
  view: AppView,
  duplicateIds: ReadonlyMap<string, string>,
): AppView {
  if (view.kind === "draft" || view.kind === "experiment") {
    const projectId = duplicateIds.get(view.projectId);
    return projectId ? { ...view, projectId } : view;
  }
  if (view.kind !== "thread") return view;
  return remapProjectPanes(view, duplicateIds);
}

interface ProjectPanes {
  panes: string[];
  paneLayout?: PaneLayout;
}

function remapProjectPanes<T extends ProjectPanes>(
  state: T,
  duplicateIds: ReadonlyMap<string, string>,
): T {
  const panes = state.panes.map((paneId) => remapPaneId(paneId, duplicateIds));
  const paneLayout = state.paneLayout ? remapPaneLayout(state.paneLayout, duplicateIds) : undefined;
  return panes.every((paneId, index) => paneId === state.panes[index]) &&
    paneLayout === state.paneLayout
    ? state
    : {
        ...state,
        panes,
        ...(paneLayout ? { paneLayout } : {}),
      };
}

export function remapProjectGroupLayouts<T extends ProjectPanes>(
  layouts: Record<string, T>,
  duplicateIds: ReadonlyMap<string, string>,
): Record<string, T> {
  let changed = false;
  const entries = Object.entries(layouts).map(([groupId, layout]) => {
    const next = remapProjectPanes(layout, duplicateIds);
    changed ||= next !== layout;
    return [groupId, next] as const;
  });
  return changed ? Object.fromEntries(entries) : layouts;
}

export function remapThreadProjectIds(
  threads: readonly Thread[],
  duplicateIds: ReadonlyMap<string, string>,
): Thread[] {
  return threads.map((thread) => {
    const projectId = duplicateIds.get(thread.projectId);
    return projectId ? { ...thread, projectId } : thread;
  });
}

export function remapPaneId(paneId: string, duplicateIds: ReadonlyMap<string, string>): string {
  if (!isDraftPaneId(paneId)) return paneId;
  const projectId = parseDraftProjectId(paneId);
  const canonicalId = projectId ? duplicateIds.get(projectId) : undefined;
  return canonicalId ? paneId.replace(`draft:${projectId}`, `draft:${canonicalId}`) : paneId;
}

function remapPaneLayout(
  layout: PaneLayout,
  duplicateIds: ReadonlyMap<string, string>,
): PaneLayout {
  if (layout.kind === "leaf") {
    const paneId = remapPaneId(layout.paneId, duplicateIds);
    return paneId === layout.paneId ? layout : { ...layout, paneId };
  }
  const children = layout.children.map((child) => remapPaneLayout(child, duplicateIds)) as [
    PaneLayout,
    PaneLayout,
    ...PaneLayout[],
  ];
  return children.every((child, index) => child === layout.children[index])
    ? layout
    : { ...layout, children };
}
