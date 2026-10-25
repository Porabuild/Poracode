import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import type { Project } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { useBrowserReviewOnline } from "@/renderer/browser/offlineReviewCache";
import { useAppStore } from "@/renderer/state/appStore";
import { buildBranchNamePrKey } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { useReachableProjectFilter } from "@/renderer/state/remoteServers/reachability";
import { useWorkspaceProjectFilter } from "@/renderer/state/workspaceSelectors";
import { dedupePrProjects, dedupePullRequestEntries, repoIdentityKey } from "./prProjectDedupe";
import { pullRequestAccountKey, type PrListState, type PullRequestEntry } from "./prListModel";

export interface ProjectFailure {
  project: Project;
  message: string;
}

/**
 * Fans the review list out over the workspace's projects. Two checkouts of the
 * same origin return identical rows, so only one of them is queried; when the origin
 * is not known yet both are, and the repeated rows are collapsed.
 */
export function usePullRequestListData(options: {
  remoteDesktopId?: string | undefined;
  state: PrListState;
}) {
  const browserOnline = useBrowserReviewOnline();
  const isInWorkspace = useWorkspaceProjectFilter();
  // Projects mirrored from a device that is offline are left out: every request
  // would fail, and the list reappears with the device.
  const isReachable = useReachableProjectFilter();
  const activeProjects = useAppStore(
    useShallow((state) =>
      state.projects.filter(
        (project) =>
          !project.disabled &&
          !isHomeProject(project) &&
          isInWorkspace(project) &&
          (!options.remoteDesktopId || project.remoteServerId === options.remoteDesktopId) &&
          isReachable(project),
      ),
    ),
  );
  const projects = useGitStore(
    useShallow((state) =>
      dedupePrProjects(activeProjects, (project) =>
        repoIdentityKey(state.statuses[project.id]?.remoteInfo),
      ),
    ),
  );
  const prData = useGitStore((state) => state.prData);
  const [entries, setEntries] = useState<PullRequestEntry[]>([]);
  const [viewers, setViewers] = useState<Record<string, string>>({});
  const [failures, setFailures] = useState<ProjectFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);

  // The location is part of the key so a moved project refetches even when its id is unchanged.
  const projectsKey = projects
    .map((project) => `${project.id}\0${JSON.stringify(project.location)}`)
    .join("\n");
  const dataKey = JSON.stringify([projectsKey, options.state]);
  const requestKey = JSON.stringify([dataKey, refreshVersion, browserOnline]);
  const activeRequestKey = useRef(requestKey);
  const [previousDataKey, setPreviousDataKey] = useState<string | null>(null);
  const [previousRequestKey, setPreviousRequestKey] = useState<string | null>(null);
  if (previousRequestKey !== requestKey) {
    setPreviousRequestKey(requestKey);
    // A refresh keeps the current rows on screen; each project's rows are
    // replaced when its own response arrives.
    if (previousDataKey !== dataKey) {
      setPreviousDataKey(dataKey);
      setEntries([]);
      setViewers({});
    }
    setFailures([]);
    setLoading(projects.length > 0);
  }

  useEffect(() => {
    activeRequestKey.current = requestKey;
    let cancelled = false;
    const fresh = () => !cancelled && activeRequestKey.current === requestKey;
    const requests = projects.map((project) =>
      (options.state === "open"
        ? readBridge().ghListPullRequests({ projectLocation: project.location })
        : readBridge().forgeListPullRequestsInState({
            projectLocation: project.location,
            state: options.state,
          })
      ).then(
        (result) => {
          if (!fresh()) return;
          setEntries((current) => [
            ...current.filter((entry) => entry.project.id !== project.id),
            ...result.pullRequests.map((summary) => ({ project, summary })),
          ]);
          setViewers((current) => {
            const next = { ...current };
            delete next[project.id];
            if (result.viewerLogin) next[project.id] = result.viewerLogin;
            return next;
          });
        },
        (reason: unknown) => {
          if (!fresh()) return;
          setFailures((current) => [...current, { project, message: friendlyError(reason) }]);
        },
      ),
    );
    void Promise.allSettled(requests).then(() => {
      if (fresh()) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projects, requestKey, options.state]);

  return {
    projects,
    // A write updates the selected review before the next list request finishes.
    // Project list data is a snapshot, so let that confirmed local state win.
    entries: dedupePullRequestEntries(entries, projects).filter((entry) => {
      if (options.state === "all") return true;
      const current = prData[buildBranchNamePrKey(entry.project.id, entry.summary.headBranch)];
      if (!current || current.number !== entry.summary.pr.number) return true;
      return (current.state === "draft" ? "open" : current.state) === options.state;
    }),
    failures,
    loading,
    refresh: () => setRefreshVersion((current) => current + 1),
    accountKey: (entry: PullRequestEntry) =>
      pullRequestAccountKey(entry.summary, viewers[entry.project.id]),
  };
}
