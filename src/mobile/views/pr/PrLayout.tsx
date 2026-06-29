import { useCallback, useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { getRouteApi, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import type { ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { buildWorktreeLocation } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { buildBranchPrKey } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { useMobileApp } from "../../remoteContext";
import { PrContextProvider, type PrContextValue, type PrPageKey } from "./prContext";

const prLayoutApi = getRouteApi("/pr/$prNumber");

const PR_PAGE_PATHS = {
  changes: "/pr/$prNumber/changes",
  commits: "/pr/$prNumber/commits",
  checks: "/pr/$prNumber/checks",
  conversation: "/pr/$prNumber/conversation",
} as const satisfies Record<PrPageKey, string>;

/** Fetch the PR (files, diff, details) into the git store under `cacheKey`. */
async function fetchPr(
  projectLocation: ProjectLocation,
  prNumber: number,
  cacheKey: string,
): Promise<void> {
  const store = useGitStore.getState();
  await Promise.all([
    readBridge()
      .ghGetPrFiles({ projectLocation, prNumber })
      .then((res) => store.setPrFiles(cacheKey, res.files)),
    readBridge()
      .ghGetPrDiff({ projectLocation, prNumber })
      .then((res) => store.setPrDiff(cacheKey, res.diff)),
    readBridge()
      .ghGetPrDetails({ projectLocation, prNumber })
      .then((res) => store.setPrDetails(cacheKey, res.details)),
  ]);
}

/**
 * Parent route for PR review: resolves the project, loads the PR once into the
 * git store under a shared cache key, and renders the fullscreen shell whose
 * <Outlet/> is the overview or a deep page. All pages read the same cache and
 * share navigation through the PR context.
 */
export function PrLayout() {
  const { prNumber: prNumberParam } = prLayoutApi.useParams();
  const { project: projectId, worktree, prKey: explicitPrKey } = prLayoutApi.useSearch();
  const { remote } = useMobileApp();
  const navigate = useNavigate();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const prNumber = Number(prNumberParam);
  const validPr = Number.isInteger(prNumber) && prNumber > 0;
  const project = remote.projects.find((entry) => entry.id === projectId) ?? null;
  const hasProject = Boolean(project);
  const projectLocation: ProjectLocation | null = project
    ? worktree
      ? buildWorktreeLocation(project.location, worktree)
      : project.location
    : null;
  const cacheKey = project ? `${project.id}#${prNumber}` : "";
  const prKey = project ? (explicitPrKey ?? worktree ?? buildBranchPrKey(project.id)) : "";
  const search = {
    project: projectId,
    ...(worktree ? { worktree } : {}),
    ...(explicitPrKey ? { prKey: explicitPrKey } : {}),
  };

  const load = useCallback(() => {
    if (!projectLocation || !validPr) return;
    setLoading(true);
    void fetchPr(projectLocation, prNumber, cacheKey)
      .catch((err: unknown) => toast.danger(friendlyError(err)))
      .finally(() => setLoading(false));
  }, [projectLocation, prNumber, cacheKey, validPr]);

  // Bail to the thread list on a stale deep link (unknown project or a
  // non-numeric PR number that would otherwise poison the cache key).
  useEffect(() => {
    if (remote.booted && (!hasProject || !validPr)) void navigate({ to: "/threads" });
  }, [remote.booted, hasProject, validPr, navigate]);

  // Refetch whenever the PR changes (always fresh, like the desktop overlay).
  useEffect(() => {
    load();
  }, [load]);

  if (!project || !projectLocation || !validPr) return null;

  const value: PrContextValue = {
    project,
    projectLocation,
    prNumber,
    prKey,
    cacheKey,
    loading,
    reload: load,
    toOverview: () =>
      void navigate({ to: "/pr/$prNumber", params: { prNumber: prNumberParam }, search }),
    toPage: (page: PrPageKey) =>
      void navigate({ to: PR_PAGE_PATHS[page], params: { prNumber: prNumberParam }, search }),
    close: () => {
      if (router.history.canGoBack()) router.history.back();
      else void navigate({ to: "/threads" });
    },
  };

  return (
    <PrContextProvider value={value}>
      <section className="m-git-overlay">
        <Outlet />
      </section>
    </PrContextProvider>
  );
}
