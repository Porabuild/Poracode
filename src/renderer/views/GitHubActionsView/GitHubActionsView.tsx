import { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Play, RefreshCw, Workflow } from "lucide-react";
import { ConfirmDialog } from "@/renderer/components/common";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { GitHubActionsDispatchPopover } from "./GitHubActionsDispatchPopover";
import { GitHubActionsMobileWorkflowList } from "./GitHubActionsMobileWorkflowList";
import { GitHubActionsRunDetail } from "./GitHubActionsRunDetail";
import { GitHubActionsRunList } from "./GitHubActionsRunList";
import { GitHubActionsSidebar } from "./GitHubActionsSidebar";
import { useGitHubActionsViewModel } from "./useGitHubActionsViewModel";

const EMPTY_PINNED_WORKFLOWS: number[] = [];
const RUN_PANEL_EXIT_MS = 200;
type CompactActionsPage = "workflows" | "runs" | "run";

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
  const compactLayout = useCompactLayout();
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
  } = useGitHubActionsViewModel(props);
  const pinnedByProject = useSidebarUiStore((state) => state.pinnedGitHubWorkflows);
  const togglePinnedWorkflow = useSidebarUiStore((state) => state.togglePinnedGitHubWorkflow);
  const pinnedWorkflowIds = selectedProject
    ? (pinnedByProject[selectedProject.id] ?? EMPTY_PINNED_WORKFLOWS)
    : EMPTY_PINNED_WORKFLOWS;
  const [dispatchWorkflowId, setDispatchWorkflowId] = useState<number | null>(null);
  const [displayedRun, setDisplayedRun] = useState(selectedRun);
  const [compactPage, setCompactPage] = useState<CompactActionsPage>(
    props.runId ? "run" : "workflows",
  );
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
    setCompactPage(props.runId ? "run" : "workflows");
  }, [props.runId, selectedProject?.id]);

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
    if (compactLayout) setCompactPage("runs");
  }

  function selectRunPage(runId: number | null) {
    selectRun(runId);
    if (compactLayout && runId !== null) setCompactPage("run");
  }

  function compactBack() {
    if (compactPage === "run") {
      selectRun(null);
      setCompactPage("runs");
      return;
    }
    if (compactPage === "runs") {
      setCompactPage("workflows");
      return;
    }
    props.onClose();
  }

  function requestWorkflowDispatch(workflowId: number) {
    if (workflowId === selectedWorkflowId && !loadingDefinition && selectedDefinition) {
      if (selectedDefinition.dispatchable) setDispatchWorkflowId(workflowId);
      return;
    }
    setDispatchWorkflowId(workflowId);
    if (workflowId !== selectedWorkflowId) selectWorkflow(workflowId);
  }

  function toggleWorkflowPin(workflowId: number) {
    if (selectedProject) togglePinnedWorkflow(selectedProject.id, workflowId);
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
      onSelect={selectWorkflowPage}
      onRun={requestWorkflowDispatch}
      onTogglePin={toggleWorkflowPin}
    />
  );

  const content = (
    <div className="relative flex h-full min-h-0 flex-col bg-[var(--content-background)]">
      {loadError ? (
        <div
          role="alert"
          className="m-page-content shrink-0 border-b border-danger/25 bg-danger/5 px-4 py-2 text-xs text-danger"
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
          <header
            className={`m-page-content flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-[var(--hairline)] px-5 ${compactLayout ? "pb-3 pt-0" : "min-h-[76px] py-4"}`}
          >
            <div className="min-w-0">
              {!compactLayout ? (
                <h1 className="truncate text-base font-semibold text-foreground">
                  {selectedWorkflow.name}
                </h1>
              ) : null}
              <p
                className={`${compactLayout ? "" : "mt-1"} flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap font-mono text-[11px] text-muted`}
              >
                <span className="min-w-0 truncate">{selectedWorkflow.path}</span>
                {selectedDefinition?.triggers.length ? (
                  <span className="min-w-0 truncate border-l border-[var(--hairline)] pl-2">
                    <Trans>Triggers:</Trans> {selectedDefinition.triggers.join(", ")}
                  </span>
                ) : null}
              </p>
            </div>
            {!compactLayout &&
            selectedProject &&
            (selectedDefinition?.dispatchable || dispatchOpen) ? (
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
            ) : !compactLayout && (loadingDefinition || !selectedDefinition) ? (
              <Button variant="primary" isDisabled>
                <Play className="size-4" />
                <Trans>Run workflow</Trans>
              </Button>
            ) : selectedDefinition && !selectedDefinition.dispatchable ? (
              <p className="text-xs text-muted">
                <Trans>This workflow cannot be started manually.</Trans>
              </p>
            ) : null}
          </header>

          <section
            className={`m-page-content @container min-h-0 min-w-0 flex-1 overflow-y-auto px-5 pt-4 [scrollbar-gutter:stable] ${compactLayout ? "pb-[calc(var(--m-floating-control-height)+1.75rem+env(safe-area-inset-bottom))]" : "pb-4"}`}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  <Trans>Workflow runs</Trans>
                </h2>
                <p className="text-[11px] text-muted">
                  {runs.length === 1 ? <Trans>1 run</Trans> : <Trans>{runs.length} runs</Trans>}
                </p>
              </div>
              {!compactLayout ? (
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
              ) : null}
            </div>
            <GitHubActionsRunList
              runs={runs}
              selectedRunId={selectedRunId}
              loading={loadingRuns}
              pendingRunId={pendingRunId}
              onSelectRun={selectRunPage}
              onRerun={(run, failedOnly) => void rerunWorkflow(run, failedOnly)}
              onCancel={(run) => void cancelWorkflow(run)}
              onDelete={setDeleteRun}
            />
          </section>
          {compactLayout && selectedProject ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-10 flex justify-between gap-[var(--m-floating-control-gap)] px-[var(--m-page-inline)]">
              <MobileCircleButton
                className="pointer-events-auto"
                aria-label={t`Refresh workflow runs`}
                isDisabled={loadingRuns}
                onPress={refreshRuns}
              >
                <RefreshCw
                  className={`size-4 ${loadingRuns && runs.length > 0 ? "animate-spin" : ""}`}
                />
              </MobileCircleButton>
              {selectedDefinition?.dispatchable || dispatchOpen ? (
                <GitHubActionsDispatchPopover
                  workflow={selectedWorkflow}
                  definition={selectedDefinition}
                  projectId={selectedProject.id}
                  isOpen={dispatchOpen}
                  isDefinitionLoading={
                    !selectedDefinition || (loadingDefinition && !selectedDefinition.dispatchable)
                  }
                  isPending={dispatching}
                  trigger={
                    <MobileCircleButton
                      className="pointer-events-auto"
                      aria-label={t`Run workflow`}
                      onPress={() => setDispatchWorkflowId(selectedWorkflowId)}
                    >
                      <Play className="size-4" />
                    </MobileCircleButton>
                  }
                  onOpenChange={(isOpen) =>
                    setDispatchWorkflowId(isOpen ? selectedWorkflowId : null)
                  }
                  onRefChange={selectDefinitionRef}
                  onRun={dispatchWorkflow}
                />
              ) : loadingDefinition || !selectedDefinition ? (
                <MobileCircleButton
                  className="pointer-events-auto"
                  aria-label={t`Run workflow`}
                  isDisabled
                >
                  <Play className="size-4" />
                </MobileCircleButton>
              ) : null}
            </div>
          ) : null}
        </>
      ) : workflows.length === 0 && !loadingWorkflows && !loadError ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
          <div>
            <Workflow className="mx-auto mb-3 size-8 text-muted" />
            <p className="text-sm font-medium text-foreground">
              <Trans>No active workflows in this repository.</Trans>
            </p>
            <p className="mt-1 text-xs text-muted">
              <Trans>Workflows added under .github/workflows will appear here.</Trans>
            </p>
          </div>
        </div>
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

  const mobileContent = (
    <div className="flex h-full min-h-0 flex-col bg-[var(--content-background)]">
      {loadError && compactPage !== "runs" ? (
        <div
          role="alert"
          className="m-page-content shrink-0 border-b border-danger/25 bg-danger/5 px-4 py-2 text-xs text-danger"
        >
          {loadError}
        </div>
      ) : null}

      {compactPage === "workflows" ? (
        activeProjects.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
            <div className="text-muted">
              <Workflow className="mx-auto mb-3 size-8" />
              <p className="text-sm font-medium text-foreground">
                <Trans>Add a project to use GitHub Actions.</Trans>
              </p>
            </div>
          </div>
        ) : (
          <>
            <GitHubActionsMobileWorkflowList
              projects={activeProjects}
              selectedProjectId={selectedProject?.id ?? null}
              workflows={workflows}
              pinnedWorkflowIds={pinnedWorkflowIds}
              loading={loadingWorkflows}
              onSelectProject={openGitHubActions}
              onSelectWorkflow={selectWorkflowPage}
              onRunWorkflow={requestWorkflowDispatch}
              onTogglePin={toggleWorkflowPin}
            />
            {dispatchOpen && selectedProject && selectedWorkflow ? (
              <GitHubActionsDispatchPopover
                workflow={selectedWorkflow}
                definition={selectedDefinition}
                projectId={selectedProject.id}
                isOpen
                isDefinitionLoading={
                  !selectedDefinition || (loadingDefinition && !selectedDefinition.dispatchable)
                }
                isPending={dispatching}
                trigger={null}
                onOpenChange={(isOpen) => setDispatchWorkflowId(isOpen ? selectedWorkflowId : null)}
                onRefChange={selectDefinitionRef}
                onRun={dispatchWorkflow}
              />
            ) : null}
          </>
        )
      ) : compactPage === "run" ? (
        displayedRun ? (
          <GitHubActionsRunDetail
            run={displayedRun}
            loading={loadingRun}
            isPending={pendingRunId === displayedRun.id}
            onClose={compactBack}
            onRefresh={refreshRun}
            onRerun={(failedOnly) => void rerunWorkflow(displayedRun, failedOnly)}
            onCancel={() => void cancelWorkflow(displayedRun)}
            onDelete={() => setDeleteRun(displayedRun)}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center text-muted">
            <Workflow className="size-8" />
          </div>
        )
      ) : (
        content
      )}
    </div>
  );

  const compactTitle =
    compactPage === "runs"
      ? (selectedWorkflow?.name ?? t`GitHub Actions`)
      : compactPage === "run"
        ? displayedRun
          ? `#${displayedRun.number}`
          : t`Workflow run`
        : t`CI Actions: Workflows`;

  return (
    <>
      <PageLayout
        title={t`GitHub Actions`}
        compactTitle={compactTitle}
        compactBackLabel={compactPage === "workflows" ? t`Return to app` : t`Back`}
        onCompactBack={compactBack}
        mobileNavigation
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
        content={compactLayout ? mobileContent : content}
        rightPanel={
          !compactLayout && displayedRun ? (
            <GitHubActionsRunDetail
              run={displayedRun}
              loading={loadingRun}
              isPending={pendingRunId === displayedRun.id}
              onClose={() => selectRunPage(null)}
              onRefresh={refreshRun}
              onRerun={(failedOnly) => void rerunWorkflow(displayedRun, failedOnly)}
              onCancel={() => void cancelWorkflow(displayedRun)}
              onDelete={() => setDeleteRun(displayedRun)}
            />
          ) : null
        }
        rightPanelOpen={!compactLayout && selectedRun !== null}
        rightPanelPlacement="right"
        rightPanelResizeLabel={t`Resize run details`}
        onRequestClosePanels={() => selectRunPage(null)}
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
