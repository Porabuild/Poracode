import { lazy, Suspense } from "react";
import { AlertDialog } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
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

import { readBridge } from "@/renderer/bridge";
import { Button } from "@/renderer/components/common/Button";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import type { UsageLoginConfirmationAction } from "@/shared/contracts";
import { WelcomeOverlay } from "@/renderer/views/WelcomeOverlay";
import { WhatsNewOverlay } from "@/renderer/views/WhatsNewOverlay";
import { BrowserHost } from "@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/BrowserHost";
import { LoginTerminalOverlay } from "@/renderer/views/LoginTerminalOverlay/LoginTerminalOverlay";
import { CreateProjectModal } from "@/renderer/views/MainView/parts/CreateProject/CreateProjectModal";
import { CloneProjectModal } from "@/renderer/views/MainView/parts/CreateProject/CloneProjectModal";
import { NewExperimentModal } from "@/renderer/components/experiment/NewExperimentModal";

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

  return (
    <>
      <WelcomeOverlay />
      <WhatsNewOverlay />
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
              key={`${gitReviewContext.projectId}:${gitReviewContext.worktreePath ?? ""}`}
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
              prKey={
                prReviewContext.prKey ??
                resolvePrKey(prReviewContext.projectId, prReviewContext.worktreePath)
              }
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
      <BrowserHost />
      <UsageLoginConfirmationDialog />
      <LoginTerminalOverlay />
      <CreateProjectModal />
      <CloneProjectModal />
      <NewExperimentModal />
    </>
  );
}

function UsageLoginConfirmationDialog() {
  const request = useBrowserPanelStore((s) => s.usageLoginConfirmation);

  if (!request) return null;
  const activeRequest = request;

  function respond(action: UsageLoginConfirmationAction) {
    const requestId = activeRequest.requestId;
    useBrowserPanelStore.getState().clearUsageLoginConfirmation(requestId);
    void readBridge()
      .resolveUsageLoginConfirmation({ requestId, action })
      .catch(() => {});
  }

  return (
    <AlertDialog.Backdrop
      isOpen
      onOpenChange={(open) => !open && respond("cancel")}
      // This confirmation is part of the browser-driven usage login, so it must
      // sit above the browser drawer/overlay (z-60 / z-80 maximized) that hosts
      // the login page — the default z-50 backdrop renders behind it.
      className="!z-[90]"
    >
      <AlertDialog.Container size="sm">
        <AlertDialog.Dialog className="sm:max-w-[420px] !p-4">
          <AlertDialog.Header className="gap-1">
            <AlertDialog.Heading>
              <Trans>Use detected session?</Trans>
            </AlertDialog.Heading>
            <p className="text-sm leading-5 text-muted">
              <Trans>Found a signed-in {activeRequest.providerLabel} session.</Trans>
            </p>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p className="text-sm leading-5 text-muted">
              <Trans>
                Use this account for usage tracking, or change users in the browser before
                continuing.
              </Trans>
            </p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button slot="close" variant="ghost" className="text-muted">
              <Trans>Cancel</Trans>
            </Button>
            <Button variant="tertiary" onPress={() => respond("change")}>
              <Trans>Change User</Trans>
            </Button>
            <Button variant="primary" onPress={() => respond("use")}>
              <Trans>Use Session</Trans>
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
