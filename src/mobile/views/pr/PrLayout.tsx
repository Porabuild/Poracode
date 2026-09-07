import { useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { getRouteApi, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import type { ProjectLocation } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { buildWorktreeLocation } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { buildBranchPrKey } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { useRemote } from "../../remoteContext";
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
  const remote = useRemote();
  const navigate = useNavigate();
  const router = useRouter();

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

  // Loading is owned state primed from the initial request (like the fetch
  // below, which always runs on mount): the key-change adjustment only flips
  // it back on for subsequent navigations, and the fetch settles it off in its
  // async completion — never synchronously inside the effect.
  const loadKey = !projectLocation || !validPr ? null : cacheKey;
  const [loading, setLoading] = useState(loadKey !== null);
  const [prevLoadKey, setPrevLoadKey] = useState(loadKey);
  if (prevLoadKey !== loadKey) {
    setPrevLoadKey(loadKey);
    if (loadKey !== null) setLoading(true);
  }

  // Bail to the thread list on a stale deep link (unknown project or a
  // non-numeric PR number that would otherwise poison the cache key).
  useEffect(() => {
    if (remote.booted && (!hasProject || !validPr)) void navigate({ to: "/threads" });
  }, [remote.booted, hasProject, validPr, navigate]);

  // Refetch whenever the PR changes (always fresh, like the desktop overlay).
  useEffect(() => {
    if (loadKey === null || !projectLocation) return;
    let cancelled = false;
    void fetchPr(projectLocation, prNumber, cacheKey)
      .catch((err: unknown) => toast.danger(friendlyError(err)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadKey, projectLocation, prNumber, cacheKey]);

  if (!project || !projectLocation || !validPr) return null;

  const value: PrContextValue = {
    project,
    projectLocation,
    ...(worktree ? { worktreePath: worktree } : {}),
    prNumber,
    prKey,
    cacheKey,
    loading,
    // Manual retry from the PR pages (event context, so priming `loading`
    // synchronously here is fine).
    reload: () => {
      if (!projectLocation || !validPr) return;
      setLoading(true);
      void fetchPr(projectLocation, prNumber, cacheKey)
        .catch((err: unknown) => toast.danger(friendlyError(err)))
        .finally(() => setLoading(false));
    },
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
