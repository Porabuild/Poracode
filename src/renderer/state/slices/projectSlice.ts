import type {
  Project,
  ProjectDraftConfig,
  ProjectLocation,
  ProjectScripts,
  ProjectSearchSettings,
  ProjectWorktreeLocation,
  AppView,
  GitHubAccountRef,
  McpServer,
} from "@/shared/contracts";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import { isDraftPaneId, parseDraftProjectId } from "@/shared/paneId";
import { getProjectName } from "@/shared/wsl";
import { reorderIds, type ReorderPlacement } from "../reorder";
import { removePaneFromView } from "./helpers";
import type { SliceCreator } from "./shared";

function projectDraftConfigEqual(
  a: ProjectDraftConfig | undefined,
  b: ProjectDraftConfig,
): boolean {
  return (
    a !== undefined &&
    a.agentKind === b.agentKind &&
    a.model === b.model &&
    a.effort === b.effort &&
    a.contextSize === b.contextSize &&
    a.fast === b.fast &&
    a.thinking === b.thinking &&
    a.mode === b.mode &&
    a.approvalPolicy === b.approvalPolicy &&
    a.approvalsReviewer === b.approvalsReviewer &&
    a.sandboxMode === b.sandboxMode &&
    a.worktreeMode === b.worktreeMode
  );
}

export interface ProjectSlice {
  projects: Project[];
  addProject: (
    location: ProjectLocation,
    nameOverride?: string,
    /** Workspace to file the new project into; omitted leaves it visible in every workspace. */
    workspaceId?: string,
  ) => Project;
  ensureHomeProject: (location: ProjectLocation) => Project;
  deleteProject: (projectId: string) => void;
  updateProjectDraftConfig: (projectId: string, draftConfig: ProjectDraftConfig) => void;
  updateProjectScripts: (projectId: string, scripts: ProjectScripts) => void;
  updateProjectSearchSettings: (
    projectId: string,
    searchSettings: ProjectSearchSettings | undefined,
  ) => void;
  updateProjectWorktreeLocation: (
    projectId: string,
    worktreeLocation: ProjectWorktreeLocation | undefined,
  ) => void;
  /** `undefined` clears the override (supervisor auto-detects the account). */
  updateProjectGhAccount: (projectId: string, ghAccount: GitHubAccountRef | undefined) => void;
  /** An empty list clears the project override entirely. */
  updateProjectMcpServers: (projectId: string, mcpServers: McpServer[]) => void;
  updateProjectLocation: (projectId: string, location: ProjectLocation) => void;
  renameProject: (projectId: string, name: string) => void;
  /** Move a project into a workspace; `undefined` unfiles it (visible in every workspace). */
  setProjectWorkspace: (projectId: string, workspaceId: string | undefined) => void;
  /**
   * Move every project currently in `from` into `to`, where `undefined` means
   * "unfiled". Serves both the first-run bootstrap (`undefined` → the default
   * workspace, so an existing install lands wholly in it) and workspace deletion
   * (the doomed workspace → a surviving one). Never deletes projects, and leaves
   * the synthetic Home project unfiled.
   */
  refileProjects: (from: string | undefined, to: string) => void;
  setProjectDisabled: (projectId: string, disabled: boolean) => void;
  reorderProjects: (sourceId: string, targetId: string, placement: ReorderPlacement) => void;
}

export const createProjectSlice: SliceCreator<ProjectSlice> = (set) => ({
  projects: [],
  addProject: (location, nameOverride, workspaceId) => {
    const project: Project = {
      id: crypto.randomUUID(),
      name: nameOverride?.trim() || getProjectName(location),
      location,
      ...(workspaceId ? { workspaceId } : {}),
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      projects: [project, ...state.projects],
    }));

    return project;
  },
  ensureHomeProject: (location) => {
    let ensured: Project | undefined;

    set((state) => {
      const existing = state.projects.find((project) => project.id === HOME_PROJECT_ID);
      if (!existing) {
        ensured = {
          id: HOME_PROJECT_ID,
          name: HOME_PROJECT_NAME,
          location,
          disabled: true,
          createdAt: new Date().toISOString(),
        };
        return { projects: [ensured, ...state.projects] };
      }

      if (
        existing.name === HOME_PROJECT_NAME &&
        existing.disabled === true &&
        projectLocationsEqual(existing.location, location)
      ) {
        ensured = existing;
        return {};
      }

      ensured = { ...existing, name: HOME_PROJECT_NAME, location, disabled: true };
      const next = ensured;
      return {
        projects: state.projects.map((project) =>
          project.id === HOME_PROJECT_ID ? next : project,
        ),
      };
    });

    return ensured!;
  },
  deleteProject: (projectId) =>
    set((state) => {
      const nextProjects = state.projects.filter((project) => project.id !== projectId);

      if (nextProjects.length === state.projects.length) {
        return {};
      }

      const projectThreadIds = new Set(
        state.threads.filter((thread) => thread.projectId === projectId).map((thread) => thread.id),
      );

      const nextThreads = state.threads.filter((thread) => thread.projectId !== projectId);

      const nextPendingThreadLaunches = Object.fromEntries(
        Object.entries(state.pendingThreadLaunches).filter(
          ([threadId]) => !projectThreadIds.has(threadId),
        ),
      );
      const nextPendingLaunchSegments = Object.fromEntries(
        Object.entries(state.pendingLaunchSegments).filter(
          ([threadId]) => !projectThreadIds.has(threadId),
        ),
      );
      const nextPendingLaunchUserMessageItemIds = Object.fromEntries(
        Object.entries(state.pendingLaunchUserMessageItemIds).filter(
          ([threadId]) => !projectThreadIds.has(threadId),
        ),
      );
      const nextProvisioningWorktreeThreadIds = Object.fromEntries(
        Object.entries(state.provisioningWorktreeThreadIds).filter(
          ([threadId]) => !projectThreadIds.has(threadId),
        ),
      ) as Record<string, true>;

      const { [projectId]: _draft, ...nextDraftContents } = state.draftContents;
      const nextThreadDraftContents = Object.fromEntries(
        Object.entries(state.threadDraftContents).filter(
          ([threadId]) => !projectThreadIds.has(threadId),
        ),
      );

      let nextView = state.view;
      if (
        (state.view.kind === "draft" || state.view.kind === "experiment") &&
        state.view.projectId === projectId
      ) {
        nextView = { kind: "home" };
      } else if (state.view.kind === "thread") {
        nextView = state.view.panes.reduce<AppView>((view, paneId) => {
          if (view.kind !== "thread") return view;
          const shouldRemove = isDraftPaneId(paneId)
            ? parseDraftProjectId(paneId) === projectId
            : projectThreadIds.has(paneId);
          return shouldRemove ? removePaneFromView(view, paneId) : view;
        }, state.view);
      }

      return {
        projects: nextProjects,
        threads: nextThreads,
        pendingThreadLaunches: nextPendingThreadLaunches,
        pendingLaunchSegments: nextPendingLaunchSegments,
        pendingLaunchUserMessageItemIds: nextPendingLaunchUserMessageItemIds,
        provisioningWorktreeThreadIds: nextProvisioningWorktreeThreadIds,
        draftContents: nextDraftContents,
        threadDraftContents: nextThreadDraftContents,
        view: nextView,
      };
    }),
  updateProjectDraftConfig: (projectId, draftConfig) =>
    set((state) => {
      const project = state.projects.find((item) => item.id === projectId);
      if (!project || projectDraftConfigEqual(project.lastDraftConfig, draftConfig)) {
        return {};
      }
      return {
        projects: state.projects.map((item) =>
          item.id === projectId ? { ...item, lastDraftConfig: draftConfig } : item,
        ),
      };
    }),
  updateProjectScripts: (projectId, scripts) =>
    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === projectId ? { ...project, scripts } : project,
      ),
    })),
  updateProjectSearchSettings: (projectId, searchSettings) =>
    set((state) => ({
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        if (!searchSettings) {
          const { searchSettings: _, ...rest } = project;
          return rest;
        }
        return { ...project, searchSettings };
      }),
    })),
  updateProjectWorktreeLocation: (projectId, worktreeLocation) =>
    set((state) => ({
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        if (!worktreeLocation) {
          const { worktreeLocation: _, ...rest } = project;
          return rest;
        }
        return { ...project, worktreeLocation };
      }),
    })),
  updateProjectGhAccount: (projectId, ghAccount) =>
    set((state) => ({
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        if (!ghAccount) {
          const { ghAccount: _, ...rest } = project;
          return rest;
        }
        return { ...project, ghAccount };
      }),
    })),
  updateProjectMcpServers: (projectId, mcpServers) =>
    set((state) => ({
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        if (mcpServers.length === 0) {
          const { mcpServers: _, ...rest } = project;
          return rest;
        }
        return { ...project, mcpServers };
      }),
    })),
  updateProjectLocation: (projectId, location) =>
    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === projectId ? { ...project, location } : project,
      ),
    })),
  renameProject: (projectId, name) =>
    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === projectId ? { ...project, name } : project,
      ),
    })),
  setProjectWorkspace: (projectId, workspaceId) =>
    set((state) => {
      const target = state.projects.find((project) => project.id === projectId);
      if (!target || target.workspaceId === workspaceId) return {};
      return {
        projects: state.projects.map((project) => {
          if (project.id !== projectId) return project;
          if (!workspaceId) {
            const { workspaceId: _, ...rest } = project;
            return rest;
          }
          return { ...project, workspaceId };
        }),
      };
    }),
  refileProjects: (from, to) =>
    set((state) => {
      if (from === to) return {};
      // Home is synthetic and belongs to every workspace, so it stays unfiled.
      const shouldMove = (project: Project) =>
        project.workspaceId === from && project.id !== HOME_PROJECT_ID;
      if (!state.projects.some(shouldMove)) return {};
      return {
        projects: state.projects.map((project) =>
          shouldMove(project) ? { ...project, workspaceId: to } : project,
        ),
      };
    }),
  setProjectDisabled: (projectId, disabled) =>
    set((state) => {
      const target = state.projects.find((p) => p.id === projectId);
      if (!target) return {};
      if ((target.disabled ?? false) === disabled) return {};

      const nextProjects = state.projects.map((project) => {
        if (project.id !== projectId) return project;
        if (disabled) return { ...project, disabled: true };
        const { disabled: _, ...rest } = project;
        return rest;
      });

      if (!disabled) {
        return { projects: nextProjects };
      }

      const projectThreadIds = new Set(
        state.threads.filter((thread) => thread.projectId === projectId).map((thread) => thread.id),
      );

      let nextView = state.view;
      if (
        (state.view.kind === "draft" || state.view.kind === "experiment") &&
        state.view.projectId === projectId
      ) {
        nextView = { kind: "home" };
      } else if (state.view.kind === "thread") {
        nextView = state.view.panes.reduce<AppView>((view, paneId) => {
          if (view.kind !== "thread") return view;
          const shouldRemove = isDraftPaneId(paneId)
            ? parseDraftProjectId(paneId) === projectId
            : projectThreadIds.has(paneId);
          return shouldRemove ? removePaneFromView(view, paneId) : view;
        }, state.view);
      }

      return { projects: nextProjects, view: nextView };
    }),
  reorderProjects: (sourceId, targetId, placement) =>
    set((state) => {
      const projectIds = state.projects.map((project) => project.id);
      const reorderedIds = reorderIds(projectIds, sourceId, targetId, placement);

      if (reorderedIds === projectIds) {
        return {};
      }

      const projectsById = new Map(state.projects.map((project) => [project.id, project]));
      const projects = reorderedIds
        .map((id) => projectsById.get(id))
        .filter((project): project is Project => project !== undefined);

      return { projects };
    }),
});

function projectLocationsEqual(a: ProjectLocation, b: ProjectLocation): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "wsl" && b.kind === "wsl") {
    return a.distro === b.distro && a.linuxPath === b.linuxPath && a.uncPath === b.uncPath;
  }
  return a.kind !== "wsl" && b.kind !== "wsl" && a.path === b.path;
}
