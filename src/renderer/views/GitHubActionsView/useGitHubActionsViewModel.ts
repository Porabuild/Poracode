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
  const runsCache = useRef(new Map<string, GitHubActionsRun[]>());
  const definitionCache = useRef(new Map<string, GitHubActionsWorkflowDefinition>());
  const [workflows, setWorkflows] = useState<GitHubActionsWorkflow[]>([]);
  const [runs, setRuns] = useState<GitHubActionsRun[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);
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

  useEffect(() => {
    setWorkflows([]);
    setRuns([]);
    setSelectedWorkflowId(null);
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
          const pinnedWorkflowIds =
            useSidebarUiStore.getState().pinnedGitHubWorkflows[selectedProject.id] ?? [];
          const pinned = new Set(pinnedWorkflowIds);
          const firstPinnedWorkflowId = activeWorkflows
            .filter((workflow) => pinned.has(workflow.id))
            .sort((a, b) => a.name.localeCompare(b.name))[0]?.id;
          setWorkflows(activeWorkflows);
          setSelectedWorkflowId((current) =>
            activeWorkflows.some((workflow) => workflow.id === current)
              ? current
              : (firstPinnedWorkflowId ?? activeWorkflows[0]?.id ?? null),
          );
          setLoadingWorkflows(false);
        },
        (error: unknown) => {
          if (cancelled) return;
          setWorkflows([]);
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
      setRuns([]);
      setLoadingRuns(false);
      return;
    }
    let cancelled = false;
    const cacheKey = workflowCacheKey(selectedProject.id, selectedWorkflowId);
    const cachedRuns = runsCache.current.get(cacheKey);
    setRuns(cachedRuns ?? []);
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
          runsCache.current.set(cacheKey, result.runs);
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
          if (!cachedRuns) setRuns([]);
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
    const cachedDefinition = definitionCache.current.get(cacheKey);
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
          definitionCache.current.set(cacheKey, result.definition);
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
  const projectOptions = activeProjects.map((project) => ({
    id: project.id,
    label: project.name,
  }));

  function selectWorkflow(workflowId: number) {
    if (workflowId === selectedWorkflowId) {
      setSelectedRunId(null);
      setSelectedRunDetails(null);
      return;
    }
    const cachedRuns = selectedProjectId
      ? runsCache.current.get(workflowCacheKey(selectedProjectId, workflowId))
      : undefined;
    const cachedDefinition = selectedProjectId
      ? definitionCache.current.get(definitionCacheKey(selectedProjectId, workflowId))
      : undefined;
    setSelectedWorkflowId(workflowId);
    setSelectedRunId(null);
    setSelectedRunDetails(null);
    setRuns(cachedRuns ?? []);
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
      definitionCache.current.get(definitionCacheKey(selectedProjectId, selectedWorkflowId, ref)) ??
        null,
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
          runsCache.current.set(workflowCacheKey(selectedProjectId, selectedWorkflowId), nextRuns);
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
    projectOptions,
    runs,
    selectedProject,
    selectedRun,
    selectedRunId,
    selectedWorkflow,
    selectedWorkflowId,
    workflows,
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
