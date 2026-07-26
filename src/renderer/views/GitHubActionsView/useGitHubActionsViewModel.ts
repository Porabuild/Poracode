import { useEffect, useState } from "react";
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
import { useGitStore } from "@/renderer/state/gitStore";

const POLL_INTERVAL_MS = 5_000;
const DISPATCH_DISCOVERY_TIMEOUT_MS = 30_000;

function workflowRunIsActive(run: GitHubActionsRun): boolean {
  return run.status.toLowerCase() !== "completed";
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
  const branchList = useGitStore((state) =>
    selectedProjectId ? state.branches[selectedProjectId] : undefined,
  );
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
          setWorkflows(activeWorkflows);
          setSelectedWorkflowId((current) =>
            activeWorkflows.some((workflow) => workflow.id === current)
              ? current
              : (activeWorkflows[0]?.id ?? null),
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
          setRuns([]);
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
          setDefinition(result.definition);
          setLoadingDefinition(false);
        },
        (error: unknown) => {
          if (cancelled) return;
          setDefinition(null);
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
  const refNames = [
    definition?.defaultBranch,
    ...(branchList?.branches ?? [])
      .filter((branch) => !branch.isRemote)
      .map((branch) => branch.name),
  ].filter((ref): ref is string => Boolean(ref));
  const refOptions = [...new Set(refNames)].map((ref) => ({ id: ref, label: ref }));

  function selectWorkflow(workflowId: number) {
    setSelectedWorkflowId(workflowId);
    setSelectedRunId(null);
    setSelectedRunDetails(null);
    setRuns([]);
    setDefinition(null);
    setDefinitionRef(undefined);
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
      setRuns((current) => current.filter((run) => run.id !== runId));
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
    refOptions,
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
    selectRun: setSelectedRunId,
    selectWorkflow,
    setDefinitionRef,
    setDeleteRun,
  };
}
