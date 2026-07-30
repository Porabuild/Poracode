import { toast } from "@heroui/react";
import { msg as linguiMsg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Suspense, useEffect, useState } from "react";
import { PixelLoader } from "./components/common/PixelLoader";
import { StartupRecoveryScreen } from "./components/startup/StartupRecoveryScreen";
import { msg } from "@/shared/messages";
import type { RuntimeEvent } from "@/shared/contracts";
import {
  isAgentStatusSupervisorEvent,
  type SupervisorEvent,
  type UpdateStatus,
} from "@/shared/ipc";
import { readBridge } from "./bridge";
import {
  handleThreadStateNotification,
  shouldInspectThreadStateForNotification,
} from "./notifications";

import { useAppStore } from "./state/appStore";
import {
  acknowledgeThread,
  archiveThread,
  deleteThread,
  openThread,
  renameThread,
  toggleMarkThreadDone,
  toggleStarThread,
} from "./actions/threadActions";
import { deleteWorktreeGroup } from "./actions/worktreeActions";
import { installRemoteGitSummaryPublisher } from "./remoteGitSummaries";
import { applyExternalSharedSettings } from "./state/sharedSettingsStore";
import { normalizeSharedSettings } from "@/shared/settings";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { recordRuntimeUsage } from "./state/usageRecorder";
import { useDevTerminalStore } from "./state/devTerminalStore";
import { applyAgentStatusSupervisorEvent, useAgentStatusesStore } from "./state/agentStatusesStore";
import { useProviderUsageStore } from "./state/providerUsageStore";
import { useUpdateStore } from "./state/updateStore";
import { clearRuntimeItemStoreSelectorCacheForThread } from "./components/thread/ChatPane/chatPaneSelectors";

import { useAppHydration } from "@/renderer/hooks/useAppHydration";
import { generateTitleAsync } from "@/renderer/utils/titleGen";
import { titlePromptFromSegments } from "@/shared/threadTitle";
import { i18n } from "@/renderer/i18n/i18n";
import { AppProvider } from "./components/ui/provider";
import { ImageLightboxHost } from "./components/composer/ImageLightbox";
import { MainView } from "@/renderer/views/MainView/MainView";
import { QuickComposerOverlay } from "@/renderer/views/QuickComposerOverlay/QuickComposerOverlay";
import { startThreadFromDraft } from "@/renderer/actions/threadLaunchActions";
import {
  primeWorktreeGitState,
  runWorktreeSetupScript,
} from "@/renderer/actions/worktreeLaunchActions";
import { useCommandPaletteStore } from "@/renderer/commands/commandPaletteStore";
import { BrowserPanel } from "@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/BrowserPanel";
import { useBrowserSync } from "@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/hooks/useBrowserSync";
import { captureAppStarted, installProductAnalytics } from "@/renderer/analytics/posthog";
import { flushProductAnalytics } from "@/renderer/analytics/productAnalytics";
import { useStandaloneWindowViewTracking } from "@/renderer/analytics/useProductViewTracking";
import { DeferredCommandPalette as PrewarmedCommandPalette } from "@/renderer/deferredFeatures";

// ── Module-level IPC listeners ──────────────────────────────────
// Subscribes to supervisor events as soon as the module loads,
// completely outside React's lifecycle.  This guarantees events are
// never missed due to useEffect timing, StrictMode double-mounts,
// or startTransition batching.
//
// Both subscribe calls return unsubscribe functions which we store
// so that Vite HMR can tear them down before re-executing the module.

let threadStateNotificationsArmed = false;
export const STARTUP_RECOVERY_TIMEOUT_MS = 15_000;
const windowKind = readBridge().windowKind;
const isBrowserExtractWindow = windowKind === "browserExtract";
const isQuickComposerWindow = windowKind === "quickComposer";
const isMainWindow = windowKind === "main";

// ── Runtime event batcher ───────────────────────────────────────
// With many concurrent streaming chats, the supervisor produces hundreds of
// `thread-runtime-event(s)` IPC messages per second. Applying each one
// synchronously triggers a Zustand `set()` and re-evaluates every subscribed
// selector. Visible panes flush once per animation frame; hidden panes flush
// four times per second. Opening a pane promotes its queued events to the next
// frame. Non-runtime events flush their own thread first so event ordering is
// preserved without forcing every background thread through the reducer.
const BACKGROUND_RUNTIME_EVENT_BATCH_MS = 250;
const pendingRuntimeEvents = new Map<string, RuntimeEvent[]>();
let runtimeFlushHandle: number | null = null;
let backgroundRuntimeFlushHandle: ReturnType<typeof setTimeout> | null = null;

function isForegroundRuntimeThread(threadId: string): boolean {
  if (document.visibilityState === "hidden") return false;
  const view = useAppStore.getState().view;
  return view.kind === "thread" && view.panes.includes(threadId);
}

function flushPendingRuntimeEvents(shouldFlush: (threadId: string) => boolean): void {
  const store = useAppStore.getState();
  const threads = store.threads;
  const batches: { threadId: string; events: RuntimeEvent[] }[] = [];
  for (const [threadId, events] of pendingRuntimeEvents) {
    if (!shouldFlush(threadId)) continue;
    batches.push({ threadId, events });
    pendingRuntimeEvents.delete(threadId);
  }
  if (batches.length === 0) return;
  // One Zustand set for all concurrent streams — avoids N selector passes when
  // several chats are working in the background / being switched between.
  store.applyRuntimeEventBatches(batches);
  for (const { threadId, events } of batches) {
    // Durable usage capture at the canonical layer (all providers normalized).
    // Thread metadata is resolved lazily inside, so pure-delta frames are free.
    recordRuntimeUsage(threadId, events, threads);
  }
}

function schedulePendingRuntimeEvents(): void {
  let hasForeground = false;
  let hasBackground = false;
  const view = useAppStore.getState().view;
  const foregroundThreadIds: readonly string[] =
    document.visibilityState !== "hidden" && view.kind === "thread" ? view.panes : [];
  for (const threadId of pendingRuntimeEvents.keys()) {
    if (foregroundThreadIds.includes(threadId)) hasForeground = true;
    else hasBackground = true;
    if (hasForeground && hasBackground) break;
  }

  if (hasForeground && runtimeFlushHandle === null) {
    runtimeFlushHandle = requestAnimationFrame(() => {
      runtimeFlushHandle = null;
      flushPendingRuntimeEvents(isForegroundRuntimeThread);
      schedulePendingRuntimeEvents();
    });
  } else if (!hasForeground && runtimeFlushHandle !== null) {
    cancelAnimationFrame(runtimeFlushHandle);
    runtimeFlushHandle = null;
  }

  if (hasBackground && backgroundRuntimeFlushHandle === null) {
    backgroundRuntimeFlushHandle = setTimeout(() => {
      backgroundRuntimeFlushHandle = null;
      flushPendingRuntimeEvents((threadId) => !isForegroundRuntimeThread(threadId));
      schedulePendingRuntimeEvents();
    }, BACKGROUND_RUNTIME_EVENT_BATCH_MS);
  } else if (!hasBackground && backgroundRuntimeFlushHandle !== null) {
    clearTimeout(backgroundRuntimeFlushHandle);
    backgroundRuntimeFlushHandle = null;
  }
}

function appendRuntimeEvents(threadId: string, events: readonly RuntimeEvent[]): void {
  const existing = pendingRuntimeEvents.get(threadId);
  if (existing) {
    for (const evt of events) existing.push(evt);
  } else {
    pendingRuntimeEvents.set(threadId, [...events]);
  }
}

function flushPendingRuntimeEventsSync(threadId: string): void {
  flushPendingRuntimeEvents((pendingThreadId) => pendingThreadId === threadId);
  schedulePendingRuntimeEvents();
}

function installRuntimeEventScheduling(): () => void {
  const unsubscribe = useAppStore.subscribe((state) => state.view, schedulePendingRuntimeEvents);
  document.addEventListener("visibilitychange", schedulePendingRuntimeEvents);
  return () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", schedulePendingRuntimeEvents);
  };
}

function handleSupervisorEvent(event: SupervisorEvent): void {
  if ("threadId" in event && event.threadId.startsWith("shell:")) {
    if (event.type === "thread-output") {
      useDevTerminalStore.getState().noteShellOutput(event.threadId);
    }
    return;
  }

  if (event.type === "thread-runtime-event") {
    appendRuntimeEvents(event.threadId, [event.event]);
    schedulePendingRuntimeEvents();
    return;
  }
  if (event.type === "thread-runtime-events") {
    if (event.events.length > 0) {
      appendRuntimeEvents(event.threadId, event.events);
      schedulePendingRuntimeEvents();
    }
    return;
  }
  if (event.type === "thread-runtime-events-multi") {
    let hasEvents = false;
    for (const batch of event.batches) {
      if (batch.events.length === 0) continue;
      appendRuntimeEvents(batch.threadId, batch.events);
      hasEvents = true;
    }
    if (hasEvents) schedulePendingRuntimeEvents();
    return;
  }

  // Non-runtime event: drain pending runtime events first so the handler below
  // observes the same ordering callers expect from the IPC stream.
  if ("threadId" in event && pendingRuntimeEvents.has(event.threadId)) {
    flushPendingRuntimeEventsSync(event.threadId);
  }

  if (event.type === "thread-state") {
    const shouldCheckNotifications =
      threadStateNotificationsArmed && shouldInspectThreadStateForNotification();
    const appStore = useAppStore.getState();
    const oldThread = shouldCheckNotifications
      ? appStore.threads.find((t) => t.id === event.threadId)
      : undefined;
    appStore.updateThreadRuntime(event.threadId, event);
    if (shouldCheckNotifications) {
      const newThread = useAppStore.getState().threads.find((t) => t.id === event.threadId);
      handleThreadStateNotification(event, oldThread, newThread);
    }
    // Once the agent process is gone, any sub-agent that hadn't completed is
    // orphaned — its parent `item.completed` will never arrive. Reconcile so
    // the active dock stops showing it as running.
    if (event.status === "inactive" || event.status === "error") {
      useAppStore.getState().reconcileStaleSubAgents(event.threadId);
    }
  }
  if (event.type === "thread-pending-steer") {
    useAppStore.getState().setPendingSteer(event.threadId, event.pending);
  }
  if (event.type === "thread-reset") {
    pendingRuntimeEvents.delete(event.threadId);
    useAppStore.getState().clearThreadRuntimeEvents(event.threadId);
    useAppStore.getState().clearAllPendingSteer(event.threadId);
    clearRuntimeItemStoreSelectorCacheForThread(event.threadId);
  }
  if (event.type === "thread-exited") {
    useAppStore.getState().markThreadExited(event.threadId);
    useAppStore.getState().clearAllPendingSteer(event.threadId);
  }
  if (isAgentStatusSupervisorEvent(event)) {
    applyAgentStatusSupervisorEvent(event, { deferFirstLaunchBulk: true });
  }
  if (event.type === "provider-usage") {
    useProviderUsageStore.getState().mergeSnapshot(event.snapshot);
  }
  if (event.type === "provider-usage-all") {
    useProviderUsageStore.getState().setSnapshots(event.snapshots);
  }
}

function handleUpdateStatus(status: UpdateStatus): void {
  const store = useUpdateStore.getState();
  switch (status.type) {
    case "checking":
      store.setChecking();
      break;
    case "update-available":
      store.beginUpdateDownload(status.version);
      break;
    case "update-not-available":
      store.setNotAvailable();
      break;
    case "downloading":
      store.setDownloading(status.percent, {
        transferred: status.transferred,
        total: status.total,
        bytesPerSecond: status.bytesPerSecond,
      });
      break;
    case "downloaded":
      store.setDownloaded(status.version);
      break;
    case "error": {
      const detail = status.messageKey ? msg(status.messageKey) : status.message;
      store.setError(detail);
      toast.danger(msg("update.error", { detail }));
      break;
    }
  }
}

// The browser-extract window renders a standalone BrowserPanel; it has no use
// for supervisor/update streams, remote-client bridges, or runtime persistence,
// so only the main window wires these up (and tears them down on HMR dispose).
const mainWindowCleanups: Array<() => void> = isMainWindow
  ? [
      readBridge().onSupervisorEvent(handleSupervisorEvent),
      installRuntimeEventScheduling(),
      readBridge().onUpdateStatus(handleUpdateStatus),
      // Thread-metadata commands issued from paired remote clients (mobile PWA).
      // They run through the same actions as local edits so persistence and
      // side effects (unload on archive, …) stay identical.
      readBridge().onRemoteThreadCommand((command) => {
        if (command.kind === "delete-worktree-group") {
          deleteWorktreeGroup(command.projectId, command.worktreePath, command.threadIds);
          return;
        }
        if (command.kind === "start") {
          const store = useAppStore.getState();
          if (store.threads.some((t) => t.id === command.threadId)) return;
          const project = store.projects.find((p) => p.id === command.projectId);
          if (!project) return;
          const titlePrompt =
            titlePromptFromSegments(command.prompt, command.segments).trim() ||
            i18n._(linguiMsg`New thread`);
          const thread = store.createThread({
            threadId: command.threadId,
            projectId: project.id,
            agentKind: command.agentKind,
            ...(command.agentInstanceId ? { agentInstanceId: command.agentInstanceId } : {}),
            config: command.config,
            prompt: titlePrompt,
            ...(command.title ? { title: command.title } : {}),
            ...(command.presentationMode ? { presentationMode: command.presentationMode } : {}),
            ...(command.worktreePath ? { worktreePath: command.worktreePath } : {}),
            ...(command.worktreeBranch ? { worktreeBranch: command.worktreeBranch } : {}),
            ...(command.prNumber !== undefined ? { prNumber: command.prNumber } : {}),
            ...(command.focus === false ? { focus: false } : {}),
            ...(command.parentThreadId ? { parentThreadId: command.parentThreadId } : {}),
            ...(command.groupId ? { groupId: command.groupId } : {}),
            ...(command.groupName ? { groupName: command.groupName } : {}),
          });
          if (command.launchRuntime !== false) {
            store.queueThreadLaunch(thread.id, command.prompt, command.segments);
          }
          const { agentStatuses, wslAgentStatuses } = useAgentStatusesStore.getState();
          const projectAgentStatuses = getProjectAgentStatuses(
            project.location,
            agentStatuses,
            wslAgentStatuses,
          );
          // An explicit title (e.g. an orchestrator-provided ticket key) is
          // authoritative — don't let AI title generation overwrite it.
          if (!command.title) {
            generateTitleAsync(thread.id, project.location, projectAgentStatuses, titlePrompt);
          }
          if (command.worktreePath) {
            void primeWorktreeGitState(project, command.worktreePath);
            if (command.isNewWorktree) {
              const setupScript = project.scripts?.setupScript;
              if (setupScript) {
                void runWorktreeSetupScript(project, command.worktreePath, setupScript);
              }
            }
          }
          return;
        }
        const thread = useAppStore.getState().threads.find((t) => t.id === command.threadId);
        if (!thread) return;
        switch (command.kind) {
          case "acknowledge":
            acknowledgeThread(command.threadId);
            break;
          case "rename":
            renameThread(command.threadId, command.title);
            break;
          case "set-done":
            if (thread.done !== command.done) toggleMarkThreadDone(command.threadId);
            break;
          case "set-starred":
            if ((thread.starred ?? false) !== command.starred) toggleStarThread(command.threadId);
            break;
          // Orchestrator grouping: pulls the parent thread into the sidebar
          // group its children are created in.
          case "set-group":
            useAppStore.setState((state) => ({
              threads: state.threads.map((t) =>
                t.id === command.threadId
                  ? { ...t, groupId: command.groupId, groupName: command.groupName }
                  : t,
              ),
            }));
            break;
          case "set-worktree": {
            useAppStore
              .getState()
              .setThreadWorktree(command.threadId, command.worktreePath, command.worktreeBranch);
            // A freshly-created remote worktree needs the same desktop-side follow-up
            // a local "new thread in worktree" gets: prime its git state and run the
            // project setup script.
            if (command.isNewWorktree) {
              const project = useAppStore
                .getState()
                .projects.find((p) => p.id === thread.projectId);
              if (project) {
                void primeWorktreeGitState(project, command.worktreePath);
                const setupScript = project.scripts?.setupScript;
                if (setupScript) {
                  void runWorktreeSetupScript(project, command.worktreePath, setupScript);
                }
              }
            }
            break;
          }
          case "archive":
            archiveThread(command.threadId);
            break;
          case "unarchive":
            useAppStore.getState().unarchiveThread(command.threadId);
            break;
          case "delete":
            // Thread-only delete: remote clients never trigger worktree removal.
            deleteThread(command.threadId);
            break;
        }
      }),
      // Settings rewritten outside this renderer (remote clients editing desktop
      // settings over the remote API) — apply without echoing a persist.
      readBridge().onSharedSettingsChanged((settings) => {
        applyExternalSharedSettings(normalizeSharedSettings(settings));
      }),
      // Main-process project mutations must reach this whole-store snapshot
      // before its next dbSyncAll persistence write.
      readBridge().onProjectStateChanged(({ projects }) => {
        useAppStore.setState({ projects });
      }),
      readBridge().onThreadOpenRequested(({ threadId }) => {
        openThread(threadId, { focusComposer: true });
      }),
      readBridge().onQuickComposerSubmit((submission) => {
        void (async () => {
          if (!useAppStore.persist.hasHydrated()) await useAppStore.persist.rehydrate();
          const project = useAppStore
            .getState()
            .projects.find((candidate) => candidate.id === submission.projectId);
          if (!project) {
            toast.warning(i18n._(linguiMsg`Add a project to start`));
            return;
          }
          await startThreadFromDraft(project, submission.input, { preserveActiveGroup: false });
        })().catch(() => undefined);
      }),
      installRemoteGitSummaryPublisher(),
    ]
  : [];
let uninstallProductAnalytics: (() => void) | null = null;
let productAnalyticsStarted = false;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const cleanup of mainWindowCleanups) cleanup();
    if (runtimeFlushHandle !== null) {
      cancelAnimationFrame(runtimeFlushHandle);
      runtimeFlushHandle = null;
    }
    if (backgroundRuntimeFlushHandle !== null) {
      clearTimeout(backgroundRuntimeFlushHandle);
      backgroundRuntimeFlushHandle = null;
    }
    pendingRuntimeEvents.clear();
    uninstallProductAnalytics?.();
    uninstallProductAnalytics = null;
    productAnalyticsStarted = false;
  });
}

export function App() {
  if (isBrowserExtractWindow) {
    return <BrowserExtractApp />;
  }
  if (isQuickComposerWindow) {
    return <QuickComposerApp />;
  }
  return <MainApp />;
}

function BrowserExtractApp() {
  useBrowserSync();
  useStandaloneWindowViewTracking("browser_extracted");

  return (
    <AppProvider contentReady syncWindowChrome={false}>
      <div className="flex h-screen w-screen overflow-hidden bg-[var(--content-background)] text-foreground">
        <BrowserPanel visible surface="window" />
      </div>
    </AppProvider>
  );
}

function QuickComposerApp() {
  const { initialLoading } = useAppHydration({ runtimeOwner: false });
  useStandaloneWindowViewTracking("quick_composer", !initialLoading);

  return (
    <AppProvider contentReady={!initialLoading} syncWindowChrome={false}>
      {initialLoading ? (
        <div className="quick-composer-root">
          <div className="quick-composer-status">
            <PixelLoader size="sm" />
          </div>
        </div>
      ) : (
        <QuickComposerOverlay />
      )}
      <ImageLightboxHost />
    </AppProvider>
  );
}

function MainApp() {
  const { initialLoading, storeHydrated, loadT0 } = useAppHydration();
  const [showStartupRecovery, setShowStartupRecovery] = useState(false);
  const [startupRecoveryCycle, setStartupRecoveryCycle] = useState(0);

  useEffect(() => {
    if (!initialLoading) {
      setShowStartupRecovery(false);
      return;
    }
    const timeout = window.setTimeout(() => {
      setShowStartupRecovery(true);
    }, STARTUP_RECOVERY_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [initialLoading, startupRecoveryCycle]);

  useEffect(() => {
    if (initialLoading) {
      threadStateNotificationsArmed = false;
      return;
    }

    threadStateNotificationsArmed = true;
    void readBridge().notifyQuickComposerMainReady();
    if (!uninstallProductAnalytics) {
      uninstallProductAnalytics = installProductAnalytics();
    }
    if (!productAnalyticsStarted) {
      productAnalyticsStarted = true;
      captureAppStarted();
    }
    // Refresh the ACP registry once on app start so installed-version
    // metadata (and any pending auto-updates) are in sync without waiting
    // for the user to open the registry settings panel.
    void readBridge()
      .listAcpRegistry()
      .catch(() => undefined);
    return () => {
      threadStateNotificationsArmed = false;
      void flushProductAnalytics();
    };
  }, [initialLoading]);

  if (initialLoading) {
    console.log(
      `[renderer] +${Date.now() - loadT0}ms: rendering spinner (hydrated=${storeHydrated})`,
    );
    return (
      <AppProvider contentReady={false}>
        {showStartupRecovery ? (
          <StartupRecoveryScreen
            onKeepWaiting={() => {
              setShowStartupRecovery(false);
              setStartupRecoveryCycle((cycle) => cycle + 1);
            }}
          />
        ) : (
          <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
            <div className="flex flex-col items-center gap-4">
              <PixelLoader size="lg" />
              <p className="text-sm text-muted">
                <Trans>Loading…</Trans>
              </p>
            </div>
          </div>
        )}
      </AppProvider>
    );
  }

  return (
    <AppProvider contentReady>
      <MainView storeHydrated={storeHydrated} loadT0={loadT0} />
      <DeferredCommandPalette />
      <ImageLightboxHost />
    </AppProvider>
  );
}

function DeferredCommandPalette() {
  const open = useCommandPaletteStore((state) => state.isOpen);
  const [enabled, setEnabled] = useState(open);

  useEffect(() => {
    if (open) setEnabled(true);
  }, [open]);

  return enabled ? (
    <Suspense>
      <PrewarmedCommandPalette />
    </Suspense>
  ) : null;
}
