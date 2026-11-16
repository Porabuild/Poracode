import { installDraftPersistenceNotifications } from "@/renderer/state/composerDrafts/installPersistenceNotifications";
import { isChatSidebarSurface } from "./clientSurface";
import { installFeatureUsageTracking } from "@/renderer/state/featureUsageTracking";
import { toast } from "@heroui/react";
import { msg as linguiMsg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { lazy, Suspense, useEffect, useState } from "react";
import { PixelLoader } from "./components/common/PixelLoader";
import { StartupRecoveryScreen } from "./components/startup/StartupRecoveryScreen";
import { friendlyError, msg } from "@/shared/messages";
import type { UpdateStatus } from "@/shared/ipc";
import { readBridge } from "./bridge";
import { captureRendererException } from "./diagnostics/sentry";
import { hasClientCapability } from "./clientRuntime";
import { showUserNotification } from "./notifications";

import { useAppStore } from "./state/appStore";
import { useGitReadModelStore } from "./state/gitReadModelStore";
import { projectGitReadModelIntoLegacyStore } from "./state/gitReadModelLegacyProjection";
import { openThread } from "./actions/threadActions";
import { returnThreadToMainWindow } from "./actions/threadWindowActions";
import { showGitReviewPage } from "./actions/panelActions";
import { hasOwnWindow } from "./state/auxiliaryThreadWindows";
import { entityHost } from "./state/entityHost";
import { readHostThreadExistence } from "./state/hostThreadLaunch";
import { openFileInEditor, resolveWorktreeBranch } from "./utils/gitHelpers";
import type { ThreadWindowNavigation } from "@/shared/ipc/threadWindow";
import { applyForwardedRemoteThreadCommand } from "./actions/remoteThreadCommandApplication";
import { isManagedHostEventInterest } from "./state/rendererEventInterests";
import { pruneLiveObservedCrossagentItems } from "./state/slices/staleSubAgents";
import { closeExitedShell } from "./actions/terminalTabActions";
import { onRemoteTerminalExited } from "./state/remoteTerminalFeed";
import { installRemoteGitSummaryPublisher } from "./remoteGitSummaries";
import { installRemoteProjectWorkspaceSync } from "./state/remoteServers/appRows";
import { applyExternalSharedSettings } from "./state/sharedSettingsStore";
import { normalizeSharedSettings } from "@/shared/settings";
import { useDevTerminalStore } from "./state/devTerminalStore";
import { useThreadOutputStore } from "./state/threadOutputStore";
import { useProviderUsageStore } from "./state/providerUsageStore";
import { useUpdateStore } from "./state/updateStore";
import {
  beginRendererPerfSpan,
  startRendererPerfDiagnostics,
} from "./diagnostics/rendererPerfDiagnostics";
import {
  clearSupervisorSequenceTracking,
  installSupervisorIntakeHooks,
  noteSupervisorTransportGenerationChanged,
  supervisorEventReducer,
} from "./state/remote/sync";

import { useAppHydration } from "@/renderer/hooks/useAppHydration";
import { usePrWatchAgentSync } from "@/renderer/hooks/usePrWatchAgentSync";
import { i18n } from "@/renderer/i18n/i18n";
import { AppProvider } from "./components/ui/provider";
import { ImageLightboxHost } from "./components/composer/ImageLightbox";
import { MainView } from "@/renderer/views/MainView/MainView";
import {
  applyNativeSideChatOwnership,
  installSideChatOwnershipReconciliation,
} from "@/renderer/components/thread/SideChat/sideChatOwnershipActions";
import { applySideChatPanel } from "@/renderer/components/thread/SideChat/sideChatPanelStore";
import { installThreadWindowTracking } from "@/renderer/state/threadWindowTracking";
import { startThreadFromDraft } from "@/renderer/actions/threadLaunchActions";
import { captureAppStarted, installProductAnalytics } from "@/renderer/analytics/posthog";
import { flushProductAnalytics } from "@/renderer/analytics/productAnalytics";
import { UserMessageActionsSheet } from "@/renderer/components/thread/ChatPane/UserMessageActionsSheet";
import { isBrowserClientRuntime, readElectronHostBridge } from "@/renderer/clientRuntime";

const chatSidebarSurface = isChatSidebarSurface();
const ChatSidebarView = lazy(() =>
  import("./sidebar/ChatSidebarView").then((module) => ({ default: module.ChatSidebarView })),
);
const browserClientRuntime = isBrowserClientRuntime();
const BrowserRuntimeServices =
  browserClientRuntime && !chatSidebarSurface
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
const SideChatWindowApp = lazy(() =>
  import("@/renderer/windowApps/SideChatWindowApp").then((module) => ({
    default: module.SideChatWindowApp,
  })),
);
const ThreadWindowApp = lazy(() =>
  import("@/renderer/windowApps/ThreadWindowApp").then((module) => ({
    default: module.ThreadWindowApp,
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
const unsubscribeSideChatWindows = readBridge().onSideChatWindowsChanged?.((event) => {
  applyNativeSideChatOwnership(event, isMainWindow);
});
const uninstallSideChatReconciliation = isMainWindow
  ? installSideChatOwnershipReconciliation()
  : undefined;
if (isMainWindow)
  void readBridge()
    .getSideChatWindowInfo?.()
    .then((entry) => {
      if (entry) applySideChatPanel(entry);
    })
    .catch((error: unknown) => captureRendererException(error, { featureArea: "side-chat" }));

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

// The client's one live-event reducer reduces this window's events from every
// host. The desktop's own host is the only one that sends desktop-internal
// frames (terminal output, dev shells, provider usage); their fan-outs and the
// perf spans are this window's.
const supervisorReducer = supervisorEventReducer();
const uninstallSupervisorIntakeHooks = installSupervisorIntakeHooks({
  routeShellEvent: (event) => {
    if (!("threadId" in event)) return;
    if (event.type === "thread-output") {
      useDevTerminalStore.getState().noteShellOutput(event.threadId);
    } else if (event.type === "thread-exited") {
      closeExitedShell(event.threadId);
    }
  },
  onThreadOutput: (threadId, data) => useThreadOutputStore.getState().appendOutput(threadId, data),
  onThreadOutputCleared: (threadId) => useThreadOutputStore.getState().clearOutput(threadId),
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
    const applySpan = beginRendererPerfSpan("apply-runtime-batches");
    try {
      run();
    } finally {
      applySpan.end({ threads: stats.drainedThreads, events: stats.drainedEvents });
    }
  },
});

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

async function applyThreadWindowNavigation(
  threadId: string,
  navigation: ThreadWindowNavigation,
): Promise<void> {
  if (navigation.kind === "thread") {
    if (hasOwnWindow(threadId)) returnThreadToMainWindow(threadId);
    else openThread(threadId, { focusComposer: true, switchWorkspace: true });
    return;
  }
  let thread = useAppStore.getState().threads.find((row) => row.id === threadId);
  if (!thread) {
    const host = entityHost({ id: threadId });
    if (host) await readHostThreadExistence(host, threadId);
    thread = useAppStore.getState().threads.find((row) => row.id === threadId);
  }
  const project = useAppStore.getState().projects.find((row) => row.id === thread?.projectId);
  if (!thread || !project)
    throw new Error(i18n._(linguiMsg`Could not open this thread. Try again.`));
  if (navigation.kind === "file") {
    await openFileInEditor(
      project,
      thread.worktreePath,
      thread.worktreePath
        ? (resolveWorktreeBranch(thread.projectId, thread.worktreePath) ?? undefined)
        : undefined,
      navigation.path,
      navigation.lineNumber,
    );
  } else showGitReviewPage(thread.projectId, thread.worktreePath);
}

// Chat windows consume the same runtime reducer; shell navigation and global
// notification policies remain owned by the main window.
const runtimeWindowCleanups: Array<() => void> =
  isMainWindow || windowKind === "sideChat" || windowKind === "thread"
    ? [
        installDraftPersistenceNotifications(),
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
                noteSupervisorTransportGenerationChanged();
                // Only the managed host's own threads died with the replaced
                // backend child; a paired host's threads keep their observation
                // records and rows so a local reset can't falsely fail their
                // still-live runs.
                pruneLiveObservedCrossagentItems(isManagedHostEventInterest);
                useAppStore.getState().reconcileAllStaleSubAgents({
                  force: true,
                  matchesThread: isManagedHostEventInterest,
                });
              }),
            ]
          : []),
        // Settings rewritten outside this renderer (remote clients editing desktop
        // settings over the remote API) — apply without echoing a persist.
        readBridge().onSharedSettingsChanged((settings) => {
          applyExternalSharedSettings(normalizeSharedSettings(settings));
        }),
        supervisorReducer.installScheduling(),
      ]
    : [];
// Thread windows show the same branch and change counts as the main window.
const gitStateCleanups: Array<() => void> =
  isMainWindow || windowKind === "thread"
    ? [
        readBridge().onGitStateChanged((patch) => {
          const previous = useGitReadModelStore.getState();
          if (patch.revision <= previous.revision) return;
          previous.applyPatch(patch);
          projectGitReadModelIntoLegacyStore(useGitReadModelStore.getState(), previous);
        }),
      ]
    : [];
const mainWindowCleanups: Array<() => void> = isMainWindow
  ? [
      installThreadWindowTracking(),
      onRemoteTerminalExited((terminalId) => {
        if (terminalId.startsWith("shell:")) closeExitedShell(terminalId);
      }),
      ...(hasClientCapability("nativeAppUpdates") ? [installUpdateStatusSync()] : []),
      // Thread-metadata commands issued from paired remote clients (mobile PWA)
      // and commands the co-located host applied. The callback is PROJECTION:
      // it runs inside the host-origin fence so it never echoes a command back.
      readBridge().onRemoteThreadCommand((command) => {
        applyForwardedRemoteThreadCommand(command);
      }),
      readBridge().onUserNotification((notification) => {
        showUserNotification(notification);
      }),
      readBridge().onThreadOpenRequested(({ threadId, source, navigation }) => {
        if (navigation) {
          void applyThreadWindowNavigation(threadId, navigation).catch((error: unknown) =>
            toast.danger(friendlyError(error)),
          );
          return;
        }
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
            const { settleClientSubmission } = await import("./actions/clientDraftSubmission");
            await settleClientSubmission(submission.input.clientSubmissionId, "failed");
            toast.warning(i18n._(linguiMsg`Add a project to start`));
            return;
          }
          await startThreadFromDraft(project, submission.input, { preserveActiveGroup: false });
        })().catch(async () => {
          // startThreadFromDraft settles ambiguous/accepted effects itself.
          // This also releases a handoff refused before that action could run.
          const { settleClientSubmission } = await import("./actions/clientDraftSubmission");
          await settleClientSubmission(submission.input.clientSubmissionId, "failed").catch(
            () => undefined,
          );
        });
      }),
      // Only the desktop host owns live local git state and publishes it to
      // paired clients. Installing this in the PWA subscribes to projected
      // state and attempts to send the projection back to the host.
      ...(browserClientRuntime ? [] : [installRemoteGitSummaryPublisher()]),
      installRemoteProjectWorkspaceSync(),
      installThreadOutputPruning(),
      installFeatureUsageTracking(),
    ]
  : [];
let uninstallProductAnalytics: (() => void) | null = null;
let productAnalyticsStarted = false;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeSideChatWindows?.();
    uninstallSideChatReconciliation?.();
    for (const cleanup of [...runtimeWindowCleanups, ...gitStateCleanups, ...mainWindowCleanups])
      cleanup();
    supervisorReducer.clear();
    clearSupervisorSequenceTracking();
    uninstallSupervisorIntakeHooks();
    uninstallProductAnalytics?.();
    uninstallProductAnalytics = null;
    productAnalyticsStarted = false;
  });
}

export function App() {
  if (windowKind === "sideChat")
    return (
      <Suspense>
        <SideChatWindowApp />
      </Suspense>
    );
  if (windowKind === "thread")
    return (
      <Suspense>
        <ThreadWindowApp />
      </Suspense>
    );
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
  const { initialLoading, runtimeSnapshotsReady, storeHydrated, loadT0 } = useAppHydration({
    prewarmFeatures: !chatSidebarSurface,
  });
  // App-scoped, not overlay-scoped: PR watches must follow the current helper
  // agent whether or not the user opens the Git Review sidebar.
  usePrWatchAgentSync(!initialLoading && !chatSidebarSurface);
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
      {chatSidebarSurface ? (
        <Suspense>
          <ChatSidebarView />
        </Suspense>
      ) : (
        <MainView storeHydrated={storeHydrated} runtimeSnapshotsReady={runtimeSnapshotsReady} />
      )}
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
