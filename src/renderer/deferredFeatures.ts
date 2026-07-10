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

export const DeferredRemoteThreadView = preloadable(() =>
  import("@/renderer/views/RemoteThreadView/RemoteThreadView").then(
    (module) => module.RemoteThreadView,
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

export const DeferredInlineDiffView = preloadable(() =>
  import("@/renderer/components/thread/ChatPane/parts/items/InlineDiffView").then(
    (module) => module.InlineDiffView,
  ),
);

const prewarmTasks = [
  DeferredCommandPalette.preload,
  DeferredItemMarkdownInner.preload,
  DeferredSettingsOverlay.preload,
  DeferredCreateProjectModal.preload,
  DeferredCloneProjectModal.preload,
  DeferredProjectSettingsOverlay.preload,
  DeferredProjectAuxiliaryPanel.preload,
  DeferredDevTerminalPanel.preload,
  DeferredBrowserHost.preload,
  DeferredRemoteThreadView.preload,
  DeferredLoginTerminalOverlay.preload,
  DeferredFileEditorPanel.preload,
  DeferredFileEditorOverlay.preload,
  DeferredGitReviewPanel.preload,
  DeferredGitReviewOverlay.preload,
  DeferredPrReviewOverlay.preload,
  DeferredInlineDiffView.preload,
] as const;

let nextPrewarmTask = 0;
let prewarmRunning = false;

export function startDeferredFeaturePrewarm(): () => void {
  if (prewarmRunning || nextPrewarmTask >= prewarmTasks.length) return () => {};

  prewarmRunning = true;
  let cancelled = false;
  let idleId: number | null = null;
  let timeoutId: number | null = null;

  const scheduleNext = () => {
    if (cancelled || nextPrewarmTask >= prewarmTasks.length) {
      prewarmRunning = false;
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
    const task = prewarmTasks[nextPrewarmTask++];
    if (!task) {
      prewarmRunning = false;
      return;
    }
    void task()
      .catch(() => undefined)
      .finally(scheduleNext);
  };

  scheduleNext();

  return () => {
    cancelled = true;
    prewarmRunning = false;
    if (idleId !== null) window.cancelIdleCallback?.(idleId);
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
}
