import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { agentStatusForPresentation, authStateForPresentation } from "@/shared/agentSelection";
import type { AgentStatus, PrWatch, Project, ProjectLocation } from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { resolveWorktreePlacement } from "@/shared/worktree";
import type { PrWatchAgent, PrWatchWorkContext } from "./PrWatchService";
import type { SupervisorCall } from "../app-controls/supervisorCaller";

export interface PrWatchExecutionParams {
  /** Typed supervisor RPC entrypoint (`supervisorClient.call`). */
  call: SupervisorCall;
  /** Read the current shared settings from disk. */
  getSharedSettings: () => SharedSettings;
}

/**
 * The execution seams the PR watcher needs at launch time, shared by the desktop
 * and headless hosts.
 *
 * Both answer the same question — can this watch actually help right now? The
 * watcher refuses to launch when either says no, because a fix thread with a
 * dead provider or no PR checkout burns a turn and cannot repair the PR.
 */
export function buildPrWatchExecutionDeps(params: PrWatchExecutionParams): {
  resolveWatchAgent(watch: PrWatch, project: Project): Promise<PrWatchAgent | null>;
  ensureWorkContext(watch: PrWatch, project: Project): Promise<PrWatchWorkContext | null>;
} {
  return {
    resolveWatchAgent: async (watch, project) => {
      const agentKind = watch.agentKind;
      const config = watch.config;
      if (!agentKind || !config) return null;
      const agent = await readGuiAgent(params.call, project.location, agentKind);
      if (!agent) return null;
      return { agentKind, config };
    },

    ensureWorkContext: async (watch, project) => {
      const existing = await findBranchCheckout(params.call, project.location, watch);
      if (existing) return existing;
      // The PR branch may only exist on the remote by now (its worktree and
      // local branch can both be gone), so refresh refs before forking. Best
      // effort: a stale-but-present remote ref still yields a usable checkout.
      try {
        await params.call("gitFetch", {
          projectLocation: project.location,
          remote: "origin",
          prune: false,
        });
      } catch {
        // Offline or no remote — fall through and try the local ref.
      }
      // Read outside the try: the catch below is for git refusing the branch, and
      // should not also swallow a bad settings read.
      const placement = worktreePlacementArgs(
        params.getSharedSettings(),
        project.worktreeLocation,
        project.location,
      );
      try {
        const created = await params.call("gitAddWorktree", {
          projectLocation: project.location,
          branch: watch.headBranch,
          // Check the PR branch out; never fork a new branch, which would leave
          // the fix pushing somewhere the PR does not track.
          createBranch: false,
          transferUncommitted: false,
          keepChangesInSource: false,
          ...placement,
        });
        return { kind: "worktree", path: created.path };
      } catch {
        return null;
      }
    },
  };
}

/** The project's agent detection for one provider, resolved for GUI threads. */
async function readGuiAgent(
  call: SupervisorCall,
  location: ProjectLocation,
  agentKind: string,
): Promise<AgentStatus | undefined> {
  let statuses: { windows: AgentStatus[]; wsl: AgentStatus[] };
  try {
    statuses = await call("getAgentStatuses", {
      wslDistros: location.kind === "wsl" ? [location.distro] : [],
    });
  } catch {
    return undefined;
  }
  const agent = getProjectAgentStatuses(location, statuses.windows, statuses.wsl).find(
    (status) => status.kind === agentKind,
  );
  if (!agent || !agent.installed) return undefined;
  if (authStateForPresentation(agent, "gui") === "missing") return undefined;
  const gui = agentStatusForPresentation(agent, "gui");
  const modes = gui.capabilities.presentationModes ?? [gui.capabilities.presentationMode];
  if (!modes.includes("gui")) return undefined;
  return gui;
}

/**
 * Find a checkout that already has the PR branch out. Prefers the recorded
 * worktree, then any other worktree, then the main checkout — all of which are
 * valid places to push PR fixes from.
 *
 * Resolution goes through git's worktree list, never a bare directory check:
 * the recorded path can still exist while checked out to a different branch
 * (nothing pins it), and launching there would edit the wrong branch and then
 * mark the PR blocker as handled.
 */
async function findBranchCheckout(
  call: SupervisorCall,
  location: ProjectLocation,
  watch: PrWatch,
): Promise<PrWatchWorkContext | null> {
  try {
    const { worktrees } = await call("gitListWorktrees", { projectLocation: location });
    const onBranch = worktrees.filter((worktree) => worktree.branch === watch.headBranch);
    const match = onBranch.find((worktree) => worktree.path === watch.worktreePath) ?? onBranch[0];
    if (!match) return null;
    return match.isMain ? { kind: "main-checkout" } : { kind: "worktree", path: match.path };
  } catch {
    return null;
  }
}

/**
 * Worktree placement from global settings, matching the supervisor's
 * `createWorktree` pipeline (per-project overrides live in the renderer DB and
 * aren't visible here).
 */
function worktreePlacementArgs(
  settings: SharedSettings,
  override: Project["worktreeLocation"],
  location: ProjectLocation,
): { worktreeRoot?: string; worktreeOmitRepoDir?: true } {
  const placement = resolveWorktreePlacement(settings, override, location);
  return {
    ...(placement.root ? { worktreeRoot: placement.root } : {}),
    ...(placement.omitRepoDir ? { worktreeOmitRepoDir: true as const } : {}),
  };
}
