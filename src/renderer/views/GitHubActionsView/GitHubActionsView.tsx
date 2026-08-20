import { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "@heroui/react";
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

function accountRefsEqual(
  first: { host: string; login: string } | undefined,
  second: { host: string; login: string } | undefined,
): boolean {
  return first?.host === second?.host && first?.login === second?.login;
}

export function GitHubActionsView(props: {
  projectId?: string;
  runId?: number;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const {
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
    selectedAccount,
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
    refreshRun,
    refreshRuns,
    rerunWorkflow,
    selectDefinitionRef,
    selectRun,
    selectWorkflow,
    setDeleteRun,
    setProjectGhAccount,
  } = useGitHubActionsViewModel(props);
  const pinnedByProject = useSidebarUiStore((state) => state.pinnedGitHubWorkflows);
  const togglePinnedWorkflow = useSidebarUiStore((state) => state.togglePinnedGitHubWorkflow);
  const pinnedWorkflowIds = selectedProject
    ? (pinnedByProject[selectedProject.id] ?? EMPTY_PINNED_WORKFLOWS)
    : EMPTY_PINNED_WORKFLOWS;
  const [dispatchWorkflowId, setDispatchWorkflowId] = useState<number | null>(null);
  const [displayedRun, setDisplayedRun] = useState(selectedRun);
  const previousAccountRef = useRef(selectedAccount);
  const selectedDefinition = definition?.workflowId === selectedWorkflowId ? definition : null;
  const dispatchOpen = dispatchWorkflowId !== null && dispatchWorkflowId === selectedWorkflowId;

  useEffect(() => {
    if (selectedRun) {
      setDisplayedRun(selectedRun);
      return;
    }
    const accountChanged = !accountRefsEqual(previousAccountRef.current, selectedAccount);
    previousAccountRef.current = selectedAccount;
    if (accountChanged) {
      setDisplayedRun(null);
      return;
    }
    const timeout = window.setTimeout(() => setDisplayedRun(null), RUN_PANEL_EXIT_MS);
    return () => window.clearTimeout(timeout);
  }, [selectedAccount, selectedRun]);

  useEffect(() => {
    setDispatchWorkflowId(null);
  }, [selectedProject?.id]);

  useEffect(() => {
    if (dispatchWorkflowId === null) return;
    if (dispatchWorkflowId !== selectedWorkflowId) {
      setDispatchWorkflowId(null);
      return;
    }
    if (!loadingDefinition && selectedDefinition && !selectedDefinition.dispatchable) {
      setDispatchWorkflowId(null);
    }
  }, [dispatchWorkflowId, loadingDefinition, selectedDefinition, selectedWorkflowId]);

  function selectWorkflowPage(workflowId: number) {
    setDispatchWorkflowId(null);
    selectWorkflow(workflowId);
  }

  function requestWorkflowDispatch(workflowId: number) {
    if (workflowId === selectedWorkflowId && !loadingDefinition && selectedDefinition) {
      if (selectedDefinition.dispatchable) setDispatchWorkflowId(workflowId);
      return;
    }
    setDispatchWorkflowId(workflowId);
    if (workflowId !== selectedWorkflowId) selectWorkflow(workflowId);
  }

  const sidebar = (
    <GitHubActionsSidebar
      projects={activeProjects}
      selectedProjectId={selectedProject?.id ?? null}
      accounts={accounts}
      {...(selectedAccount ? { selectedAccount } : {})}
      {...(resolvedAccount ? { resolvedAccount } : {})}
      workflows={workflows}
      selectedWorkflowId={selectedWorkflowId}
      pinnedWorkflowIds={pinnedWorkflowIds}
      loading={loadingWorkflows}
      onClose={props.onClose}
      onSelectProject={openGitHubActions}
      onSelectAccount={setProjectGhAccount}
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
          <header className="flex min-h-[76px] shrink-0 flex-wrap items-start justify-between gap-3 border-b border-[var(--hairline)] px-5 py-4">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-foreground">
                {selectedWorkflow.name}
              </h1>
              <p className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap font-mono text-[11px] text-muted">
                <span className="min-w-0 truncate">{selectedWorkflow.path}</span>
                {definition?.triggers.length ? (
                  <span className="min-w-0 truncate border-l border-[var(--hairline)] pl-2">
                    <Trans>Triggers:</Trans> {definition.triggers.join(", ")}
                  </span>
                ) : null}
              </p>
            </div>
            {selectedProject && (selectedDefinition?.dispatchable || dispatchOpen) ? (
              <GitHubActionsDispatchPopover
                workflow={selectedWorkflow}
                definition={selectedDefinition}
                projectId={selectedProject.id}
                isOpen={dispatchOpen}
                isDefinitionLoading={
                  !selectedDefinition || (loadingDefinition && !selectedDefinition.dispatchable)
                }
                isPending={dispatching}
                onOpenChange={(isOpen) => setDispatchWorkflowId(isOpen ? selectedWorkflowId : null)}
                onRefChange={selectDefinitionRef}
                onRun={dispatchWorkflow}
              />
            ) : loadingDefinition || !selectedDefinition ? (
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

          <section className="@container min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">
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
                <RefreshCw
                  className={`size-3.5 ${loadingRuns && runs.length > 0 ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
            <GitHubActionsRunList
              runs={runs}
              selectedRunId={selectedRunId}
              loading={loadingRuns}
              pendingRunId={pendingRunId}
              onSelectRun={selectRun}
              onRerun={(run, failedOnly) => void rerunWorkflow(run, failedOnly)}
              onCancel={(run) => void cancelWorkflow(run)}
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
        sidebarHeaderChildren={
          <div className="poracode-overlay-header__controls flex items-center">
            <Tooltip delay={150}>
              <Tooltip.Trigger>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className="size-6 min-w-0 text-muted hover:text-foreground"
                  aria-label={t`Refresh workflows`}
                  isDisabled={loadingWorkflows}
                  onPress={refresh}
                >
                  <RefreshCw className={`size-3.5 ${loadingWorkflows ? "animate-spin" : ""}`} />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content placement="bottom">
                <Trans>Refresh workflows</Trans>
              </Tooltip.Content>
            </Tooltip>
          </div>
        }
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
              onCancel={() => void cancelWorkflow(displayedRun)}
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
