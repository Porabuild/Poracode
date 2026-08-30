import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useShallow } from "zustand/shallow";
import type {
  GitHubAccount,
  GitHubAccountRef,
  GitHubActionsRun,
  GitHubActionsWorkflow,
  GitHubActionsWorkflowDefinition,
} from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";

const POLL_INTERVAL_MS = 5_000;
const DISPATCH_DISCOVERY_TIMEOUT_MS = 30_000;

function workflowRunIsActive(run: GitHubActionsRun): boolean {
  return run.status.toLowerCase() !== "completed";
}

function accountRefsEqual(
  first: GitHubAccountRef | undefined,
  second: GitHubAccountRef | undefined,
): boolean {
  return first?.host === second?.host && first?.login === second?.login;
}

function accountCacheKey(account: GitHubAccountRef): string {
  return `${encodeURIComponent(account.host)}:${encodeURIComponent(account.login)}`;
}

function projectAccountCacheKey(projectId: string, account: GitHubAccountRef): string {
  return `${projectId}\0account:${accountCacheKey(account)}`;
}

function workflowCacheKey(
  projectId: string,
  workflowId: number,
  account: GitHubAccountRef,
): string {
  return `${projectAccountCacheKey(projectId, account)}\0${workflowId}`;
}

function definitionCacheKey(
  projectId: string,
  workflowId: number,
  account: GitHubAccountRef,
  ref?: string,
): string {
  return `${workflowCacheKey(projectId, workflowId, account)}\0${ref ?? ""}`;
}

// Module scope rather than refs: the overlay unmounts on close, so per-instance
// caches were discarded every time and each reopen sat on an empty sidebar
// waiting for the gh calls. Kept here, a reopen paints the last known workflows
// and runs on its first frame while the refetch updates them in place. Bounded
// by the projects and workflows actually visited, and dropped on reload.
//
// Every read is followed by a refetch, so the TTL is not about freshness — it
// only caps how stale the seed may be before showing nothing beats showing the
// wrong thing. Runs expire quickly because a run's status moves on its own;
// the workflow list and a workflow's definition only change when the repo does.
const RUNS_CACHE_TTL_MS = 60_000;
const WORKFLOWS_CACHE_TTL_MS = 10 * 60_000;
const DEFINITION_CACHE_TTL_MS = 10 * 60_000;

interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

const workflowsCache = new Map<string, CacheEntry<GitHubActionsWorkflow[]>>();
const runsCache = new Map<string, CacheEntry<GitHubActionsRun[]>>();
const definitionCache = new Map<string, CacheEntry<GitHubActionsWorkflowDefinition>>();

function readCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  ttlMs: number,
): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.storedAt > ttlMs) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
  cache.set(key, { value, storedAt: Date.now() });
}

// Stable empties so seeding never re-renders with a fresh [] on mount.
const EMPTY_WORKFLOWS: GitHubActionsWorkflow[] = [];
const EMPTY_RUNS: GitHubActionsRun[] = [];

/**
 * Which workflow to show: the current one if it still exists, else the first
 * pinned one by name, else the first workflow.
 */
function resolveSelectedWorkflowId(
  projectId: string,
  workflows: GitHubActionsWorkflow[],
  current: number | null,
): number | null {
  if (workflows.some((workflow) => workflow.id === current)) return current;
  const pinned = new Set(useSidebarUiStore.getState().pinnedGitHubWorkflows[projectId] ?? []);
  const firstPinnedWorkflowId = workflows
    .filter((workflow) => pinned.has(workflow.id))
    .sort((a, b) => a.name.localeCompare(b.name))[0]?.id;
  return firstPinnedWorkflowId ?? workflows[0]?.id ?? null;
}

function cachedWorkflowsFor(
  projectId: string | undefined,
  account: GitHubAccountRef | undefined,
): GitHubActionsWorkflow[] | undefined {
  return projectId && account
    ? readCache(workflowsCache, projectAccountCacheKey(projectId, account), WORKFLOWS_CACHE_TTL_MS)
    : undefined;
}

function cachedWorkflowsForProject(
  projectId: string | undefined,
): GitHubActionsWorkflow[] | undefined {
  const account = projectId
    ? useAppStore.getState().projects.find((project) => project.id === projectId)?.ghAccount
    : undefined;
  return cachedWorkflowsFor(projectId, account);
}

function cachedRunsFor(
  projectId: string,
  workflowId: number,
  account: GitHubAccountRef | undefined,
): GitHubActionsRun[] | undefined {
  return account
    ? readCache(runsCache, workflowCacheKey(projectId, workflowId, account), RUNS_CACHE_TTL_MS)
    : undefined;
}

function cachedDefinitionFor(
  projectId: string,
  workflowId: number,
  account: GitHubAccountRef | undefined,
  ref?: string,
): GitHubActionsWorkflowDefinition | undefined {
  return account
    ? readCache(
        definitionCache,
        definitionCacheKey(projectId, workflowId, account, ref),
        DEFINITION_CACHE_TTL_MS,
      )
    : undefined;
}

/**
 * Drops every cached list. These caches deliberately outlive the component, so
 * tests need a seam to get a cold start between cases.
 */
export function resetGitHubActionsCaches(): void {
  workflowsCache.clear();
  runsCache.clear();
  definitionCache.clear();
}

export function useGitHubActionsViewModel(props: { projectId?: string; runId?: number }) {
  const { t } = useLingui();
  const activeProjects = useAppStore(
    useShallow((state) =>
      state.projects.filter((project) => !project.disabled && !isHomeProject(project)),
    ),
  );
  const openGitHubActions = useAppStore((state) => state.openGitHubActions);
  const selectedProject =
    activeProjects.find((project) => project.id === props.projectId) ?? activeProjects[0];
  const selectedProjectId = selectedProject?.id;
  const ghAccount = selectedProject?.ghAccount;
  // Seeded from the cross-open cache so a reopen renders the last known list on
  // its first frame instead of an empty sidebar. Auto-detected data is not
  // seeded because the effective account is unknown until this load resolves.
  const seedWorkflows = cachedWorkflowsFor(selectedProjectId, ghAccount);
  const [workflows, setWorkflows] = useState<GitHubActionsWorkflow[]>(
    seedWorkflows ?? EMPTY_WORKFLOWS,
  );
  const [runs, setRuns] = useState<GitHubActionsRun[]>(EMPTY_RUNS);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(() =>
    seedWorkflows && selectedProjectId
      ? resolveSelectedWorkflowId(selectedProjectId, seedWorkflows, null)
      : null,
  );
  const [selectedRunId, setSelectedRunId] = useState<number | null>(props.runId ?? null);
  const [selectedRunDetails, setSelectedRunDetails] = useState<GitHubActionsRun | null>(null);
  const [definition, setDefinition] = useState<GitHubActionsWorkflowDefinition | null>(null);
  const [definitionRef, setDefinitionRef] = useState<string | undefined>();
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingDefinition, setLoadingDefinition] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workflowRefreshVersion, setWorkflowRefreshVersion] = useState(0);
  const [runsRefreshVersion, setRunsRefreshVersion] = useState(0);
  const [runRefreshVersion, setRunRefreshVersion] = useState(0);
  const [dispatchRequestedAt, setDispatchRequestedAt] = useState<number | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [pendingRunId, setPendingRunId] = useState<number | null>(null);
  const [deleteRun, setDeleteRun] = useState<GitHubActionsRun | null>(null);
  const [accounts, setAccounts] = useState<GitHubAccount[]>([]);
  const [resolvedAccount, setResolvedAccount] = useState<GitHubAccountRef | undefined>();
  const previousGhAccountRef = useRef(ghAccount);
  // A selection derived from the cache seed is a guess, not a choice: once the
  // real list lands it must still resolve to the default (first pinned), or a
  // workflow pinned while the overlay was closed would be ignored. Only an
  // explicit pick survives the refresh.
  const userPickedWorkflowRef = useRef(false);

  // Switching project resets the view. Seed from cache rather than clearing, so
  // this also leaves the mount-time seed above intact (same references in, no
  // extra render out) instead of blanking it before the first paint.
  useEffect(() => {
    userPickedWorkflowRef.current = false;
    const cached = cachedWorkflowsForProject(selectedProjectId);
    setWorkflows(cached ?? EMPTY_WORKFLOWS);
    setRuns(EMPTY_RUNS);
    setSelectedWorkflowId(
      cached && selectedProjectId
        ? resolveSelectedWorkflowId(selectedProjectId, cached, null)
        : null,
    );
    setSelectedRunId(props.runId ?? null);
    setSelectedRunDetails(null);
    setDefinition(null);
    setDefinitionRef(undefined);
    setLoadingRuns(false);
    setLoadingDefinition(false);
    setLoadError(null);
    setDispatchRequestedAt(null);
    setResolvedAccount(undefined);
  }, [props.runId, selectedProjectId]);

  useEffect(() => {
    if (accountRefsEqual(previousGhAccountRef.current, ghAccount)) return;
    previousGhAccountRef.current = ghAccount;
    setWorkflows(EMPTY_WORKFLOWS);
    setRuns(EMPTY_RUNS);
    setSelectedWorkflowId(null);
    setSelectedRunId(null);
    setSelectedRunDetails(null);
    setDefinition(null);
    setDefinitionRef(undefined);
    setDeleteRun(null);
    setLoadError(null);
    setLoadingWorkflows(true);
    setResolvedAccount(undefined);
  }, [ghAccount]);

  useEffect(() => {
    if (!selectedProject) {
      setAccounts([]);
      return;
    }
    setAccounts([]);
    let cancelled = false;
    void readBridge()
      .ghListAccounts({ runtime: selectedProject.location })
      .then((result) => {
        if (!cancelled) setAccounts(result.accounts);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) {
      setLoadingWorkflows(false);
      return;
    }
    let cancelled = false;
    setLoadingWorkflows(true);
    setLoadError(null);
    void readBridge()
      .ghListWorkflows({
        projectLocation: selectedProject.location,
        ...(ghAccount ? { ghAccount } : {}),
      })
      .then(
        (result) => {
          if (cancelled) return;
          const activeWorkflows = result.workflows.filter(
            (workflow) => workflow.state.toLowerCase() === "active",
          );
          if (ghAccount) {
            writeCache(
              workflowsCache,
              projectAccountCacheKey(selectedProject.id, ghAccount),
              activeWorkflows,
            );
          }
          setWorkflows(activeWorkflows);
          setResolvedAccount(result.account);
          setSelectedWorkflowId((current) =>
            resolveSelectedWorkflowId(
              selectedProject.id,
              activeWorkflows,
              userPickedWorkflowRef.current ? current : null,
            ),
          );
          setLoadingWorkflows(false);
        },
        (error: unknown) => {
          if (cancelled) return;
          // Keep whatever the cache seeded — showing a stale list beside the
          // error beats blanking the sidebar on a transient gh failure. An
          // expired entry counts as absent, so this clears once the TTL lapses.
          if (!cachedWorkflowsFor(selectedProject.id, ghAccount)) setWorkflows(EMPTY_WORKFLOWS);
          setLoadError(friendlyError(error));
          setLoadingWorkflows(false);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [ghAccount, selectedProject, workflowRefreshVersion]);

  useEffect(() => {
    if (!selectedProject || !selectedWorkflowId) {
      setRuns(EMPTY_RUNS);
      setLoadingRuns(false);
      return;
    }
    let cancelled = false;
    const cachedRuns = cachedRunsFor(selectedProject.id, selectedWorkflowId, ghAccount);
    setRuns(cachedRuns ?? EMPTY_RUNS);
    setLoadingRuns(true);
    setLoadError(null);
    void readBridge()
      .ghListWorkflowRuns({
        projectLocation: selectedProject.location,
        workflowId: selectedWorkflowId,
        ...(ghAccount ? { ghAccount } : {}),
      })
      .then(
        (result) => {
          if (cancelled) return;
          if (ghAccount) {
            writeCache(
              runsCache,
              workflowCacheKey(selectedProject.id, selectedWorkflowId, ghAccount),
              result.runs,
            );
          }
          setRuns(result.runs);
          if (
            dispatchRequestedAt !== null &&
            result.runs.some(
              (run) =>
                run.event === "workflow_dispatch" &&
                new Date(run.createdAt).getTime() >= dispatchRequestedAt - POLL_INTERVAL_MS,
            )
          ) {
            setDispatchRequestedAt(null);
          }
          setLoadingRuns(false);
        },
        (error: unknown) => {
          if (cancelled) return;
          if (!cachedRuns) setRuns(EMPTY_RUNS);
          setLoadError(friendlyError(error));
          setLoadingRuns(false);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [dispatchRequestedAt, ghAccount, runsRefreshVersion, selectedProject, selectedWorkflowId]);

  useEffect(() => {
    if (!selectedProject || !selectedWorkflowId) {
      setDefinition(null);
      setLoadingDefinition(false);
      return;
    }
    let cancelled = false;
    const cachedDefinition = cachedDefinitionFor(
      selectedProject.id,
      selectedWorkflowId,
      ghAccount,
      definitionRef,
    );
    setDefinition(cachedDefinition ?? null);
    setLoadingDefinition(true);
    void readBridge()
      .ghGetWorkflowDefinition({
        projectLocation: selectedProject.location,
        workflowId: selectedWorkflowId,
        ...(definitionRef ? { ref: definitionRef } : {}),
        ...(ghAccount ? { ghAccount } : {}),
      })
      .then(
        (result) => {
          if (cancelled) return;
          if (ghAccount) {
            writeCache(
              definitionCache,
              definitionCacheKey(selectedProject.id, selectedWorkflowId, ghAccount, definitionRef),
              result.definition,
            );
          }
          setDefinition(result.definition);
          setLoadingDefinition(false);
        },
        (error: unknown) => {
          if (cancelled) return;
          if (!cachedDefinition) setDefinition(null);
          setLoadError(friendlyError(error));
          setLoadingDefinition(false);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [definitionRef, ghAccount, selectedProject, selectedWorkflowId, workflowRefreshVersion]);

  useEffect(() => {
    if (!selectedProject || !selectedRunId) {
      setSelectedRunDetails(null);
      setLoadingRun(false);
      return;
    }
    let cancelled = false;
    setLoadingRun(true);
    void readBridge()
      .ghGetWorkflowRun({
        projectLocation: selectedProject.location,
        runId: selectedRunId,
        ...(ghAccount ? { ghAccount } : {}),
      })
      .then(
        (result) => {
          if (cancelled) return;
          setSelectedRunDetails(result.run);
          if (result.run.workflowId) setSelectedWorkflowId(result.run.workflowId);
          setLoadingRun(false);
        },
        (error: unknown) => {
          if (cancelled) return;
          setSelectedRunDetails(null);
          setLoadError(friendlyError(error));
          setLoadingRun(false);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [ghAccount, runRefreshVersion, selectedProject, selectedRunId]);

  const hasActiveRuns = runs.some(workflowRunIsActive);
  useEffect(() => {
    if (!selectedProject || (!hasActiveRuns && dispatchRequestedAt === null)) return;
    const interval = window.setInterval(() => {
      if (
        dispatchRequestedAt !== null &&
        Date.now() - dispatchRequestedAt >= DISPATCH_DISCOVERY_TIMEOUT_MS
      ) {
        setDispatchRequestedAt(null);
      }
      setRunsRefreshVersion((current) => current + 1);
      if (selectedRunId) setRunRefreshVersion((current) => current + 1);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [dispatchRequestedAt, hasActiveRuns, selectedProject, selectedRunId]);

  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowId);
  const selectedRun =
    selectedRunDetails?.id === selectedRunId
      ? selectedRunDetails
      : (runs.find((run) => run.id === selectedRunId) ?? null);
  function selectWorkflow(workflowId: number) {
    userPickedWorkflowRef.current = true;
    if (workflowId === selectedWorkflowId) {
      setSelectedRunId(null);
      setSelectedRunDetails(null);
      return;
    }
    const cachedRuns = selectedProjectId
      ? cachedRunsFor(selectedProjectId, workflowId, ghAccount)
      : undefined;
    const cachedDefinition = selectedProjectId
      ? cachedDefinitionFor(selectedProjectId, workflowId, ghAccount)
      : undefined;
    setSelectedWorkflowId(workflowId);
    setSelectedRunId(null);
    setSelectedRunDetails(null);
    setRuns(cachedRuns ?? EMPTY_RUNS);
    setDefinition(cachedDefinition ?? null);
    setDefinitionRef(undefined);
    setLoadingRuns(true);
    setLoadingDefinition(true);
  }

  function selectDefinitionRef(ref: string) {
    if (
      !selectedProjectId ||
      !selectedWorkflowId ||
      ref === definitionRef ||
      (definition?.workflowId === selectedWorkflowId && ref === definition.ref)
    ) {
      return;
    }
    setDefinitionRef(ref);
    setDefinition(
      cachedDefinitionFor(selectedProjectId, selectedWorkflowId, ghAccount, ref) ?? null,
    );
    setLoadingDefinition(true);
  }

  function refresh() {
    setWorkflowRefreshVersion((current) => current + 1);
    setRunsRefreshVersion((current) => current + 1);
    if (selectedRunId) setRunRefreshVersion((current) => current + 1);
  }

  async function dispatchWorkflow(ref: string, inputs: Record<string, string>) {
    if (!selectedProject || !selectedWorkflow || dispatching) return false;
    setDispatching(true);
    try {
      await readBridge().ghDispatchWorkflow({
        projectLocation: selectedProject.location,
        workflowId: selectedWorkflow.id,
        ref,
        inputs,
        ...(ghAccount ? { ghAccount } : {}),
      });
      setDispatchRequestedAt(Date.now());
      setRunsRefreshVersion((current) => current + 1);
      toast.success(t`Workflow dispatch requested.`);
      return true;
    } catch (error) {
      toast.danger(friendlyError(error));
      return false;
    } finally {
      setDispatching(false);
    }
  }

  async function rerunWorkflow(run: GitHubActionsRun, failedOnly: boolean) {
    if (!selectedProject || pendingRunId !== null) return;
    setPendingRunId(run.id);
    try {
      await readBridge().ghRerunWorkflowRun({
        projectLocation: selectedProject.location,
        runId: run.id,
        failedOnly,
        ...(ghAccount ? { ghAccount } : {}),
      });
      setRunsRefreshVersion((current) => current + 1);
      setRunRefreshVersion((current) => current + 1);
      toast.success(
        failedOnly ? t`Failed jobs queued to run again.` : t`Workflow queued to run again.`,
      );
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setPendingRunId(null);
    }
  }

  async function cancelWorkflow(run: GitHubActionsRun) {
    if (!selectedProject || pendingRunId !== null) return;
    setPendingRunId(run.id);
    try {
      await readBridge().ghCancelWorkflowRun({
        projectLocation: selectedProject.location,
        runId: run.id,
        ...(ghAccount ? { ghAccount } : {}),
      });
      setRunsRefreshVersion((current) => current + 1);
      setRunRefreshVersion((current) => current + 1);
      toast.success(t`Workflow cancellation requested.`);
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setPendingRunId(null);
    }
  }

  async function confirmDeleteRun() {
    if (!selectedProject || !deleteRun || pendingRunId !== null) return;
    const runId = deleteRun.id;
    setPendingRunId(runId);
    try {
      await readBridge().ghDeleteWorkflowRun({
        projectLocation: selectedProject.location,
        runId,
        ...(ghAccount ? { ghAccount } : {}),
      });
      setRuns((current) => {
        const nextRuns = current.filter((run) => run.id !== runId);
        if (selectedProjectId && selectedWorkflowId && ghAccount) {
          writeCache(
            runsCache,
            workflowCacheKey(selectedProjectId, selectedWorkflowId, ghAccount),
            nextRuns,
          );
        }
        return nextRuns;
      });
      if (selectedRunId === runId) {
        setSelectedRunId(null);
        setSelectedRunDetails(null);
      }
      setDeleteRun(null);
      toast.success(t`Workflow run deleted.`);
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setPendingRunId(null);
    }
  }

  return {
    accounts,
    activeProjects,
    definition,
    deleteRun,
    dispatching,
    loadError,
    loadingDefinition,
    loadingRun,
    loadingRuns,
    loadingWorkflows,
    openGitHubActions,
    pendingRunId,
    resolvedAccount,
    runs,
    selectedAccount: ghAccount,
    selectedProject,
    selectedRun,
    selectedRunId,
    selectedWorkflow,
    selectedWorkflowId,
    workflows,
    cancelWorkflow,
    confirmDeleteRun,
    dispatchWorkflow,
    refresh,
    refreshRun: () => setRunRefreshVersion((current) => current + 1),
    refreshRuns: () => setRunsRefreshVersion((current) => current + 1),
    rerunWorkflow,
    selectDefinitionRef,
    selectRun: setSelectedRunId,
    selectWorkflow,
    setDeleteRun,
  };
}
