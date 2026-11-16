import type {
  GhPollPullRequestsPayload,
  GhPollPullRequestsResult,
  PrData,
} from "@/shared/contracts";
import { projectIdentityKey } from "@/shared/projectIdentity";
import { RemoteClientError } from "@/shared/remote/clientErrors";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "./appStore";
import { useGitStore } from "./gitStore";

export async function pollPullRequests(input: GhPollPullRequestsPayload, projectId?: string) {
  const projects = useAppStore.getState().projects;
  const owner = projects.find((project) => project.id === projectId);
  const payload = { ...input, projectLocation: owner?.location ?? input.projectLocation };
  const bridge = readBridge();
  let result: GhPollPullRequestsResult;
  try {
    result = await bridge.ghPollPullRequests(payload);
  } catch (error) {
    // Protocol-14 hosts predating polling status still support these reads.
    // Only the typed unsupported-procedure refusal permits a legacy read.
    if (
      !(
        error instanceof RemoteClientError &&
        error.status === 403 &&
        error.code === "git_procedure_not_allowed"
      )
    )
      throw error;
    if (payload.branch) {
      const pr = await bridge.ghGetPrForBranch({
        projectLocation: payload.projectLocation,
        branch: payload.branch,
      });
      result = { status: "ready", prs: pr ? { [payload.branch]: pr } : {}, pullRequests: [] };
    } else {
      const { prs } = await bridge.ghListPrs({ projectLocation: payload.projectLocation });
      result = { status: "ready", prs, pullRequests: [] };
    }
  }
  const ids = projectId
    ? [projectId]
    : projects
        .filter(
          (project) =>
            projectIdentityKey(project) ===
            projectIdentityKey({ location: payload.projectLocation }),
        )
        .map((project) => project.id);
  if (
    owner &&
    useAppStore.getState().projects.find((project) => project.id === projectId) !== owner
  )
    return result;
  for (const id of ids)
    useGitStore
      .getState()
      .setGithubPollingProblem(id, result.status === "blocked" ? result.problem : null);
  return result;
}

export async function pollBranchPr(
  input: GhPollPullRequestsPayload & { branch: string },
  projectId?: string,
): Promise<PrData | null> {
  const result = await pollPullRequests(input, projectId);
  // Leave the caller's cached PR intact, including an unknown first read.
  if (result.status === "blocked") throw new Error("GitHub background polling is paused.");
  return result.prs[input.branch] ?? null;
}
