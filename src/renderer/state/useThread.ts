import { useRef } from "react";
import { useShallow } from "zustand/shallow";
import { useAppStore } from "./appStore";
import type { Project, ProjectDraftConfig, Thread } from "@/shared/contracts";

const threadMapCache = new WeakMap<Thread[], Map<string, Thread>>();
const projectMapCache = new WeakMap<Project[], Map<string, Project>>();

function getThreadMap(threads: Thread[]) {
  let threadMap = threadMapCache.get(threads);
  if (!threadMap) {
    threadMap = new Map(threads.map((thread) => [thread.id, thread]));
    threadMapCache.set(threads, threadMap);
  }
  return threadMap;
}

function getProjectMap(projects: Project[]) {
  let projectMap = projectMapCache.get(projects);
  if (!projectMap) {
    projectMap = new Map(projects.map((project) => [project.id, project]));
    projectMapCache.set(projects, projectMap);
  }
  return projectMap;
}

/**
 * Subscribe to a single thread by ID.
 *
 * The appStore's `updateThreadRuntime` preserves object identity for threads
 * that were not modified, so Zustand's default `Object.is` check will skip
 * re-renders for components whose thread did not change.
 */
export function useThread(threadId: string | undefined) {
  return useAppStore((s) => (threadId ? getThreadMap(s.threads).get(threadId) : undefined));
}

export function useProject(projectId: string | undefined) {
  return useAppStore((s) => (projectId ? getProjectMap(s.projects).get(projectId) : undefined));
}

function withoutDraftConfig(project: Project): Project {
  return {
    id: project.id,
    ...(project.remoteServerId ? { remoteServerId: project.remoteServerId } : {}),
    ...(project.remoteId ? { remoteId: project.remoteId } : {}),
    name: project.name,
    location: project.location,
    createdAt: project.createdAt,
    ...(project.scripts ? { scripts: project.scripts } : {}),
    ...(project.searchSettings ? { searchSettings: project.searchSettings } : {}),
    ...(project.disabled !== undefined ? { disabled: project.disabled } : {}),
  };
}

/**
 * Subscribe to project fields used by live draft panes, excluding
 * `lastDraftConfig`. Draft config writes happen on every composer selection;
 * they should persist settings without redrawing the active composer.
 */
export function useProjectWithoutDraftConfig(projectId: string | undefined) {
  return useAppStore(
    useShallow((s) => {
      const project = projectId ? getProjectMap(s.projects).get(projectId) : undefined;
      return project ? withoutDraftConfig(project) : undefined;
    }),
  );
}

export function useInitialProjectDraftConfig(
  projectId: string | undefined,
): ProjectDraftConfig | undefined {
  const snapshotRef = useRef<{
    projectId?: string;
    hasProject: boolean;
    value?: ProjectDraftConfig;
  }>({ hasProject: false });

  if (!projectId) {
    snapshotRef.current = { hasProject: false };
    return undefined;
  }

  if (snapshotRef.current.projectId !== projectId || !snapshotRef.current.hasProject) {
    const project = getProjectMap(useAppStore.getState().projects).get(projectId);
    if (project) {
      snapshotRef.current = {
        projectId,
        hasProject: true,
        ...(project.lastDraftConfig ? { value: project.lastDraftConfig } : {}),
      };
    }
  }

  return snapshotRef.current.value;
}

export function useProjectIds() {
  return useAppStore(useShallow((s) => s.projects.map((project) => project.id)));
}

/**
 * Subscribe to the ordered list of thread IDs.
 *
 * Uses `useShallow` so the selector only triggers a re-render when threads
 * are added, removed, or reordered — not when an existing thread's status
 * changes.
 */
export function useThreadIds() {
  return useAppStore(useShallow((s) => s.threads.map((t) => t.id)));
}
