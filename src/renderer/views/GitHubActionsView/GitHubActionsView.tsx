import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Play, RefreshCw, Workflow } from "lucide-react";
import { ConfirmDialog } from "@/renderer/components/common";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { GitHubActionsDispatchPopover } from "./GitHubActionsDispatchPopover";
import { GitHubActionsRunDetail } from "./GitHubActionsRunDetail";
import { GitHubActionsRunList } from "./GitHubActionsRunList";
import { GitHubActionsSidebar } from "./GitHubActionsSidebar";
import { useGitHubActionsViewModel } from "./useGitHubActionsViewModel";

const EMPTY_PINNED_WORKFLOWS: number[] = [];
const RUN_PANEL_EXIT_MS = 200;

export function GitHubActionsView(props: {
  projectId?: string;
  runId?: number;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const {
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
    refreshRun,
    refreshRuns,
    rerunWorkflow,
    selectRun,
    selectWorkflow,
    setDefinitionRef,
    setDeleteRun,
  } = useGitHubActionsViewModel(props);
  const pinnedByProject = useSidebarUiStore((state) => state.pinnedGitHubWorkflows);
  const togglePinnedWorkflow = useSidebarUiStore((state) => state.togglePinnedGitHubWorkflow);
  const pinnedWorkflowIds = selectedProject
    ? (pinnedByProject[selectedProject.id] ?? EMPTY_PINNED_WORKFLOWS)
    : EMPTY_PINNED_WORKFLOWS;
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [requestedDispatchWorkflowId, setRequestedDispatchWorkflowId] = useState<number | null>(
    null,
  );
  const [displayedRun, setDisplayedRun] = useState(selectedRun);

  useEffect(() => {
    if (selectedRun) {
      setDisplayedRun(selectedRun);
      return;
    }
    const timeout = window.setTimeout(() => setDisplayedRun(null), RUN_PANEL_EXIT_MS);
    return () => window.clearTimeout(timeout);
  }, [selectedRun]);

  useEffect(() => {
    setDispatchOpen(false);
  }, [selectedWorkflowId]);

  useEffect(() => {
    if (
      requestedDispatchWorkflowId === null ||
      requestedDispatchWorkflowId !== selectedWorkflowId ||
      loadingDefinition
    ) {
      return;
    }
    if (definition?.dispatchable) setDispatchOpen(true);
    setRequestedDispatchWorkflowId(null);
  }, [definition, loadingDefinition, requestedDispatchWorkflowId, selectedWorkflowId]);

  function selectWorkflowPage(workflowId: number) {
    setRequestedDispatchWorkflowId(null);
    setDispatchOpen(false);
    selectWorkflow(workflowId);
  }

  function requestWorkflowDispatch(workflowId: number) {
    if (workflowId === selectedWorkflowId && !loadingDefinition && definition?.dispatchable) {
      setDispatchOpen(true);
      return;
    }
    setRequestedDispatchWorkflowId(workflowId);
    if (workflowId !== selectedWorkflowId) selectWorkflow(workflowId);
  }

  const sidebar = (
    <GitHubActionsSidebar
      projects={projectOptions}
      selectedProjectId={selectedProject?.id ?? null}
      workflows={workflows}
      selectedWorkflowId={selectedWorkflowId}
      pinnedWorkflowIds={pinnedWorkflowIds}
      loading={loadingWorkflows}
      onClose={props.onClose}
      onSelectProject={openGitHubActions}
      onRefresh={refresh}
      onSelect={selectWorkflowPage}
      onRun={requestWorkflowDispatch}
      onTogglePin={(workflowId) => {
        if (selectedProject) togglePinnedWorkflow(selectedProject.id, workflowId);
      }}
    />
  );

  const content = (
    <div className="flex h-full min-h-0 flex-col bg-[var(--content-background)]">
      {loadError ? (
        <div
          role="alert"
          className="shrink-0 border-b border-danger/25 bg-danger/5 px-4 py-2 text-xs text-danger"
        >
          {loadError}
        </div>
      ) : null}

      {activeProjects.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
          <div className="text-muted">
            <Workflow className="mx-auto mb-3 size-8" />
            <p className="text-sm font-medium text-foreground">
              <Trans>Add a project to use GitHub Actions.</Trans>
            </p>
          </div>
        </div>
      ) : selectedWorkflow ? (
        <>
          <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-[var(--hairline)] px-5 py-4">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-foreground">
                {selectedWorkflow.name}
              </h1>
              <p className="mt-1 truncate font-mono text-[11px] text-muted">
                {selectedWorkflow.path}
              </p>
              {definition?.triggers.length ? (
                <p className="mt-2 text-xs text-muted">
                  <Trans>Triggers:</Trans> {definition.triggers.join(", ")}
                </p>
              ) : null}
            </div>
            {definition?.dispatchable && selectedProject ? (
              <GitHubActionsDispatchPopover
                workflow={selectedWorkflow}
                definition={definition}
                projectId={selectedProject.id}
                currentBranch={definition.defaultBranch}
                isOpen={dispatchOpen}
                isDefinitionLoading={loadingDefinition}
                isPending={dispatching}
                onOpenChange={setDispatchOpen}
                onRefChange={setDefinitionRef}
                onRun={dispatchWorkflow}
              />
            ) : loadingDefinition ? (
              <Button variant="primary" isDisabled>
                <Play className="size-4" />
                <Trans>Run workflow</Trans>
              </Button>
            ) : (
              <p className="text-xs text-muted">
                <Trans>This workflow cannot be started manually.</Trans>
              </p>
            )}
          </header>

          <section className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  <Trans>Workflow runs</Trans>
                </h2>
                <p className="text-[11px] text-muted">
                  {runs.length === 1 ? <Trans>1 run</Trans> : <Trans>{runs.length} runs</Trans>}
                </p>
              </div>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                className="size-8 min-w-0"
                isDisabled={loadingRuns}
                aria-label={t`Refresh workflow runs`}
                onPress={refreshRuns}
              >
                <RefreshCw className={`size-3.5 ${loadingRuns ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <GitHubActionsRunList
              runs={runs}
              selectedRunId={selectedRunId}
              loading={loadingRuns}
              pendingRunId={pendingRunId}
              onSelectRun={selectRun}
              onRerun={(run, failedOnly) => void rerunWorkflow(run, failedOnly)}
              onDelete={setDeleteRun}
            />
          </section>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
          <div>
            <Workflow className="mx-auto mb-3 size-8 text-muted" />
            <p className="text-sm font-medium text-foreground">
              <Trans>Select a workflow to see its runs.</Trans>
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <PageLayout
        title={t`GitHub Actions`}
        sidebar={sidebar}
        content={content}
        rightPanel={
          displayedRun ? (
            <GitHubActionsRunDetail
              run={displayedRun}
              loading={loadingRun}
              isPending={pendingRunId === displayedRun.id}
              onClose={() => selectRun(null)}
              onRefresh={refreshRun}
              onRerun={(failedOnly) => void rerunWorkflow(displayedRun, failedOnly)}
              onDelete={() => setDeleteRun(displayedRun)}
            />
          ) : null
        }
        rightPanelOpen={selectedRun !== null}
        rightPanelPlacement="right"
        rightPanelResizeLabel={t`Resize run details`}
        onRequestClosePanels={() => selectRun(null)}
      />

      <ConfirmDialog
        isOpen={deleteRun !== null}
        title={t`Delete workflow run?`}
        body={
          <Trans>This permanently deletes run #{deleteRun?.number} and its logs from GitHub.</Trans>
        }
        confirmLabel={t`Delete run`}
        onClose={() => setDeleteRun(null)}
        onConfirm={() => void confirmDeleteRun()}
      />
    </>
  );
}
