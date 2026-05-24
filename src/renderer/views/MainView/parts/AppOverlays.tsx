import { lazy, Suspense } from "react";
import { PixelLoader } from "@/renderer/components/common";
import { buildWorktreeLocation } from "@/shared/worktree";
import { OverlayShell } from "@/renderer/components/layout/OverlayShell";
const FileEditorOverlay = lazy(() =>
  import("@/renderer/views/FileEditorOverlay/FileEditorOverlay").then((m) => ({
    default: m.FileEditorOverlay,
  })),
);
import { ProjectSettingsOverlay } from "@/renderer/views/ProjectSettingsOverlay/ProjectSettingsOverlay";
import { SettingsOverlay } from "@/renderer/views/SettingsOverlay/SettingsOverlay";
const GitReviewOverlay = lazy(() =>
  import("@/renderer/views/GitReviewOverlay/GitReviewOverlay").then((m) => ({
    default: m.GitReviewOverlay,
  })),
);
const PrReviewOverlay = lazy(() =>
  import("@/renderer/views/PrReviewOverlay/PrReviewOverlay").then((m) => ({
    default: m.PrReviewOverlay,
  })),
);

import { useAppStore } from "@/renderer/state/appStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { resolvePrKey } from "@/renderer/state/gitSelectors";

import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { closeThreads } from "@/renderer/utils/shellUtils";
import { performWorktreeRemoval } from "@/renderer/actions/worktreeActions";

import { WelcomeOverlay } from "@/renderer/views/WelcomeOverlay";
import { BrowserOverlay } from "@/renderer/views/MainView/parts/BrowserOverlay";
import { LoginTerminalOverlay } from "@/renderer/views/LoginTerminalOverlay/LoginTerminalOverlay";

export function AppOverlays() {
  const projects = useAppStore((s) => s.projects);
  const settingsOpen = usePanelStore((s) => s.settingsOpen);
  const projectSettingsId = usePanelStore((s) => s.projectSettingsId);
  const gitOverlayOpen = usePanelStore((s) => s.gitOverlayOpen);
  const gitReviewContext = usePanelStore((s) => s.gitReviewContext);
  const gitReviewAsPanel = usePanelStore((s) => s.gitReviewAsPanel);
  const fileEditorOverlayMode = useFileEditorStore((s) => s.overlayMode);
  const fileEditorRootContext = useFileEditorStore((s) => s.rootContext);
  const setFileEditorOverlayMode = useFileEditorStore((s) => s.setOverlayMode);
  const gitReviewProject = gitReviewContext
    ? projects.find((p) => p.id === gitReviewContext.projectId)
    : undefined;
  const gitOverlayVisible = gitOverlayOpen && !!gitReviewContext && !!gitReviewProject;
  const prReviewContext = usePanelStore((s) => s.prReviewContext);
  const prReviewProject = prReviewContext
    ? projects.find((p) => p.id === prReviewContext.projectId)
    : undefined;
  const prReviewVisible = !!prReviewContext && !!prReviewProject;
  const browserOverlayOpen = usePanelStore((s) => s.browserOverlayOpen);

  return (
    <>
      <WelcomeOverlay />
      <OverlayShell open={settingsOpen} onExited={() => usePanelStore.getState().closeSettings()}>
        <SettingsOverlay onClose={() => usePanelStore.getState().closeSettings()} />
      </OverlayShell>
      <OverlayShell
        open={!!projectSettingsId}
        onExited={() => usePanelStore.getState().closeProjectSettings()}
      >
        {projectSettingsId && (
          <ProjectSettingsOverlay
            projectId={projectSettingsId}
            onClose={() => usePanelStore.getState().closeProjectSettings()}
          />
        )}
      </OverlayShell>
      <OverlayShell
        open={gitOverlayVisible}
        onExited={() => usePanelStore.getState().setGitOverlayOpen(false)}
      >
        {gitReviewContext && gitReviewProject && (
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center">
                <PixelLoader size="lg" />
              </div>
            }
          >
            <GitReviewOverlay
              project={gitReviewProject}
              {...(gitReviewContext.worktreePath
                ? {
                    locationOverride: buildWorktreeLocation(
                      gitReviewProject.location,
                      gitReviewContext.worktreePath,
                    ),
                    statusKey: gitReviewContext.worktreePath,
                    worktreePath: gitReviewContext.worktreePath,
                    worktreeBranch:
                      resolveWorktreeBranch(
                        gitReviewContext.projectId,
                        gitReviewContext.worktreePath,
                      ) ?? undefined,
                    onMergeAndRemove: () => {
                      const allThreads = useAppStore.getState().threads;
                      const wtPath = gitReviewContext!.worktreePath;
                      const wtBranch = wtPath
                        ? resolveWorktreeBranch(gitReviewContext!.projectId, wtPath)
                        : undefined;
                      usePanelStore.getState().setGitOverlayOpen(false);
                      usePanelStore.getState().setGitReviewContext(null);
                      if (wtPath) {
                        const siblings = allThreads.filter((t) => t.worktreePath === wtPath);
                        const deleteThreadStoreAction = useAppStore.getState().deleteThread;
                        for (const sib of siblings) {
                          deleteThreadStoreAction(sib.id);
                        }
                        void (async () => {
                          await closeThreads(siblings.map((sib) => sib.id));
                          await performWorktreeRemoval(gitReviewProject, wtPath, wtBranch);
                        })();
                      }
                    },
                  }
                : {})}
              onClose={() => {
                usePanelStore.getState().setGitOverlayOpen(false);
                if (!gitReviewAsPanel) usePanelStore.getState().setGitReviewContext(null);
              }}
            />
          </Suspense>
        )}
      </OverlayShell>
      <OverlayShell
        open={prReviewVisible}
        onExited={() => usePanelStore.getState().setPrReviewContext(null)}
      >
        {prReviewContext && prReviewProject && (
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center">
                <PixelLoader size="lg" />
              </div>
            }
          >
            <PrReviewOverlay
              project={prReviewProject}
              prNumber={prReviewContext.prNumber}
              prKey={resolvePrKey(prReviewContext.projectId, prReviewContext.worktreePath)}
              {...(prReviewContext.worktreePath
                ? {
                    locationOverride: buildWorktreeLocation(
                      prReviewProject.location,
                      prReviewContext.worktreePath,
                    ),
                    worktreePath: prReviewContext.worktreePath,
                  }
                : {})}
              onClose={() => usePanelStore.getState().setPrReviewContext(null)}
            />
          </Suspense>
        )}
      </OverlayShell>
      <OverlayShell
        open={fileEditorOverlayMode === "fullscreen"}
        onExited={() => setFileEditorOverlayMode(null)}
      >
        {fileEditorRootContext ? (
          <Suspense>
            <FileEditorOverlay onClose={() => setFileEditorOverlayMode(null)} />
          </Suspense>
        ) : null}
      </OverlayShell>
      <BrowserOverlay open={browserOverlayOpen} />
      <LoginTerminalOverlay />
    </>
  );
}
