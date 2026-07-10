import { toast } from "@heroui/react";
import { msg as linguiMsg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Suspense, useEffect, useState } from "react";
import { PixelLoader } from "./components/common/PixelLoader";
import { msg } from "@/shared/messages";
import type { RuntimeEvent } from "@/shared/contracts";
import {
  isAgentStatusSupervisorEvent,
  type SupervisorEvent,
  type UpdateStatus,
} from "@/shared/ipc";
import { readBridge } from "./bridge";
import {
  handleNotificationClick,
  handleThreadStateNotification,
  shouldInspectThreadStateForNotification,
} from "./notifications";

import { useAppStore } from "./state/appStore";
import {
  archiveThread,
  deleteThread,
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
import { installRuntimeItemsPersister } from "./state/chatRuntimePersister";
import { clearRuntimeItemStoreSelectorCacheForThread } from "./components/thread/ChatPane/chatPaneSelectors";

import { useAppHydration } from "@/renderer/hooks/useAppHydration";
import { generateTitleAsync } from "@/renderer/utils/titleGen";
import { titlePromptFromSegments } from "@/shared/threadTitle";
import { i18n } from "@/renderer/i18n/i18n";
import { AppProvider } from "./components/ui/provider";
import { ImageLightboxHost } from "./components/composer/ImageLightbox";
import { MainView } from "@/renderer/views/MainView/MainView";
import { QuickComposerOverlay } from "@/renderer/views/QuickComposerOverlay/QuickComposerOverlay";
import {
  primeWorktreeGitState,
  runWorktreeSetupScript,
  startThreadFromDraft,
} from "@/renderer/views/MainView/parts/AppContent/AppContent";
import { useCommandPaletteStore } from "@/renderer/commands/commandPaletteStore";
import { BrowserPanel } from "@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/BrowserPanel";
import { useBrowserSync } from "@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/hooks/useBrowserSync";
import {
  captureAppStarted,
  flushProductAnalytics,
  installProductAnalytics,
} from "@/renderer/analytics/posthog";
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
const windowKind = readBridge().windowKind;
const isBrowserExtractWindow = windowKind === "browserExtract";
const isQuickComposerWindow = windowKind === "quickComposer";
const isMainWindow = windowKind === "main";

// ── Runtime event rAF batcher ───────────────────────────────────
// With 6-8 concurrent streaming chats, the supervisor produces ~500
// `thread-runtime-event(s)` IPC messages per second. Applying each one
// synchronously triggers a Zustand `set()` and re-evaluates every subscribed
// selector across all mounted ChatPanes. Coalescing into one apply per
// animation frame caps store mutation rate to ~60/sec regardless of incoming
// event rate, while preserving per-thread event order. Non-runtime events
// (thread-state, reset, exit, …) flush the queue before applying so they
// observe a consistent state.
const pendingRuntimeEvents = new Map<string, RuntimeEvent[]>();
let runtimeFlushHandle: number | null = null;

function flushPendingRuntimeEvents(): void {
  runtimeFlushHandle = null;
  if (pendingRuntimeEvents.size === 0) return;
  const store = useAppStore.getState();
  const threads = store.threads;
  const batches = [...pendingRuntimeEvents.entries()].map(([threadId, events]) => ({
    threadId,
    events,
  }));
  // One Zustand set for all concurrent streams — avoids N selector passes when
  // several chats are working in the background / being switched between.
  store.applyRuntimeEventBatches(batches);
  for (const { threadId, events } of batches) {
    // Durable usage capture at the canonical layer (all providers normalized).
    // Thread metadata is resolved lazily inside, so pure-delta frames are free.
    recordRuntimeUsage(threadId, events, threads);
  }
  pendingRuntimeEvents.clear();
}

function enqueueRuntimeEvents(threadId: string, events: readonly RuntimeEvent[]): void {
  if (events.length === 0) return;
  const existing = pendingRuntimeEvents.get(threadId);
  if (existing) {
    for (const evt of events) existing.push(evt);
  } else {
    pendingRuntimeEvents.set(threadId, [...events]);
  }
  if (runtimeFlushHandle === null) {
    runtimeFlushHandle = requestAnimationFrame(flushPendingRuntimeEvents);
  }
}

function flushPendingRuntimeEventsSync(): void {
  if (runtimeFlushHandle !== null) {
    cancelAnimationFrame(runtimeFlushHandle);
    runtimeFlushHandle = null;
  }
  if (pendingRuntimeEvents.size > 0) flushPendingRuntimeEvents();
}

function handleSupervisorEvent(event: SupervisorEvent): void {
  if ("threadId" in event && event.threadId.startsWith("shell:")) {
    if (event.type === "thread-output") {
      useDevTerminalStore.getState().noteShellOutput(event.threadId);
    }
    return;
  }

  if (event.type === "thread-runtime-event") {
    enqueueRuntimeEvents(event.threadId, [event.event]);
    return;
  }
  if (event.type === "thread-runtime-events") {
    enqueueRuntimeEvents(event.threadId, event.events);
    return;
  }
  if (event.type === "thread-runtime-events-multi") {
    for (const batch of event.batches) {
      enqueueRuntimeEvents(batch.threadId, batch.events);
    }
    return;
  }

  // Non-runtime event: drain pending runtime events first so the handler below
  // observes the same ordering callers expect from the IPC stream.
  if ("threadId" in event && pendingRuntimeEvents.has(event.threadId)) {
    flushPendingRuntimeEventsSync();
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
    case "error":
      store.setError(status.message);
      toast.danger(msg("update.error", { detail: status.message }));
      break;
  }
}

// The browser-extract window renders a standalone BrowserPanel; it has no use
// for supervisor/update streams, remote-client bridges, or runtime persistence,
// so only the main window wires these up (and tears them down on HMR dispose).
const mainWindowCleanups: Array<() => void> = isMainWindow
  ? [
      readBridge().onSupervisorEvent(handleSupervisorEvent),
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
            ...(command.focus === false ? { focus: false } : {}),
            ...(command.parentThreadId ? { parentThreadId: command.parentThreadId } : {}),
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
                runWorktreeSetupScript(project, command.worktreePath, setupScript);
              }
            }
          }
          return;
        }
        const thread = useAppStore.getState().threads.find((t) => t.id === command.threadId);
        if (!thread) return;
        switch (command.kind) {
          case "rename":
            renameThread(command.threadId, command.title);
            break;
          case "set-done":
            if (thread.done !== command.done) toggleMarkThreadDone(command.threadId);
            break;
          case "set-starred":
            if ((thread.starred ?? false) !== command.starred) toggleStarThread(command.threadId);
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
                if (setupScript) runWorktreeSetupScript(project, command.worktreePath, setupScript);
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
      readBridge().onNotificationClick(handleNotificationClick),
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
      installRuntimeItemsPersister(),
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
        <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
          <div className="flex flex-col items-center gap-4">
            <PixelLoader size="lg" />
            <p className="text-sm text-muted">
              <Trans>Loading…</Trans>
            </p>
          </div>
        </div>
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
