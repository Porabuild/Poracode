import { useLingui } from "@lingui/react/macro";
import { LightballTabs, type LightballTab } from "@/renderer/components/common";
import { MobilePageBottomBar } from "@/renderer/components/layout/MobilePageBottomActions";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { showFilesPanel } from "@/renderer/actions/panelActions";
import { useAppStore } from "@/renderer/state/appStore";
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
  const resolvedWorktreeBranch =
    project && worktreePath ? resolveWorktreeBranch(project.id, worktreePath) : undefined;
  const filesRootContext = project
    ? buildFileEditorContext(project, worktreePath, resolvedWorktreeBranch)
    : null;
  const tabs: ReadonlyArray<LightballTab<MobileWorkspaceTab>> = [
    { id: "files", label: t`Files` },
    { id: "changes", label: t`Git` },
  ];
  const pageTitle = activeTab === "files" ? t`Files` : t`Git`;

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
      compactTitle={pageTitle}
      compactHeaderChildren={
        <div className="pointer-events-none absolute left-1/2 min-w-0 max-w-[60%] -translate-x-1/2 truncate text-sm font-semibold">
          {pageTitle}
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
              className="m-floating-selector m-mobile-workspace__tabs w-full"
              equalWidth
              delayActiveText
              shape="pill"
            />
          </MobilePageBottomBar>
        </section>
      }
    />
  );
}
