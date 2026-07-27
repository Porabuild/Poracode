import { flushSync } from "react-dom";
import type { GitAddWorktreePayload, Project, Thread } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { getBasename } from "@/shared/pathUtils";
import { buildWorktreeLocation } from "@/shared/worktree";
import { useAppStore } from "@/renderer/state/appStore";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { isFullscreenScreenPath } from "./fullscreenScreenPath";
import { useGitSummariesStore } from "./gitSummaries";
import type { RemoteSession } from "./remoteContext";
import { isDesktopSettingsSection } from "./settingsSectionIds";
import { WIDE_SHELL_QUERY } from "./useMediaQuery";
import type { ThreadAction } from "./useRemoteDesktop";
import type { FilesTarget } from "./views/FilesView";
import type { GitTarget } from "./views/GitView";

/**
 * Decides whether starting this draft requires creating a new worktree, and if
 * so builds the `gitAddWorktree` payload (mirrors desktop's handleDraftStart).
 * Returns null when no worktree is created — either a plain project-root thread
 * or one targeting an *existing* worktree (which the caller uses directly).
 */
export function buildGitAddWorktreePayload(
  project: Project,
  input: DraftStartInput,
): GitAddWorktreePayload | null {
  // Existing worktree → reuse it; no branch → project-root thread.
  if (input.existingWorktreePath || !input.worktreeBranch) return null;
  return {
    projectLocation: project.location,
    branch: input.worktreeBranch,
    createBranch: input.worktreeIsNewBranch ?? false,
    ...(input.worktreeBaseBranch ? { startPoint: input.worktreeBaseBranch } : {}),
    ...(project.scripts?.worktreeCopyPatterns
      ? { copyIgnoredPatterns: project.scripts.worktreeCopyPatterns }
      : {}),
    transferUncommitted: input.worktreeTransferUncommitted ?? false,
    // "Worktree + changes" copies (keeps on source); a plain move clears it.
    keepChangesInSource: input.worktreeTransferUncommitted ?? false,
  };
}

interface WorktreeDraftTarget {
  readonly projectId: string;
  readonly worktreePath: string;
  readonly worktreeBranch: string;
}

/** Target the shared draft at an existing worktree. */
export function preselectWorktreeDraft(input: WorktreeDraftTarget): void {
  useAppStore.getState().setPendingDraftWorktreeSelection(input.projectId, {
    branch: input.worktreeBranch,
    baseBranch: input.worktreeBranch,
    isWorktree: true,
    worktreePath: input.worktreePath,
  });
  useAppStore.getState().openDraft(input.projectId);
}

/**
 * Navigate to the desktop-style full new-thread screen, then target its draft
 * at an existing worktree. Publishing after navigation prevents the phone's
 * still-mounted home composer from consuming the one-shot target.
 */
export async function openWorktreeDraft(
  input: WorktreeDraftTarget,
  navigateToDraft: () => Promise<unknown>,
): Promise<void> {
  await navigateToDraft();
  preselectWorktreeDraft(input);
}

/**
 * Run a local state swap as a native screen slide (View Transitions API),
 * matching the router's push/pop for in-view drill-downs that aren't route
 * navigations — e.g. the fullscreen file editor inside the workspace screen.
 * The swapped screen must carry a `view-transition-name` (the workspace's
 * `m-screen`) for the styles.css push/pop animations to pick it up. Falls back
 * to an instant swap without the API, on the wide layout (not a phone stack),
 * or under reduced motion — mirroring the router's gating.
 */
export function screenStateTransition(type: "push" | "pop", update: () => void): void {
  const doc = document as unknown as {
    startViewTransition?: (options: { update: () => void; types: string[] }) => unknown;
  };
  if (
    !doc.startViewTransition ||
    window.matchMedia(WIDE_SHELL_QUERY).matches ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }
  doc.startViewTransition({ update: () => flushSync(update), types: [type] });
}

/** Extract the selected thread from its detail or project-tool pathname. */
export function threadIdFromPath(pathname: string): string | null {
  const subAgentMatch = /^\/subagent\/([^/]+)\/[^/]+$/.exec(pathname);
  if (subAgentMatch?.[1]) return decodeURIComponent(subAgentMatch[1]);
  const match = /^\/(?:thread|workspace|notes)\/(.+)$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

// Defined in fullscreenScreenPath (dependency-free) so the lightweight
// transition predicates can share it; re-exported here for existing importers.
export { isFullscreenScreenPath };

/**
 * Depth of a screen in the phone navigation stack. Higher = deeper. Drives the
 * direction of the native view transition: deeper is a forward push, shallower
 * is a back pop, same depth is a sibling/tab cross-fade.
 *
 * The shell's back buttons `navigate({ to })` forward in history rather than
 * calling `history.back()`, so history index can't tell us the direction —
 * comparing depth gives the correct visual direction regardless.
 */
export function screenDepth(path: string): number {
  if (path.startsWith("/subagent/")) return 2;
  if (path.startsWith("/thread/")) return 1;
  if (isFullscreenScreenPath(path)) return 2;
  // A desktop-syncing section is pushed from the Desktop Settings list (depth
  // 2); a device section is pushed straight from the Settings page (depth 1).
  if (path === "/settings/desktop") return 2;
  const sectionMatch = /^\/settings\/(.+)$/.exec(path);
  if (sectionMatch?.[1]) {
    return isDesktopSettingsSection(decodeURIComponent(sectionMatch[1])) ? 3 : 2;
  }
  // First-level screens pushed from home: quick-menu destinations, the
  // Settings page, a thread, the full new-thread composer.
  if (
    path === "/settings" ||
    path === "/new" ||
    path === "/desktops" ||
    path === "/usage" ||
    path === "/projects" ||
    path === "/browser" ||
    path === "/ports"
  ) {
    return 1;
  }
  // Home: /threads.
  return 0;
}

/**
 * The view-transition direction for a navigation between two paths, or null when
 * there should be no animation (first paint, or navigating to the same path).
 */
export function navigationTransitionType(
  fromPath: string | undefined,
  toPath: string,
): "push" | "pop" | "fade" | null {
  if (!fromPath || fromPath === toPath) return null;
  const from = screenDepth(fromPath);
  const to = screenDepth(toPath);
  if (to > from) return "push";
  if (to < from) return "pop";
  return "fade";
}

/**
 * Apply a thread action and, when it removes the thread (archive/delete),
 * invoke `onRemoved` so the caller can route away from the now-gone thread.
 */
export function runThreadAction(
  remote: RemoteSession,
  thread: Thread | null,
  action: ThreadAction,
  onRemoved: () => void,
): void {
  if (!thread) return;
  void remote.applyThreadAction(thread, action);
  if (action.kind === "archive" || action.kind === "delete") {
    onRemoved();
  }
}

/**
 * Reconstruct the fullscreen git-panel target for a thread from the live
 * session + cached git summaries (mirrors the old App.openGit). Returns null
 * when the thread or its project is not loaded yet.
 */
export function buildGitTarget(remote: RemoteSession, threadId: string): GitTarget | null {
  const thread = remote.threads.find((entry) => entry.id === threadId);
  if (!thread) return null;
  const project = remote.projects.find((entry) => entry.id === thread.projectId);
  if (!project) return null;
  const summary = useGitSummariesStore.getState().byThread[threadId];
  const worktreePath = thread.worktreePath ?? undefined;
  if (worktreePath) {
    return {
      project,
      threadId,
      statusKey: worktreePath,
      worktreePath,
      worktreeBranch: summary?.branch,
      locationOverride: buildWorktreeLocation(project.location, worktreePath),
    };
  }
  return { project, threadId };
}

/** Resolve the project/worktree root the file tree should browse for a thread. */
export function buildFilesTarget(remote: RemoteSession, threadId: string): FilesTarget | null {
  const thread = remote.threads.find((entry) => entry.id === threadId);
  if (!thread) return null;
  const project = remote.projects.find((entry) => entry.id === thread.projectId);
  if (!project) return null;
  const worktreePath = thread.worktreePath ?? undefined;
  if (worktreePath) {
    return {
      project,
      projectLocation: buildWorktreeLocation(project.location, worktreePath),
      rootLabel: getBasename(worktreePath) || project.name,
      worktreePath,
    };
  }
  return {
    project,
    projectLocation: project.location,
    rootLabel: project.name,
  };
}

/**
 * Pick the project the mobile new-thread draft composer should show. Mirrors
 * the desktop ProjectSwitchMenu's filter: Home is stored with `disabled: true`
 * as an internal marker (not a user-disabled project), so it stays selectable
 * while genuinely disabled projects are dropped.
 *
 * Resolution order: an explicit pick (e.g. choosing Home from the embedded
 * switcher), then the active thread's project, then the first *real* project —
 * Home is only the default when nothing else is available, so a fresh
 * new-thread screen doesn't open on Home for everyone (Home sorts first).
 */
export function selectDraftProject(
  projects: readonly Project[],
  selection: {
    readonly draftProjectId: string | null;
    readonly selectedThreadProjectId: string | null | undefined;
  },
): Project | null {
  const selectable = projects.filter((project) => isHomeProject(project) || !project.disabled);
  return (
    selectable.find((project) => project.id === selection.draftProjectId) ??
    selectable.find((project) => project.id === selection.selectedThreadProjectId) ??
    selectable.find((project) => !isHomeProject(project)) ??
    selectable[0] ??
    null
  );
}
