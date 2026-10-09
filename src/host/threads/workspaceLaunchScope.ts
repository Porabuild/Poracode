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
  // Owner-only revisions invalidate stale approvals without changing a
  // never-scoped thread's legacy runtime ownership.
  if (!current.hasCommittedScope && current.additionalDirectories.length === 0) return undefined;
  const thread = dbGetThread(payload.threadId);
  const project = thread ? dbGetProject(thread.projectId) : null;
  if (!thread || !project)
    throw new WorkspaceLaunchUnavailableError("Workspace launch owner no longer exists.");
  const primary = thread.worktreePath
    ? buildWorktreeLocation(project.location, thread.worktreePath)
    : project.location;
  const locationKey = (location: typeof primary) =>
    projectIdentityKey({ location }, { caseInsensitivePosix: false });
  if (
    locationKey(primary) !== locationKey(payload.projectLocation) ||
    primary.remoteServerId !== payload.projectLocation.remoteServerId ||
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
