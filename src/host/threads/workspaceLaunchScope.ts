import type { StartThreadPayload } from "@/shared/contracts";
import { buildWorktreeLocation } from "@/shared/worktree";
import { projectIdentityKey } from "@/shared/projectIdentity";
import { WorkspaceLaunchUnavailableError } from "@/shared/threadWorkspaceRefusal";
import { dbGetProject, dbGetThread } from "../db/projectsThreads";
import {
  dbGetUnresolvedThreadWorkspaceGrantOperation,
  dbReadThreadWorkspaceGrantOwner,
} from "../db/threadWorkspaceGrants";
import type { WorkspaceLaunchSelection } from "../supervisor/WorkspaceLaunchBridge";

/** Read committed host intent only. Never adopt a replica or a launch's optional extra fields. */
export function readWorkspaceLaunchSelection(
  payload: StartThreadPayload,
): WorkspaceLaunchSelection | undefined {
  try {
    return readCommittedWorkspaceLaunchSelection(payload);
  } catch (cause) {
    if (cause instanceof WorkspaceLaunchUnavailableError) throw cause;
    throw new WorkspaceLaunchUnavailableError(
      "Saved workspace launch authorization is invalid.",
      cause,
    );
  }
}

function readCommittedWorkspaceLaunchSelection(
  payload: StartThreadPayload,
): WorkspaceLaunchSelection | undefined {
  if (!payload.threadId) return undefined; // A fresh supervisor-allocated id has no saved grants.
  const current = dbReadThreadWorkspaceGrantOwner(payload.threadId);
  if (dbGetUnresolvedThreadWorkspaceGrantOperation(payload.threadId)) {
    throw new WorkspaceLaunchUnavailableError(
      "Workspace launch requires reconciliation of the unresolved grant operation.",
    );
  }
  const thread = dbGetThread(payload.threadId);
  const hasScope = current.hasCommittedScope || current.additionalDirectories.length > 0;
  // Unscoped launches may have been queued with the original cwd while the
  // owning host was moving this thread to a worktree.
  if (!hasScope && !thread?.worktreePath) return undefined;
  const project = thread ? dbGetProject(thread.projectId) : null;
  if (!thread || !project)
    throw new WorkspaceLaunchUnavailableError("Workspace launch owner no longer exists.");
  const primary = thread.worktreePath
    ? buildWorktreeLocation(project.location, thread.worktreePath)
    : project.location;
  const locationKey = (location: typeof primary) =>
    projectIdentityKey({ location }, { caseInsensitivePosix: false });
  if (locationKey(primary) !== locationKey(payload.projectLocation)) {
    throw new WorkspaceLaunchUnavailableError("The saved thread checkout changed before launch.");
  }
  if (!hasScope) return undefined;
  if (
    thread.agentKind !== payload.agentKind ||
    thread.agentInstanceId !== payload.agentInstanceId ||
    thread.presentationMode !== payload.presentationMode ||
    JSON.stringify(thread.config.executionEnvironment ?? null) !==
      JSON.stringify(payload.config.executionEnvironment ?? null)
  ) {
    throw new WorkspaceLaunchUnavailableError(
      "Workspace launch does not match the committed thread owner.",
    );
  }
  return {
    owner: current.owner,
    scope: {
      primaryLocation: primary,
      additionalDirectories: current.additionalDirectories,
      revision: current.revision,
    },
  };
}
