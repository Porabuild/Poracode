import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useShallow } from "zustand/shallow";
import type {
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

function workflowCacheKey(projectId: string, workflowId: number): string {
  return `${projectId}\0${workflowId}`;
}

function definitionCacheKey(projectId: string, workflowId: number, ref?: string): string {
  return `${workflowCacheKey(projectId, workflowId)}\0${ref ?? ""}`;
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

function cachedWorkflowsFor(projectId: string | undefined): GitHubActionsWorkflow[] | undefined {
  return projectId ? readCache(workflowsCache, projectId, WORKFLOWS_CACHE_TTL_MS) : undefined;
}

function cachedRunsFor(projectId: string, workflowId: number): GitHubActionsRun[] | undefined {
  return readCache(runsCache, workflowCacheKey(projectId, workflowId), RUNS_CACHE_TTL_MS);
}

function cachedDefinitionFor(
  projectId: string,
  workflowId: number,
  ref?: string,
): GitHubActionsWorkflowDefinition | undefined {
  return readCache(
    definitionCache,
    definitionCacheKey(projectId, workflowId, ref),
    DEFINITION_CACHE_TTL_MS,
  );
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
  // Seeded from the cross-open cache so a reopen renders the last known list on
  // its first frame instead of an empty sidebar.
  const seedWorkflows = cachedWorkflowsFor(selectedProjectId);
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
    const cached = cachedWorkflowsFor(selectedProjectId);
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
  }, [props.runId, selectedProjectId]);

  useEffect(() => {
    if (!selectedProject) {
      setLoadingWorkflows(false);
      return;
    }
    let cancelled = false;
    setLoadingWorkflows(true);
    setLoadError(null);
    void readBridge()
      .ghListWorkflows({ projectLocation: selectedProject.location })
      .then(
        (result) => {
          if (cancelled) return;
          const activeWorkflows = result.workflows.filter(
            (workflow) => workflow.state.toLowerCase() === "active",
          );
          writeCache(workflowsCache, selectedProject.id, activeWorkflows);
          setWorkflows(activeWorkflows);
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
          if (!cachedWorkflowsFor(selectedProject.id)) setWorkflows(EMPTY_WORKFLOWS);
          setLoadError(friendlyError(error));
          setLoadingWorkflows(false);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [selectedProject, workflowRefreshVersion]);

  useEffect(() => {
    if (!selectedProject || !selectedWorkflowId) {
      setRuns(EMPTY_RUNS);
      setLoadingRuns(false);
      return;
    }
    let cancelled = false;
    const cacheKey = workflowCacheKey(selectedProject.id, selectedWorkflowId);
    const cachedRuns = cachedRunsFor(selectedProject.id, selectedWorkflowId);
    setRuns(cachedRuns ?? EMPTY_RUNS);
    setLoadingRuns(true);
    setLoadError(null);
    void readBridge()
      .ghListWorkflowRuns({
        projectLocation: selectedProject.location,
        workflowId: selectedWorkflowId,
      })
      .then(
        (result) => {
          if (cancelled) return;
          writeCache(runsCache, cacheKey, result.runs);
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
  }, [dispatchRequestedAt, runsRefreshVersion, selectedProject, selectedWorkflowId]);

  useEffect(() => {
    if (!selectedProject || !selectedWorkflowId) {
      setDefinition(null);
      setLoadingDefinition(false);
      return;
    }
    let cancelled = false;
    const cacheKey = definitionCacheKey(selectedProject.id, selectedWorkflowId, definitionRef);
    const cachedDefinition = cachedDefinitionFor(
      selectedProject.id,
      selectedWorkflowId,
      definitionRef,
    );
    setDefinition(cachedDefinition ?? null);
    setLoadingDefinition(true);
    void readBridge()
      .ghGetWorkflowDefinition({
        projectLocation: selectedProject.location,
        workflowId: selectedWorkflowId,
        ...(definitionRef ? { ref: definitionRef } : {}),
      })
      .then(
        (result) => {
          if (cancelled) return;
          writeCache(definitionCache, cacheKey, result.definition);
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
  }, [definitionRef, selectedProject, selectedWorkflowId, workflowRefreshVersion]);

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
  }, [runRefreshVersion, selectedProject, selectedRunId]);

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
    const cachedRuns = selectedProjectId ? cachedRunsFor(selectedProjectId, workflowId) : undefined;
    const cachedDefinition = selectedProjectId
      ? cachedDefinitionFor(selectedProjectId, workflowId)
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
    setDefinition(cachedDefinitionFor(selectedProjectId, selectedWorkflowId, ref) ?? null);
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
      });
      setRuns((current) => {
        const nextRuns = current.filter((run) => run.id !== runId);
        if (selectedProjectId && selectedWorkflowId) {
          writeCache(runsCache, workflowCacheKey(selectedProjectId, selectedWorkflowId), nextRuns);
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
    runs,
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
