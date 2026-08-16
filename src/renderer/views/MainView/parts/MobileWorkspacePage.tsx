import { GitBranch } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { LightballTabs, type LightballTab } from "@/renderer/components/common";
import { MobilePageBottomBar } from "@/renderer/components/layout/MobilePageBottomActions";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { showFilesPanel } from "@/renderer/actions/panelActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { buildFileEditorContext, resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { ProjectFilesPanel } from "@/renderer/views/FileEditorOverlay/parts/ProjectFilesPanel";
import { GitReviewPanelContent } from "./RightPanel/parts/GitReviewPanelContent";

type MobileWorkspaceTab = "changes" | "files";

/** Dedicated compact PWA page for the project Git status and file tree. */
export function MobileWorkspacePage() {
  const { t } = useLingui();
  const gitReviewContext = usePanelStore((state) => state.gitReviewContext);
  const rightPanelTab = usePanelStore((state) => state.rightPanelTab);
  const project = useAppStore((state) =>
    gitReviewContext
      ? state.projects.find((candidate) => candidate.id === gitReviewContext.projectId)
      : undefined,
  );
  const activeTab: MobileWorkspaceTab = rightPanelTab === "files" ? "files" : "changes";
  const worktreePath = gitReviewContext?.worktreePath;
  const gitStatus = useGitStore((state) =>
    worktreePath
      ? state.worktreeStatuses[worktreePath]
      : project
        ? state.statuses[project.id]
        : undefined,
  );
  const resolvedWorktreeBranch =
    project && worktreePath ? resolveWorktreeBranch(project.id, worktreePath) : undefined;
  const branchLabel = gitStatus?.branch ?? resolvedWorktreeBranch ?? project?.name ?? t`Git`;
  const filesRootContext = project
    ? buildFileEditorContext(project, worktreePath, resolvedWorktreeBranch)
    : null;
  const tabs: ReadonlyArray<LightballTab<MobileWorkspaceTab>> = [
    { id: "changes", label: t`Changes` },
    { id: "files", label: t`Files` },
  ];

  function closePage() {
    const panelStore = usePanelStore.getState();
    panelStore.setGitOverlayOpen(false);
    panelStore.setGitReviewContext(null);
    panelStore.setFilesPanelContext(null);
    panelStore.closeMobileUtilityPage();
  }

  function selectTab(tab: MobileWorkspaceTab) {
    if (tab === "changes") {
      usePanelStore.getState().setRightPanelTab("git");
      return;
    }
    if (project) {
      showFilesPanel(project.id, worktreePath);
    }
  }

  return (
    <PageLayout
      title={t`Git`}
      compactTitle={project?.name ?? t`Git`}
      compactHeaderChildren={
        <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1">
          <GitBranch className="size-3.5 shrink-0 text-muted" />
          <span className="min-w-0 truncate text-sm font-semibold">{branchLabel}</span>
        </div>
      }
      onCompactBack={closePage}
      sidebar={<></>}
      mobileNavigation
      content={
        <section className="m-mobile-workspace flex h-full min-h-0 flex-col bg-[var(--background)]">
          <div className="m-mobile-workspace__panels relative flex min-h-0 flex-1 overflow-hidden">
            <div
              id="mobile-workspace-changes-panel"
              role="tabpanel"
              aria-label={t`Changes`}
              hidden={activeTab !== "changes"}
              className="h-full min-h-0 flex-1 overflow-hidden"
            >
              <GitReviewPanelContent
                gitPanelContext={gitReviewContext}
                onClose={closePage}
                onExpandToOverlay={() => undefined}
                hideToolbar
                touchMode
                compactHeaderActions={activeTab === "changes"}
              />
            </div>
            <div
              id="mobile-workspace-files-panel"
              role="tabpanel"
              aria-label={t`Files`}
              hidden={activeTab !== "files"}
              className="h-full min-h-0 flex-1 overflow-hidden"
            >
              {filesRootContext ? (
                <ProjectFilesPanel
                  rootContext={filesRootContext}
                  compact
                  compactActionsVisible={activeTab === "files"}
                />
              ) : null}
            </div>
          </div>

          <MobilePageBottomBar className="m-mobile-workspace__tabbar mx-3 mt-1.5 shrink-0">
            <LightballTabs
              tabs={tabs}
              active={activeTab}
              onChange={selectTab}
              ariaLabel={t`Workspace view`}
              className="m-mobile-workspace__tabs w-full"
              equalWidth
              delayActiveText
              shape="rounded"
            />
          </MobilePageBottomBar>
        </section>
      }
    />
  );
}
