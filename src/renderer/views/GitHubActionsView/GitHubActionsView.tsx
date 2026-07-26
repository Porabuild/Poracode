import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Play, RefreshCw, Workflow } from "lucide-react";
import { ConfirmDialog, Select } from "@/renderer/components/common";
import { GitHubActionsDispatchPopover } from "./GitHubActionsDispatchPopover";
import { GitHubActionsRunDetail } from "./GitHubActionsRunDetail";
import { GitHubActionsRunList } from "./GitHubActionsRunList";
import { useGitHubActionsViewModel } from "./useGitHubActionsViewModel";

export function GitHubActionsView(props: { projectId?: string; runId?: number }) {
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
    refreshRun,
    refreshRuns,
    rerunWorkflow,
    selectRun,
    selectWorkflow,
    setDefinitionRef,
    setDeleteRun,
  } = useGitHubActionsViewModel(props);

  return (
    <div className="mx-auto min-h-full w-full max-w-[1500px]">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 pt-2">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            <Trans>GitHub Actions</Trans>
          </h1>
          <p className="mt-1 text-sm text-muted">
            <Trans>Start workflows and monitor their runs for each project.</Trans>
          </p>
        </div>
        {activeProjects.length > 0 ? (
          <div className="w-64 max-w-full">
            <Select
              aria-label={t`Project`}
              options={projectOptions}
              value={selectedProject?.id ?? null}
              onChange={(projectId) => openGitHubActions(projectId)}
            />
          </div>
        ) : null}
      </div>

      {activeProjects.length === 0 ? (
        <div className="py-20 text-center text-muted">
          <Workflow className="mx-auto mb-3 size-8" />
          <p className="text-sm font-medium text-foreground">
            <Trans>Add a project to use GitHub Actions.</Trans>
          </p>
        </div>
      ) : (
        <>
          {loadError ? (
            <div
              role="alert"
              className="mb-4 border-y border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger"
            >
              {loadError}
            </div>
          ) : null}

          <div className="grid min-h-[560px] border-y border-[var(--hairline)] lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="border-b border-[var(--hairline)] py-3 lg:border-r lg:border-b-0">
              <div className="flex items-center justify-between px-3 pb-2">
                <h2 className="text-xs font-semibold text-foreground">
                  <Trans>Workflows</Trans>
                </h2>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  isDisabled={loadingWorkflows || loadingRuns}
                  aria-label={t`Refresh`}
                  onPress={refresh}
                >
                  <RefreshCw
                    className={`size-3.5 ${loadingWorkflows || loadingRuns ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
              <nav className="space-y-0.5 px-2" aria-label={t`Workflows`}>
                {workflows.map((workflow) => (
                  <Button
                    key={workflow.id}
                    variant="ghost"
                    className={`w-full rounded-md px-2 py-2 text-left transition-colors ${
                      workflow.id === selectedWorkflowId
                        ? "bg-surface-secondary text-foreground"
                        : "text-muted hover:bg-surface-secondary/60 hover:text-foreground"
                    }`}
                    {...(workflow.id === selectedWorkflowId
                      ? { "aria-current": "page" as const }
                      : {})}
                    onPress={() => selectWorkflow(workflow.id)}
                  >
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-xs font-medium">{workflow.name}</span>
                      <span className="mt-0.5 block truncate text-[10px]">{workflow.path}</span>
                    </span>
                  </Button>
                ))}
                {!loadingWorkflows && workflows.length === 0 ? (
                  <p className="px-2 py-8 text-center text-xs text-muted">
                    <Trans>No active workflows found.</Trans>
                  </p>
                ) : null}
              </nav>
            </aside>

            <main className="min-w-0">
              {selectedWorkflow ? (
                <>
                  <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-foreground">
                        {selectedWorkflow.name}
                      </h2>
                      <p className="mt-1 truncate font-mono text-[11px] text-muted">
                        {selectedWorkflow.path}
                      </p>
                      {definition?.triggers.length ? (
                        <p className="mt-2 text-xs text-muted">
                          <Trans>Triggers:</Trans> {definition.triggers.join(", ")}
                        </p>
                      ) : null}
                    </div>
                    {definition?.dispatchable ? (
                      <GitHubActionsDispatchPopover
                        workflow={selectedWorkflow}
                        definition={definition}
                        refs={refOptions}
                        isDefinitionLoading={loadingDefinition}
                        isPending={dispatching}
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

                  <div
                    className={
                      selectedRun
                        ? "grid min-w-0 xl:grid-cols-[minmax(420px,1.1fr)_minmax(360px,0.9fr)]"
                        : "min-w-0"
                    }
                  >
                    <section className="min-w-0 px-4 py-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">
                            <Trans>Workflow runs</Trans>
                          </h3>
                          <p className="text-[11px] text-muted">
                            {runs.length === 1 ? (
                              <Trans>1 run</Trans>
                            ) : (
                              <Trans>{runs.length} runs</Trans>
                            )}
                          </p>
                        </div>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
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
                    {selectedRun ? (
                      <GitHubActionsRunDetail
                        run={selectedRun}
                        loading={loadingRun}
                        isPending={pendingRunId === selectedRun.id}
                        onClose={() => selectRun(null)}
                        onRefresh={refreshRun}
                        onRerun={(failedOnly) => void rerunWorkflow(selectedRun, failedOnly)}
                        onDelete={() => setDeleteRun(selectedRun)}
                      />
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="flex min-h-[480px] items-center justify-center px-6 text-center">
                  <div>
                    <Workflow className="mx-auto mb-3 size-8 text-muted" />
                    <p className="text-sm font-medium text-foreground">
                      <Trans>Select a workflow to see its runs.</Trans>
                    </p>
                  </div>
                </div>
              )}
            </main>
          </div>
        </>
      )}

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
    </div>
  );
}
