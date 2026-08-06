import {
  gitProjectKey,
  gitTargetKey,
  pullRequestBranchKey,
  pullRequestKey,
  type GitProjectRef,
  type GitTargetRef,
  type PullRequestRef,
} from "@/shared/gitState";
import { useGitReadModelStore } from "./gitReadModelStore";

export function useGitProjectState(ref: GitProjectRef | null | undefined) {
  const key = ref ? gitProjectKey(ref) : undefined;
  return useGitReadModelStore((state) => (key ? state.projects[key] : undefined));
}

export function useGitTargetState(ref: GitTargetRef | null | undefined) {
  const key = ref ? gitTargetKey(ref) : undefined;
  return useGitReadModelStore((state) => (key ? state.targets[key] : undefined));
}

export function usePullRequestState(ref: PullRequestRef | null | undefined) {
  const key = ref ? pullRequestKey(ref) : undefined;
  return useGitReadModelStore((state) => (key ? state.pullRequests[key] : undefined));
}

export function usePullRequestForTarget(ref: GitTargetRef | null | undefined) {
  const targetKey = ref ? gitTargetKey(ref) : undefined;
  return useGitReadModelStore((state) => {
    const prKey = targetKey ? state.targets[targetKey]?.pullRequestKey : undefined;
    return prKey ? state.pullRequests[prKey] : undefined;
  });
}

export function usePullRequestForBranch(
  ref: GitProjectRef | null | undefined,
  branch: string | null | undefined,
) {
  const branchKey = ref && branch ? pullRequestBranchKey(ref, branch) : undefined;
  return useGitReadModelStore((state) => {
    const prKey = branchKey ? state.pullRequestKeyByBranch[branchKey] : undefined;
    return prKey ? state.pullRequests[prKey] : undefined;
  });
}
