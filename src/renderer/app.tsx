import { toast } from "@heroui/react";
import { msg as linguiMsg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { lazy, Suspense, useEffect, useState } from "react";
import { PixelLoader } from "./components/common/PixelLoader";
import { StartupRecoveryScreen } from "./components/startup/StartupRecoveryScreen";
import { msg } from "@/shared/messages";
import type { UpdateStatus } from "@/shared/ipc";
import { readBridge } from "./bridge";
import { hasClientCapability } from "./clientRuntime";
import { showUserNotification } from "./notifications";

import { useAppStore } from "./state/appStore";
import { useGitReadModelStore } from "./state/gitReadModelStore";
import { openThread } from "./actions/threadActions";
import { applyForwardedRemoteThreadCommand } from "./actions/remoteThreadCommandApplication";
import { isProjectedRemoteEntityId } from "./state/remoteProjection";
import { pruneLiveObservedCrossagentItems } from "./state/slices/staleSubAgents";
import { installRemoteGitSummaryPublisher } from "./remoteGitSummaries";
import { installRemoteProjectWorkspaceSync } from "./state/remoteServers/appRows";
import { applyExternalSharedSettings } from "./state/sharedSettingsStore";
import { normalizeSharedSettings } from "@/shared/settings";
import { recordRuntimeUsage } from "./state/usageRecorder";
import { useDevTerminalStore } from "./state/devTerminalStore";
import { useThreadOutputStore } from "./state/threadOutputStore";
import { applyAgentStatusSupervisorEvent } from "./state/agentStatusesStore";
import { useProviderUsageStore } from "./state/providerUsageStore";
import { useUpdateStore } from "./state/updateStore";
import { boundVisibleThreadRuntimeWindows } from "./state/chatRuntimePersister";
import {
  beginRendererPerfSpan,
  startRendererPerfDiagnostics,
} from "./diagnostics/rendererPerfDiagnostics";
import { createLocalSnapshotRecovery } from "./state/remote/reducers/localSnapshotRecovery";
import {
  createSupervisorEventReducer,
  type SupervisorEventReducer,
} from "./state/remote/reducers/supervisorEventReducer";

import { useAppHydration } from "@/renderer/hooks/useAppHydration";
import { usePrWatchAgentSync } from "@/renderer/hooks/usePrWatchAgentSync";
import { i18n } from "@/renderer/i18n/i18n";
import { AppProvider } from "./components/ui/provider";
import { ImageLightboxHost } from "./components/composer/ImageLightbox";
import { MainView } from "@/renderer/views/MainView/MainView";
import { startThreadFromDraft } from "@/renderer/actions/threadLaunchActions";
import { useCommandPaletteStore } from "@/renderer/commands/commandPaletteStore";
import { captureAppStarted, installProductAnalytics } from "@/renderer/analytics/posthog";
import { flushProductAnalytics } from "@/renderer/analytics/productAnalytics";
import { DeferredCommandPalette as PrewarmedCommandPalette } from "@/renderer/deferredFeatures";
import { UserMessageActionsSheet } from "@/renderer/components/thread/ChatPane/UserMessageActionsSheet";
import { isBrowserClientRuntime, readElectronHostBridge } from "@/renderer/clientRuntime";

const browserClientRuntime = isBrowserClientRuntime();
const BrowserRuntimeServices = browserClientRuntime
  ? lazy(() =>
      import("@/renderer/pwa/BrowserRuntimeServices").then((module) => ({
        default: module.BrowserRuntimeServices,
      })),
    )
  : null;
const BrowserExtractWindowApp = lazy(() =>
  import("@/renderer/windowApps/BrowserExtractWindowApp").then((module) => ({
    default: module.BrowserExtractWindowApp,
  })),
);
const QuickComposerWindowApp = lazy(() =>
  import("@/renderer/windowApps/QuickComposerWindowApp").then((module) => ({
    default: module.QuickComposerWindowApp,
  })),
);

// ── Module-level IPC listeners ──────────────────────────────────
// Subscribes to supervisor events as soon as the module loads,
// completely outside React's lifecycle.  This guarantees events are
// never missed due to useEffect timing, StrictMode double-mounts,
// or startTransition batching.
//
// Both subscribe calls return unsubscribe functions which we store
// so that Vite HMR can tear them down before re-executing the module.

export const STARTUP_RECOVERY_TIMEOUT_MS = 15_000;
const windowKind = readBridge().windowKind;
const isBrowserExtractWindow = windowKind === "browserExtract";
const isQuickComposerWindow = windowKind === "quickComposer";
const isMainWindow = windowKind === "main";

// ── Supervisor event reduction ──────────────────────────────────
// The desktop flavor of THE shared SupervisorEvent reducer
// (state/remote/reducers/supervisorEventReducer.ts). Runtime deltas stay
// frame-paced (foreground panes flush per animation frame; hidden panes four
// times per second) and recovery re-reads the authoritative LOCAL snapshot
// before live deltas resume. Non-runtime events flush their own thread first
// so event ordering is preserved without forcing every background thread
// through the reducer.
//
// Gate 4 renderer perf diagnostics: inert unless the window was launched with
// ?poracodePerfDiag=1 (or the localStorage flag), so production is untouched.
startRendererPerfDiagnostics();

let supervisorReducerRef: SupervisorEventReducer | null = null;
const localSnapshotRecovery = createLocalSnapshotRecovery({
  getArbitration: () => {
    const reducer = supervisorReducerRef;
    if (!reducer) throw new Error("Supervisor event reducer is not installed.");
    return reducer.arbitration;
  },
});

const supervisorReducer = createSupervisorEventReducer({
  // INJECTED recovery strategy: the local snapshot. The backend persists
  // runtime events before broadcasting them, so overflow and reset re-read
  // the authoritative local history before the queue resumes.
  recovery: localSnapshotRecovery.strategy,
  onSequencedEvent: localSnapshotRecovery.noteSequencedSupervisorEvent,
  routeShellEvent: (event) => {
    if (!("threadId" in event)) return;
    if (event.type === "thread-output") {
      useDevTerminalStore.getState().noteShellOutput(event.threadId);
    } else if (event.type === "thread-exited") {
      useDevTerminalStore.getState().markShellExited(event.threadId);
    }
  },
  onThreadOutput: (threadId, data) => useThreadOutputStore.getState().appendOutput(threadId, data),
  onThreadOutputCleared: (threadId) => useThreadOutputStore.getState().clearOutput(threadId),
  onAgentStatusEvent: (event) =>
    applyAgentStatusSupervisorEvent(event, { deferFirstLaunchBulk: true }),
  onProviderUsage: (event) => useProviderUsageStore.getState().mergeSnapshot(event.snapshot),
  onProviderUsageAll: (event) => useProviderUsageStore.getState().setSnapshots(event.snapshots),
  wrapFlush: (run, stats) => {
    const drainSpan = beginRendererPerfSpan("runtime-drain");
    try {
      run();
    } finally {
      drainSpan.end({ threads: stats.drainedThreads, events: stats.drainedEvents });
    }
  },
  wrapApply: (run, stats) => {
    // One Zustand set for all concurrent streams — avoids N selector passes
    // when several chats are working in the background / being switched
    // between.
    const applySpan = beginRendererPerfSpan("apply-runtime-batches");
    try {
      run();
    } finally {
      applySpan.end({ threads: stats.drainedThreads, events: stats.drainedEvents });
    }
  },
  afterApply: (batches, { threadMetadata }) => {
    // Bounded visible window (Gate 4 Batch 1): inactive oversized threads are
    // evicted by the core; LIVE (retained) threads are bytes-bounded here so
    // an open thread streaming for hours cannot grow memory without bound.
    boundVisibleThreadRuntimeWindows(batches.map((batch) => batch.threadId));
    for (const { threadId, events } of batches) {
      // Durable usage capture at the canonical layer (all providers
      // normalized). Thread metadata is resolved lazily inside, so pure-delta
      // frames are free.
      recordRuntimeUsage(threadId, events, threadMetadata);
    }
  },
});
supervisorReducerRef = supervisorReducer;

function installThreadOutputPruning(): () => void {
  const retainActiveOutputs = () => {
    const threadIds = new Set(useAppStore.getState().threads.map((thread) => thread.id));
    for (const tab of useDevTerminalStore.getState().tabs) {
      if (tab.runActionId) threadIds.add(tab.id);
    }
    useThreadOutputStore.getState().retainOutputs(threadIds);
  };
  const unsubscribeThreads = useAppStore.subscribe((state, previousState) => {
    if (state.threads !== previousState.threads) retainActiveOutputs();
  });
  const unsubscribeTerminals = useDevTerminalStore.subscribe((state, previousState) => {
    if (state.tabs !== previousState.tabs) retainActiveOutputs();
  });
  return () => {
    unsubscribeThreads();
    unsubscribeTerminals();
  };
}

function handleUpdateStatus(status: UpdateStatus, notifyError = true): void {
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
      if (notifyError) toast.danger(msg("update.error", { detail }));
      break;
    }
  }
}

export function installUpdateStatusSync(
  bridge: Pick<ReturnType<typeof readBridge>, "getUpdateStatus" | "onUpdateStatus"> = readBridge(),
): () => void {
  let disposed = false;
  let receivedLiveStatus = false;
  const unsubscribe = bridge.onUpdateStatus((status) => {
    receivedLiveStatus = true;
    handleUpdateStatus(status);
  });
  void bridge
    .getUpdateStatus()
    .then((status) => {
      if (!disposed && !receivedLiveStatus && status) handleUpdateStatus(status, false);
    })
    .catch((error: unknown) => {
      if (!disposed) console.error("[poracode][updates] get-update-status failed", error);
    });
  return () => {
    disposed = true;
    unsubscribe();
  };
}

// The browser-extract window renders a standalone BrowserPanel; it has no use
// for supervisor/update streams, remote-client bridges, or runtime persistence,
// so only the main window wires these up (and tears them down on HMR dispose).
const mainWindowCleanups: Array<() => void> = isMainWindow
  ? [
      readBridge().onSupervisorEvent((event, rendererSequence, sequenceSpace) =>
        supervisorReducer.dispatch(event, rendererSequence, {
          ...(sequenceSpace !== undefined ? { sequenceSpace } : {}),
        }),
      ),
      // Backend reset (V5 2.5): the relay sequence space restarts with a new
      // backend child. The transport drops its dedupe cursor and rebuilds;
      // here the in-flight recovery state is invalidated so no stale
      // authoritative read from the previous child is trusted. The replacement
      // child also starts with an empty run tracker: every Crossagent run the
      // old child owned died with it, so its live-observation records go and
      // every still-running delegated row is force-settled — otherwise those
      // tiles spin as "running" forever (no settle tile will ever arrive).
      ...(readElectronHostBridge()
        ? [
            readElectronHostBridge()!.onBackendSupervisorReset(() => {
              localSnapshotRecovery.onTransportGenerationChanged();
              supervisorReducer.invalidateInFlightRecoveries();
              // Remote-host threads are unaffected by a local backend reset —
              // keep their observation records and rows so a local reset can't
              // falsely fail their still-live runs.
              const isLocalBackendThread = (threadId: string) =>
                !isProjectedRemoteEntityId(threadId, "thread");
              pruneLiveObservedCrossagentItems(isLocalBackendThread);
              useAppStore.getState().reconcileAllStaleSubAgents({
                force: true,
                matchesThread: isLocalBackendThread,
              });
            }),
          ]
        : []),
      supervisorReducer.installScheduling(),
      ...(hasClientCapability("nativeAppUpdates") ? [installUpdateStatusSync()] : []),
      // Thread-metadata commands issued from paired remote clients (mobile PWA)
      // and commands the co-located host applied. The callback is PROJECTION:
      // it runs inside the host-origin fence so it never echoes a command back.
      readBridge().onRemoteThreadCommand((command) => {
        applyForwardedRemoteThreadCommand(command);
      }),
      // Settings rewritten outside this renderer (remote clients editing desktop
      // settings over the remote API) — apply without echoing a persist.
      readBridge().onSharedSettingsChanged((settings) => {
        applyExternalSharedSettings(normalizeSharedSettings(settings));
      }),
      readBridge().onGitStateChanged((patch) => {
        useGitReadModelStore.getState().applyPatch(patch);
      }),
      readBridge().onUserNotification((notification) => {
        showUserNotification(notification);
      }),
      readBridge().onThreadOpenRequested(({ threadId, source }) => {
        openThread(threadId, {
          focusComposer: true,
          ...(source === "notification" ? { switchWorkspace: true } : {}),
        });
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
      // Only the desktop host owns live local git state and publishes it to
      // paired clients. Installing this in the PWA subscribes to projected
      // state and attempts to send the projection back to the host.
      ...(browserClientRuntime ? [] : [installRemoteGitSummaryPublisher()]),
      installRemoteProjectWorkspaceSync(),
      installThreadOutputPruning(),
    ]
  : [];
let uninstallProductAnalytics: (() => void) | null = null;
let productAnalyticsStarted = false;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const cleanup of mainWindowCleanups) cleanup();
    supervisorReducer.clear();
    localSnapshotRecovery.clearSequenceTracking();
    uninstallProductAnalytics?.();
    uninstallProductAnalytics = null;
    productAnalyticsStarted = false;
  });
}

export function App() {
  if (isBrowserExtractWindow) {
    return (
      <Suspense>
        <BrowserExtractWindowApp />
      </Suspense>
    );
  }
  if (isQuickComposerWindow) {
    return (
      <Suspense>
        <QuickComposerWindowApp />
      </Suspense>
    );
  }
  return <MainApp />;
}

function MainApp() {
  const { initialLoading, runtimeSnapshotsReady, storeHydrated, loadT0 } = useAppHydration();
  // App-scoped, not overlay-scoped: PR watches must follow the current helper
  // agent whether or not the user opens the Git Review sidebar.
  usePrWatchAgentSync(!initialLoading);
  const [showStartupRecovery, setShowStartupRecovery] = useState(false);
  const [startupRecoveryCycle, setStartupRecoveryCycle] = useState(0);
  // Reset the recovery screen while hydration is still pending: hiding it is
  // derived from (initialLoading, startupRecoveryCycle), so adjust during
  // render; the timeout that *shows* it stays in the effect below.
  const [prevRecoveryKey, setPrevRecoveryKey] = useState({
    initialLoading,
    startupRecoveryCycle,
  });
  if (
    prevRecoveryKey.initialLoading !== initialLoading ||
    prevRecoveryKey.startupRecoveryCycle !== startupRecoveryCycle
  ) {
    setPrevRecoveryKey({ initialLoading, startupRecoveryCycle });
    setShowStartupRecovery(false);
  }

  useEffect(() => {
    if (!initialLoading || showStartupRecovery) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setShowStartupRecovery(true);
    }, STARTUP_RECOVERY_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [initialLoading, showStartupRecovery]);

  useEffect(() => {
    if (initialLoading) {
      return;
    }

    void readBridge().notifyQuickComposerMainReady();
    if (!uninstallProductAnalytics) {
      uninstallProductAnalytics = installProductAnalytics();
    }
    if (!productAnalyticsStarted) {
      productAnalyticsStarted = true;
      captureAppStarted();
    }
    return () => {
      void flushProductAnalytics();
    };
  }, [initialLoading]);

  // Startup timing log: impure (Date.now), so it lives in an effect and
  // runs after every commit while the spinner is up, matching render timing.
  useEffect(() => {
    if (initialLoading) {
      console.log(
        `[renderer] +${Date.now() - loadT0}ms: rendering spinner (hydrated=${storeHydrated})`,
      );
    }
  });

  if (initialLoading) {
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
      <MainView storeHydrated={storeHydrated} runtimeSnapshotsReady={runtimeSnapshotsReady} />
      <DeferredCommandPalette />
      <ImageLightboxHost />
      {BrowserRuntimeServices ? (
        <Suspense>
          <BrowserRuntimeServices />
        </Suspense>
      ) : null}
      <UserMessageActionsSheet />
    </AppProvider>
  );
}

function DeferredCommandPalette() {
  const open = useCommandPaletteStore((state) => state.isOpen);
  const [enabled, setEnabled] = useState(open);
  // Latch on first open so the lazy chunk stays mounted afterwards.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setEnabled(true);
  }

  return enabled ? (
    <Suspense>
      <PrewarmedCommandPalette />
    </Suspense>
  ) : null;
}
