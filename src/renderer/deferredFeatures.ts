import { preloadable } from "@/renderer/utils/preloadable";

export const DeferredCommandPalette = preloadable(() =>
  import("@/renderer/commands/CommandPalette").then((module) => module.CommandPalette),
);

export const DeferredItemMarkdownInner = preloadable(() =>
  import("@/renderer/components/thread/ChatPane/parts/items/ItemMarkdownInner").then(
    (module) => module.default,
  ),
);

export const DeferredSettingsOverlay = preloadable(() =>
  import("@/renderer/views/SettingsOverlay/SettingsOverlay").then(
    (module) => module.SettingsOverlay,
  ),
);

export const DeferredProjectSettingsOverlay = preloadable(() =>
  import("@/renderer/views/ProjectSettingsOverlay/ProjectSettingsOverlay").then(
    (module) => module.ProjectSettingsOverlay,
  ),
);

export const DeferredCreateProjectModal = preloadable(() =>
  import("@/renderer/views/MainView/parts/CreateProject/CreateProjectModal").then(
    (module) => module.CreateProjectModal,
  ),
);

export const DeferredCloneProjectModal = preloadable(() =>
  import("@/renderer/views/MainView/parts/CreateProject/CloneProjectModal").then(
    (module) => module.CloneProjectModal,
  ),
);

export const DeferredProjectAuxiliaryPanel = preloadable(() =>
  import("@/renderer/views/MainView/parts/ProjectAuxiliaryPanel").then(
    (module) => module.ProjectAuxiliaryPanel,
  ),
);

export const DeferredMobileWorkspacePage = preloadable(() =>
  import("@/renderer/views/MainView/parts/MobileWorkspacePage").then(
    (module) => module.MobileWorkspacePage,
  ),
);

export const DeferredDevTerminalPanel = preloadable(() =>
  import("@/renderer/views/MainView/parts/RightPanel/parts/DevTerminalPanel/DevTerminalPanel").then(
    (module) => module.DevTerminalPanel,
  ),
);

export const DeferredBrowserHost = preloadable(() =>
  import("@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/BrowserHost").then(
    (module) => module.BrowserHost,
  ),
);

export const DeferredLoginTerminalOverlay = preloadable(() =>
  import("@/renderer/views/LoginTerminalOverlay/LoginTerminalOverlay").then(
    (module) => module.LoginTerminalOverlay,
  ),
);

export const DeferredFileEditorPanel = preloadable(() =>
  import("@/renderer/views/FileEditorOverlay/parts/FileEditorPanel").then(
    (module) => module.FileEditorPanel,
  ),
);

export const DeferredFileEditorOverlay = preloadable(() =>
  import("@/renderer/views/FileEditorOverlay/FileEditorOverlay").then(
    (module) => module.FileEditorOverlay,
  ),
);

export const DeferredGitReviewPanel = preloadable(() =>
  import("@/renderer/views/GitReviewOverlay/parts/GitReviewPanel").then(
    (module) => module.GitReviewPanel,
  ),
);

export const DeferredGitReviewOverlay = preloadable(() =>
  import("@/renderer/views/GitReviewOverlay/GitReviewOverlay").then(
    (module) => module.GitReviewOverlay,
  ),
);

export const DeferredPrReviewOverlay = preloadable(() =>
  import("@/renderer/views/PrReviewOverlay/PrReviewOverlay").then(
    (module) => module.PrReviewOverlay,
  ),
);

export const DeferredGitHubActionsView = preloadable(() =>
  import("@/renderer/views/GitHubActionsView/GitHubActionsView").then(
    (module) => module.GitHubActionsView,
  ),
);

export const DeferredInlineDiffView = preloadable(() =>
  import("@/renderer/components/thread/ChatPane/parts/items/InlineDiffView").then(
    (module) => module.InlineDiffView,
  ),
);

const desktopPrewarmTasks = [
  // Terminal panels initialize xterm and its addons when they first mount.
  // Warm desktop panel layouts first so that work does not compete with the
  // panel's first-open animation.
  DeferredDevTerminalPanel.preload,
  DeferredProjectAuxiliaryPanel.preload,
  DeferredCommandPalette.preload,
  DeferredItemMarkdownInner.preload,
  DeferredSettingsOverlay.preload,
  DeferredCreateProjectModal.preload,
  DeferredCloneProjectModal.preload,
  DeferredProjectSettingsOverlay.preload,
  DeferredBrowserHost.preload,
  DeferredLoginTerminalOverlay.preload,
  DeferredFileEditorPanel.preload,
  DeferredFileEditorOverlay.preload,
  DeferredGitReviewPanel.preload,
  DeferredGitReviewOverlay.preload,
  DeferredPrReviewOverlay.preload,
  DeferredGitHubActionsView.preload,
  DeferredInlineDiffView.preload,
] as const;

const compactPrewarmTasks = [
  DeferredMobileWorkspacePage.preload,
  DeferredItemMarkdownInner.preload,
  DeferredSettingsOverlay.preload,
  DeferredProjectSettingsOverlay.preload,
  DeferredGitReviewPanel.preload,
  DeferredGitReviewOverlay.preload,
  DeferredPrReviewOverlay.preload,
  DeferredGitHubActionsView.preload,
  DeferredInlineDiffView.preload,
] as const;

export type DeferredFeaturePrewarmTarget = "desktop" | "compact";

const prewarmState: Record<DeferredFeaturePrewarmTarget, { nextTask: number; running: boolean }> = {
  desktop: { nextTask: 0, running: false },
  compact: { nextTask: 0, running: false },
};

export function startDeferredFeaturePrewarm(
  target: DeferredFeaturePrewarmTarget = "desktop",
): () => void {
  const tasks = target === "compact" ? compactPrewarmTasks : desktopPrewarmTasks;
  const state = prewarmState[target];
  if (state.running || state.nextTask >= tasks.length) return () => {};

  state.running = true;
  let cancelled = false;
  let idleId: number | null = null;
  let timeoutId: number | null = null;

  const scheduleNext = () => {
    if (cancelled || state.nextTask >= tasks.length) {
      state.running = false;
      return;
    }
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(runNext, { timeout: 250 });
    } else {
      timeoutId = window.setTimeout(runNext, 250);
    }
  };

  const runNext = () => {
    idleId = null;
    timeoutId = null;
    if (cancelled) return;
    const task = tasks[state.nextTask++];
    if (!task) {
      state.running = false;
      return;
    }
    void task()
      .catch(() => undefined)
      .finally(scheduleNext);
  };

  scheduleNext();

  return () => {
    cancelled = true;
    state.running = false;
    if (idleId !== null) window.cancelIdleCallback?.(idleId);
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
}
