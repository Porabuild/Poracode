import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLingui } from "@lingui/react/macro";
import { LightballTabs, type LightballTab } from "@/renderer/components/common";
import { MobilePageBottomBar } from "@/renderer/components/layout/MobilePageBottomActions";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import {
  lockComposeScroll,
  unlockComposeScroll,
} from "@/renderer/components/mobileComposer/composeScrollLock";
import {
  KEYBOARD_OPEN_THRESHOLD_PX,
  recallKeyboardHeight,
  rememberKeyboardHeight,
} from "@/renderer/components/mobileComposer/keyboardFocusShared";
import { isAndroidRuntime } from "@/renderer/components/mobileComposer/mobilePlatform";
import { useKeyboardOffset } from "@/renderer/components/mobileComposer/useKeyboardOffset";
import { showFilesPanel } from "@/renderer/actions/panelActions";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { buildFileEditorContext, resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { ProjectFilesPanel } from "@/renderer/views/FileEditorOverlay/parts/ProjectFilesPanel";
import { navigateBackMobilePage } from "./mobilePageHistory";
import { GitReviewPanelContent } from "./RightPanel/parts/GitReviewPanelContent";

type MobileWorkspaceTab = "changes" | "files";

/** Dedicated compact PWA page for the project Git status and file tree. */
export function MobileWorkspacePage() {
  const { t } = useLingui();
  const workspaceRef = useRef<HTMLElement | null>(null);
  const keyboardOffset = useKeyboardOffset();
  const [inputFocused, setInputFocused] = useState(false);
  const [viewportSpanOffset, setViewportSpanOffset] = useState(0);
  const gitReviewContext = usePanelStore((state) => state.gitReviewContext);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport || isAndroidRuntime()) return;
    const syncSpan = () => {
      const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
      const span = Math.max(0, Math.round(layoutHeight - viewport.height));
      setViewportSpanOffset(span > KEYBOARD_OPEN_THRESHOLD_PX ? span : 0);
    };
    syncSpan();
    viewport.addEventListener("resize", syncSpan);
    return () => viewport.removeEventListener("resize", syncSpan);
  }, []);

  const measuredLift = Math.max(keyboardOffset, viewportSpanOffset);
  const effectiveLift =
    measuredLift > KEYBOARD_OPEN_THRESHOLD_PX
      ? measuredLift
      : inputFocused && !isAndroidRuntime()
        ? recallKeyboardHeight()
        : 0;

  const previousMeasuredLiftRef = useRef(0);
  useEffect(() => {
    if (measuredLift > KEYBOARD_OPEN_THRESHOLD_PX) {
      rememberKeyboardHeight(measuredLift);
    } else if (previousMeasuredLiftRef.current > KEYBOARD_OPEN_THRESHOLD_PX) {
      // iOS "Done" can dismiss the keyboard without blurring the field. Drop
      // the lifted padding and the scroll lock so the page does not keep a
      // keyboard-sized blank band while nothing is focused for input.
      setInputFocused(false);
      unlockComposeScroll();
    }
    previousMeasuredLiftRef.current = measuredLift;
  }, [measuredLift]);

  useEffect(() => () => unlockComposeScroll(), []);
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
    if (navigateBackMobilePage()) return;
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
        <section
          ref={workspaceRef}
          className="m-mobile-workspace flex h-full min-h-0 flex-col bg-[var(--background)]"
          style={
            effectiveLift > 0
              ? ({ paddingBottom: `${effectiveLift}px` } as CSSProperties)
              : undefined
          }
          onFocusCapture={(event) => {
            if (event.target instanceof HTMLElement && event.target.closest("textarea, input")) {
              setInputFocused(true);
              lockComposeScroll(workspaceRef.current);
            }
          }}
          onBlurCapture={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && workspaceRef.current?.contains(next)) return;
            setInputFocused(false);
            unlockComposeScroll();
          }}
        >
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
