import { useEffect, useMemo, useRef, useState } from "react";
import type { SshBridgeAuthentication } from "@poracode/ssh-bridge";
import { msg } from "@lingui/core/macro";
import { useShallow } from "zustand/react/shallow";
import {
  DEFAULT_TERMINAL_SIZE,
  type Project,
  type PromptSegment,
  type TerminalSize,
  type Thread,
} from "@/shared/contracts";
import { buildThreadRelaunchStartInput, shouldRelaunchThreadOnOpen } from "@/shared/threadRelaunch";
import { buildWorktreeLocation } from "@/shared/worktree";
import { generateWorktreeBranch } from "@/shared/worktreeBranch";
import { isHomeProjectId } from "@/shared/homeScope";
import { buildRemoteGitTargetInterests } from "@/shared/gitStateInterestPolicy";
import { waitForRemoteThreadAppearance } from "@/shared/remote/threadAppearance";
import type { SshConnectionConfig } from "@/shared/ssh";
import {
  filterKnownRemoteAccessScopes,
  type RemoteAccessTokenResult,
  type RemoteEnvironmentDescriptor,
  type RemoteProjectCommand,
  type RemoteShellSnapshot,
  type RemoteThreadSnapshot,
} from "@/shared/remote";
import { performThreadInputSubmit } from "@/renderer/actions/threadRuntimeActions";
import { worktreePlacementPayload } from "@/renderer/actions/worktreePlacement";
import { captureFileCheckpoint } from "@/renderer/state/fileCheckpointActions";
import { useAppStore } from "@/renderer/state/appStore";
import { seedOlderThreadRuntimeItemsCursor } from "@/renderer/state/chatRuntimePersister";
import { readBridge } from "@/renderer/bridge";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { i18n } from "@/renderer/i18n/i18n";
import { setRemoteBridgeClient } from "./bridge";
import { resetBrowserMirror } from "./browserMirror";
import { useGitSummariesStore } from "./gitSummaries";
import { buildGitAddWorktreePayload } from "./navHelpers";
import { isNativeApp } from "./pwaInstall";
import {
  connectMobileSsh,
  disconnectMobileSsh,
  isMobileSshAuthenticationError,
  probeMobileSshHost,
} from "./mobileSsh";
import { unregisterPush } from "./push/pushRegistration";
import { resetTerminalFeed } from "./terminalFeed";
import {
  isRemoteTransportFailure,
  isUnauthorizedRemoteError,
  RemoteClientError,
  RemoteDesktopClient,
} from "@/shared/remote/client";
import {
  createRemoteSocketCoordinator,
  type RemoteSocketCoordinator,
} from "./remoteSocketCoordinator";
import { RemoteSessionTransport } from "./remoteSessionTransport";
import { useRemoteConnectionState } from "./remoteConnectionState";
import type { RemoteRefreshOptions } from "./remoteRefreshScheduler";
import { resetDesktopSettings } from "./settingsSync";
import { RemoteDesktopRefreshService } from "./remoteDesktopRefresh";
import { sortThreadsByRecency } from "./presentation";
import { applyShellSnapshot, applyThreadSnapshot, resetRemoteStores } from "./storeSync";
import {
  forgetDesktop,
  getActiveDesktopId,
  getOrCreateDeviceId,
  getStoredShellSnapshot,
  getStoredThreadSnapshot,
  listStoredDesktops,
  readShellSnapshotMirror,
  renameDesktop,
  saveDesktop,
  saveThreadSnapshot,
  setActiveDesktopId,
  shouldPersistThreadSnapshot,
  updateDesktopEndpoint,
  type StoredDesktop,
} from "./storage";
import { deleteSshCredential, getSshCredential, setSshCredential } from "./sshVault";
import { WIDE_SHELL_QUERY } from "./useMediaQuery";

const NARROW_PWA_INITIAL_TIMELINE_ENTRY_COUNT = 20;

export type { ConnectionState } from "./remoteConnectionState";

/** `RemoteThreadCommand` without the threadId (supplied by the caller). */
export type ThreadAction =
  | { readonly kind: "rename"; readonly title: string }
  | { readonly kind: "set-done"; readonly done: boolean }
  | { readonly kind: "set-starred"; readonly starred: boolean }
  | { readonly kind: "archive" }
  | { readonly kind: "unarchive" }
  | { readonly kind: "delete" };

export interface WorktreeGroupDeleteInput {
  readonly projectId: string;
  readonly worktreePath: string;
  readonly threadIds: readonly string[];
}

/** Threads currently being moved to a worktree — guards against double-taps. */
const movingThreadIds = new Set<string>();

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function restoreSshTransport(desktop: StoredDesktop): Promise<StoredDesktop> {
  if (desktop.transport?.kind !== "ssh") return desktop;
  const connection = desktop.transport.connection;
  const credential = await getSshCredential(connection.id);
  if (!credential) {
    throw new Error(
      i18n._(msg`SSH credentials are missing. Remove this connection and add it again.`),
    );
  }
  let result: Awaited<ReturnType<typeof connectMobileSsh>>;
  try {
    result = await connectMobileSsh(connection, credential, false);
  } catch (error) {
    const authenticationFailed = isMobileSshAuthenticationError(error);
    throw new RemoteClientError(
      describeError(error, i18n._(msg`Unable to restore the SSH connection.`)),
      authenticationFailed ? 401 : 0,
      authenticationFailed ? "ssh_authentication_failed" : "ssh_unavailable",
      { cause: error },
    );
  }
  await updateDesktopEndpoint(desktop.desktopId, result.endpoint);
  return { ...desktop, endpoint: result.endpoint };
}

/**
 * Owns the remote-desktop session: paired desktops, cached + live snapshots,
 * the resumable WebSocket, and every mutation the PWA can perform. All thread
 * and runtime state is hydrated into the shared renderer stores (see
 * `storeSync`) so the desktop UI components render it unchanged; this hook
 * only keeps connection/device state.
 */
export function useRemoteDesktop() {
  const [desktops, setDesktops] = useState<StoredDesktop[]>([]);
  const [activeDesktopId, setActiveDesktopState] = useState<string | null>(null);
  // Seeded synchronously from the localStorage mirror so the first paint
  // already shows the last session's threads/projects instead of an empty
  // shell (IndexedDB reads can't complete before first render). The Dexie
  // cache (loadCached) and the live refresh overwrite the seed moments later.
  const shellSnapshotRef = useRef<RemoteShellSnapshot | null | undefined>(undefined);
  if (shellSnapshotRef.current === undefined) {
    const mirror = readShellSnapshotMirror();
    shellSnapshotRef.current = mirror?.snapshot ?? null;
    if (mirror) applyShellSnapshot(mirror.snapshot);
  }
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadSnapshot, setThreadSnapshot] = useState<RemoteThreadSnapshot | null>(null);
  const {
    connection,
    setConnection,
    message,
    socketOpenRef,
    lastRefreshOkAtRef,
    setConnectionMessage,
    setOperationMessage,
    clearConnectionMessage,
    clearMessage,
    downgradeConnectionOnError,
  } = useRemoteConnectionState();
  const pairingInProgressRef = useRef(false);
  const [booted, setBooted] = useState(false);
  // Bumped by reconnect() to force the socket effect to tear down and
  // re-establish immediately (resetting its backoff attempt counter).
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const selectedThreadIdRef = useRef<string | null>(null);
  // The desktop the user is currently looking at. Async refreshes captured a
  // `desktop` argument at call time; if the user switches to another desktop
  // while an older refresh is still in flight, that stale result must NOT be
  // applied (it would clobber the new desktop's data). Compared against this
  // ref, which always reflects the active selection.
  const activeDesktopIdRef = useRef<string | null>(null);
  const refreshServiceRef = useRef<RemoteDesktopRefreshService | null>(null);
  const refreshService = (refreshServiceRef.current ??= new RemoteDesktopRefreshService());
  const socketCoordinatorRef = useRef<{
    readonly desktopId: string;
    readonly coordinator: RemoteSocketCoordinator;
  } | null>(null);
  // Last transcript-snapshot save time per `desktopId:threadId`, used to throttle
  // full-blob writes while a thread is actively streaming.
  const threadSnapshotSavedAtRef = useRef<Map<string, number>>(new Map());
  // Thread id whose history load is in flight from openThread(). Route effects
  // and click handlers can both trigger an open for the same thread; the guard
  // keeps the second call from double-fetching (store/view updates still run).
  const openInFlightRef = useRef<string | null>(null);
  const sessionTransportRef = useRef<RemoteSessionTransport | null>(null);
  const sessionTransport = (sessionTransportRef.current ??= new RemoteSessionTransport());

  // Shared error surface for every flow that re-establishes the SSH transport
  // (boot, desktop switch, reconnect).
  function reportSshRestoreFailure(error: unknown) {
    setConnection(
      isUnauthorizedRemoteError(error)
        ? "unauthorized"
        : isRemoteTransportFailure(error)
          ? "offline"
          : "error",
    );
    setConnectionMessage(describeError(error, i18n._(msg`Unable to restore the SSH connection.`)));
  }

  const activeDesktop = desktops.find((desktop) => desktop.desktopId === activeDesktopId) ?? null;
  const storeThreads = useAppStore(useShallow((state) => state.threads));
  const projects = useAppStore(useShallow((state) => state.projects));
  // sortThreadsByRecency already drops archived threads; memoize so unrelated
  // re-renders (connection/message changes during streaming) don't re-sort.
  const threads = useMemo(() => sortThreadsByRecency(storeThreads), [storeThreads]);
  const archivedThreads = storeThreads.filter((thread) => thread.archived);
  const selectedThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;
  const selectedThreadSnapshot =
    threadSnapshot?.thread.id === selectedThread?.id ? threadSnapshot : null;
  const selectedProject = selectedThread
    ? projects.find((project) => project.id === selectedThread.projectId)
    : undefined;
  selectedThreadIdRef.current = selectedThread?.id ?? null;
  activeDesktopIdRef.current = activeDesktopId;

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      let [stored, active] = await Promise.all([listStoredDesktops(), getActiveDesktopId()]);
      if (cancelled) return;
      // A pairing launch (`?host=…#token=…`) is NOT auto-paired here — that would
      // silently bind the device to whatever endpoint a tapped link carries.
      // `useDeepLinkPairing` routes it to the /desktops screen for the user to
      // confirm instead. Boot just continues into the last active desktop.
      const desktopId = active ?? stored[0]?.desktopId;
      setActiveDesktopSelection(desktopId ?? null);
      if (!desktopId) {
        setDesktops(stored);
        // A mirror seed without any paired desktop is stale (e.g. the Dexie DB
        // was cleared but localStorage survived) — drop it instead of showing
        // ghost threads on an unpaired install.
        if (shellSnapshotRef.current) resetSessionState();
        setConnection("offline");
        return;
      }
      let desktop = stored.find((entry) => entry.desktopId === desktopId);
      if (desktop?.transport?.kind === "ssh") {
        try {
          desktop = await restoreSshTransport(desktop);
          stored = stored.map((entry) => (entry.desktopId === desktopId ? desktop! : entry));
        } catch (error) {
          if (cancelled) return;
          setDesktops(stored);
          await loadCached(desktopId);
          reportSshRestoreFailure(error);
          return;
        }
      }
      setDesktops(stored);
      await loadCached(desktopId);
      if (desktop) {
        await refresh(desktop);
      } else {
        // Stale active id with no matching stored desktop: nothing will ever
        // connect, so don't leave the pill spinning on "booting".
        setConnection("offline");
      }
    }
    void boot()
      .catch((error: unknown) => {
        if (cancelled) return;
        setConnection("error");
        setOperationMessage(describeError(error, i18n._(msg`Unable to start mobile app.`)));
      })
      .finally(() => {
        if (!cancelled) setBooted(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot runs once; helpers are function declarations and state is initialized inside this effect
  }, []);

  // Reused desktop components reach the paired desktop through the bridge
  // shim; keep it pointed at the active connection. Pass the host platform so
  // Computer Use and other host-gated UI key off the desktop, not the phone.
  useEffect(() => {
    if (!activeDesktop) {
      sessionTransport.clear();
      setRemoteBridgeClient(null);
      return;
    }
    const actionClient = sessionTransport.update(
      `${activeDesktop.desktopId}\0${activeDesktop.endpoint}\0${activeDesktop.accessToken}`,
      () => clientFor(activeDesktop),
    );
    setRemoteBridgeClient(actionClient, activeDesktop.platform ?? null);
    return () => {
      setRemoteBridgeClient(null);
      sessionTransport.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the connection identity
  }, [
    activeDesktop?.desktopId,
    activeDesktop?.endpoint,
    activeDesktop?.accessToken,
    activeDesktop?.platform,
  ]);

  useEffect(() => {
    const desktopCandidate = activeDesktop;
    if (!desktopCandidate) return;
    const desktop: StoredDesktop = desktopCandidate;
    const initialLastSeenSeq = Math.max(
      desktop.lastSeenSeq,
      refreshService.currentLiveSeq(desktop.desktopId),
    );
    const coordinator = createRemoteSocketCoordinator({
      createClient: () => clientFor(desktop),
      initialLastSeenSeq,
      getSelectedThreadId: () => selectedThreadIdRef.current,
      requestRefresh: (options) => {
        void refresh(desktop, { ...options, trailingIfInFlight: true });
      },
      onConnectionChange: setConnection,
      onMessageChange: (next) => {
        if (next) setConnectionMessage(next);
        else clearConnectionMessage();
      },
      onOpenChange: (open) => {
        socketOpenRef.current = open;
      },
      isHttpHealthy: () => Date.now() - lastRefreshOkAtRef.current < 45_000,
      getPairingExpiredMessage: () => i18n._(msg`Pairing expired — pair again to reconnect.`),
    });
    socketCoordinatorRef.current = { desktopId: desktop.desktopId, coordinator };
    coordinator.start();
    return () => {
      if (socketCoordinatorRef.current?.coordinator === coordinator) {
        socketCoordinatorRef.current = null;
      }
      refreshService.advanceLiveSeq(desktop.desktopId, coordinator.getLastSeenSeq());
      coordinator.dispose();
    };
    // The socket is keyed on the connection identity (not the desktop object,
    // which is replaced after every refresh) so refreshes don't tear it down.
    // reconnectNonce forces a fresh connect when the user taps Reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- socket lifetime is scoped to the selected desktop's connection identity; other state is read through refs
  }, [
    activeDesktop?.desktopId,
    activeDesktop?.endpoint,
    activeDesktop?.accessToken,
    reconnectNonce,
  ]);

  useEffect(() => {
    publishRemoteGitStateInterests(selectedThread?.id ?? null, threads);
  }, [activeDesktopId, selectedThread?.id, threads]);

  // Live transcript content is only needed for the thread on screen; every other
  // thread still delivers lifecycle events (status, permission prompts), so
  // badges and approvals keep working. The selected thread's history is fetched
  // over HTTP on selection, so nothing is missing when the user switches.
  //
  // `selectThread` publishes eagerly; this effect is the backstop that covers
  // every other way the selection can change (restore, first snapshot, desktop
  // switch, reconnect).
  useEffect(() => {
    publishSelectedThreadItemInterest(selectedThreadId);
  }, [activeDesktopId, selectedThreadId]);

  /** Tells the host which thread's live transcript content this client wants. */
  function publishSelectedThreadItemInterest(threadId: string | null): void {
    const coordinator = socketCoordinatorRef.current;
    if (!coordinator || coordinator.desktopId !== activeDesktopIdRef.current) return;
    coordinator.coordinator.setThreadItemInterests(threadId ? [threadId] : []);
  }

  /** Keeps retained host polling bounded to what this PWA is actively using. */
  function publishRemoteGitStateInterests(
    threadId: string | null,
    sourceThreads: readonly Thread[] = useAppStore.getState().threads,
  ): void {
    const coordinator = socketCoordinatorRef.current;
    if (!coordinator || coordinator.desktopId !== activeDesktopIdRef.current) return;
    coordinator.coordinator.setGitStateInterests(
      buildRemoteGitTargetInterests(sourceThreads, { selectedThreadId: threadId }),
    );
  }

  async function reloadDesktops(nextActive?: string) {
    const stored = await listStoredDesktops();
    setDesktops(stored);
    setActiveDesktopSelection(
      nextActive ?? (await getActiveDesktopId()) ?? stored[0]?.desktopId ?? null,
    );
  }

  async function loadCached(desktopId: string) {
    const cached = await getStoredShellSnapshot(desktopId);
    if (desktopId !== activeDesktopIdRef.current) return;
    if (!cached) return;
    shellSnapshotRef.current = cached.snapshot;
    applyShellSnapshot(cached.snapshot);
    const firstThreadId = sortThreadsByRecency(cached.snapshot.threads)[0]?.id ?? null;
    setSelectedThreadId((current) => current ?? firstThreadId);
    // Rendering cached data is not evidence the desktop is unreachable — the
    // first refresh/socket attempt hasn't resolved yet. Claiming "offline"
    // here flashed the offline banner on every cold load. Keep the boot
    // spinner during boot; on a desktop switch show "reconnecting" until
    // refresh()/the socket settle the real state.
    setConnection((current) => (current === "booting" ? current : "reconnecting"));
  }

  function clientFor(desktop: StoredDesktop): RemoteDesktopClient {
    return new RemoteDesktopClient(desktop.endpoint, desktop.accessToken, undefined, {
      onRequestSuccess: () => {
        if (desktop.desktopId !== activeDesktopIdRef.current || pairingInProgressRef.current)
          return;
        lastRefreshOkAtRef.current = Date.now();
        setConnection("online");
        clearConnectionMessage();
      },
      onRequestError: (error) => {
        if (desktop.desktopId !== activeDesktopIdRef.current || pairingInProgressRef.current)
          return;
        if (isUnauthorizedRemoteError(error) || isRemoteTransportFailure(error)) {
          setConnectionMessage(describeError(error, i18n._(msg`Desktop is unreachable.`)));
        } else {
          clearConnectionMessage();
        }
        downgradeConnectionOnError(error);
      },
    });
  }

  function setActiveDesktopSelection(desktopId: string | null) {
    activeDesktopIdRef.current = desktopId;
    setActiveDesktopState(desktopId);
  }

  /** Clear all state tied to a desktop session (on pair/switch/forget). */
  function resetSessionState() {
    resetRemoteStores();
    resetBrowserMirror();
    resetTerminalFeed();
    resetDesktopSettings();
    shellSnapshotRef.current = null;
    setThreadSnapshot(null);
    setSelectedThreadId(null);
    clearMessage();
    // Drop the per-desktop persistence bookkeeping so the first refresh after a
    // pair/switch always re-persists (bumping the desktop's ordering timestamps)
    // even when returning to a desktop whose seq hasn't advanced meanwhile.
    refreshService.resetPersistence();
    threadSnapshotSavedAtRef.current.clear();
  }

  async function pairDesktop(
    endpoint: string,
    credential: string,
    transport: StoredDesktop["transport"] = { kind: "direct" },
  ) {
    // Restore this on failure so the "pairing" state can't get stuck — while it
    // is set, DesktopsView disables Pair + Scan-QR, so a wedged "pairing" would
    // leave the user unable to retry.
    const priorConnection = connection;
    pairingInProgressRef.current = true;
    setConnection("pairing");
    clearMessage();
    try {
      let descriptor: RemoteEnvironmentDescriptor;
      let token: RemoteAccessTokenResult;
      try {
        const anonymousClient = new RemoteDesktopClient(endpoint);
        descriptor = await anonymousClient.environment();
        token = await anonymousClient.exchangePairingCredential({ credential });
      } catch (error) {
        // Roll the pill back so the pairing controls re-enable, then rethrow so
        // the caller (DesktopsRoute) can toast the reason.
        setConnection(priorConnection);
        setOperationMessage(describeError(error, i18n._(msg`Unable to pair with that desktop.`)));
        throw error;
      }
      resetSessionState();
      const desktop = await saveDesktop({
        descriptor,
        endpoint,
        accessToken: token.accessToken,
        tokenExpiresAt: token.expiresAt,
        // Server-echoed scopes are lenient on the wire; narrow to the set this
        // build understands before persisting them on the device.
        scopes: filterKnownRemoteAccessScopes(token.scopes),
        transport,
      });
      await reloadDesktops(desktop.desktopId);
      await refresh(desktop);
    } finally {
      pairingInProgressRef.current = false;
    }
  }

  async function pairSsh(
    sshConnection: SshConnectionConfig,
    authentication: SshBridgeAuthentication,
  ) {
    const result = await connectMobileSsh(sshConnection, authentication, true);
    if (!result.pairingCredential) {
      await disconnectMobileSsh(sshConnection.id);
      throw new Error(i18n._(msg`The remote Poracode server returned no pairing credential.`));
    }
    try {
      await setSshCredential(sshConnection.id, authentication);
      await pairDesktop(result.endpoint, result.pairingCredential, {
        kind: "ssh",
        connection: sshConnection,
      });
    } catch (error) {
      await Promise.allSettled([
        deleteSshCredential(sshConnection.id),
        disconnectMobileSsh(sshConnection.id),
      ]);
      throw error;
    }
  }

  function refresh(
    desktop = activeDesktop,
    options: RemoteRefreshOptions = {},
  ): Promise<RemoteShellSnapshot | null> {
    if (!desktop) return Promise.resolve(null);
    return refreshService.request(desktop, options, {
      activeDesktopId: () => activeDesktopIdRef.current,
      selectedThreadId: () => selectedThreadIdRef.current,
      rememberShellSnapshot: (snapshot) => {
        shellSnapshotRef.current = snapshot;
      },
      selectThreadIfUnset: (threadId) => {
        setSelectedThreadId((current) => current ?? threadId);
      },
      loadThreadSnapshot: (threadId, target, client, isCurrent) =>
        loadThreadSnapshot(threadId, target, {
          preferCache: false,
          client,
          isCurrent,
        }),
      reloadDesktops: () => reloadDesktops(),
      advanceSocketSeq: (desktopId, seq) => {
        if (socketCoordinatorRef.current?.desktopId === desktopId) {
          socketCoordinatorRef.current.coordinator.advanceLastSeenSeq(seq);
        }
      },
      markReachable: () => {
        lastRefreshOkAtRef.current = Date.now();
        setConnection("online");
        clearConnectionMessage();
      },
      reportCacheError: (error) => {
        setOperationMessage(describeError(error, i18n._(msg`Couldn't cache offline data.`)));
      },
      reportRequestError: (error) => {
        setConnectionMessage(describeError(error, i18n._(msg`Desktop is unreachable.`)));
        downgradeConnectionOnError(error);
      },
    });
  }

  function waitForRemoteThread(desktop: StoredDesktop, threadId: string): Promise<boolean> {
    return waitForRemoteThreadAppearance({
      refresh: async () => {
        await refresh(desktop, { includeAuxiliary: false });
      },
      hasThread: () => useAppStore.getState().threads.some((thread) => thread.id === threadId),
    });
  }

  async function openThread(thread: Thread) {
    // Mirror the desktop sidebar click: the shared store action marks the
    // thread as the visible pane (so live "idle" events apply as idle instead
    // of being downgraded to the unwatched "finished" state) and clears any
    // stale finished flag on the way in. Without it the PWA never
    // populates state.view, and a finished thread stays "Finished" forever.
    // ThreadsRoute resets the view to home on the way back so unwatched
    // completions keep earning their badge. `done` is intentionally preserved:
    // only an explicit unmark or real activity (status -> working) undoes it.
    const wasFinished = thread.status === "finished";
    useAppStore.getState().openThread(thread.id);
    setSelectedThreadId(thread.id);
    // Keep the ref in sync immediately: loadThreadSnapshot's stale-paint guard
    // compares against it and must not read the previous thread while the
    // re-render that would update it is still pending.
    selectedThreadIdRef.current = thread.id;
    // Declare this thread's content interest before any history request goes
    // out. The effect that watches `selectedThreadId` would only run a render
    // later — and much later under load — and until the host has the new
    // interest, this thread's live deltas are filtered out. Publishing first
    // keeps the window closed: the host learns what we want before we ask what
    // we missed.
    publishSelectedThreadItemInterest(thread.id);
    publishRemoteGitStateInterests(thread.id);
    setThreadSnapshot((current) => (current?.thread.id === thread.id ? current : null));
    const desktop = activeDesktop;
    if (!desktop) return;
    // `finished` is the source desktop's unread-completion marker. Clearing
    // only this PWA's mirror leaves the desktop row blue, so acknowledge the
    // open on the source as well. The command is idempotent and best-effort;
    // local navigation and cached history remain available while offline.
    if (wasFinished) {
      void clientFor(desktop)
        .sendThreadCommand({ kind: "acknowledge", threadId: thread.id })
        .catch(() => undefined);
    }
    // A concurrent open for this thread is already loading its history — the
    // view state above still applied, but a second fetch would race it.
    if (openInFlightRef.current === thread.id) return;
    openInFlightRef.current = thread.id;
    try {
      const loaded = await loadThreadSnapshot(thread.id, desktop, { preferCache: true });
      // Only auto-(re)start a thread when the status came from a FRESH server
      // snapshot. If the history fetch failed and we fell back to a CACHED
      // snapshot, a stale "startable" status would trigger startThread — which the
      // supervisor implements as close+restart, KILLING a live run. Also surface
      // any start failure rather than leaving an unhandled rejection.
      try {
        if (loaded && loaded.fromServer) {
          await ensureThreadRunning(loaded.snapshot.thread, desktop, loaded.snapshot.terminalSize);
        }
      } catch (error) {
        setOperationMessage(describeError(error, i18n._(msg`Unable to start the thread.`)));
      }
    } finally {
      if (openInFlightRef.current === thread.id) openInFlightRef.current = null;
    }
  }

  async function loadThreadSnapshot(
    threadId: string,
    desktop: StoredDesktop,
    options: {
      readonly preferCache: boolean;
      readonly retried?: boolean;
      readonly client?: RemoteDesktopClient;
      readonly isCurrent?: () => boolean;
    },
  ): Promise<{ readonly snapshot: RemoteThreadSnapshot; readonly fromServer: boolean } | null> {
    // A result is only painted when its thread is still the selected one — an
    // out-of-order fetch for a thread the user has since left must not clobber
    // the thread now on screen. The ref mirrors the fallback-selected thread.
    const isStaleSelection = () =>
      selectedThreadIdRef.current !== null && selectedThreadIdRef.current !== threadId;
    let latest: { snapshot: RemoteThreadSnapshot; fromServer: boolean } | null = null;
    if (options.preferCache) {
      const cached = await getStoredThreadSnapshot(desktop.desktopId, threadId);
      // The user may have switched desktops during the async cache read; a stale
      // preload must not paint over the desktop now on screen.
      if (desktop.desktopId !== activeDesktopIdRef.current) return null;
      if (cached && !isStaleSelection()) {
        latest = { snapshot: cached.snapshot, fromServer: false };
        setThreadSnapshot(cached.snapshot);
        // A cached preload is NOT authoritative — pass fromServer:false so a
        // shorter cached snapshot can't clobber a fuller live transcript.
        applyThreadSnapshot(cached.snapshot, { fromServer: false });
      }
    }
    try {
      const client = options.client ?? clientFor(desktop);
      const useNarrowPwaPage =
        !isNativeApp() &&
        typeof window.matchMedia === "function" &&
        !window.matchMedia(WIDE_SHELL_QUERY).matches;
      const next = useNarrowPwaPage
        ? await client.threadHistory(threadId, {
            targetTimelineEntryCount: NARROW_PWA_INITIAL_TIMELINE_ENTRY_COUNT,
          })
        : await client.threadHistory(threadId);
      // Bail if the active desktop changed while the fetch was in flight.
      if (desktop.desktopId !== activeDesktopIdRef.current) return latest;
      // Bail if the user opened another thread while the fetch was in flight.
      if (isStaleSelection()) return latest;
      latest = { snapshot: next, fromServer: true };
      const firstSnapshotItemId = next.runtimeItems[0]?.id;
      const existingRuntimeItemIds = useAppStore.getState().runtimeItemIdsByThread[threadId] ?? [];
      const tailOverlapsExistingTranscript =
        firstSnapshotItemId !== undefined && existingRuntimeItemIds.includes(firstSnapshotItemId);
      seedOlderThreadRuntimeItemsCursor(threadId, next.runtimeNextCursor ?? null, {
        preserveExistingCursor: tailOverlapsExistingTranscript,
      });
      setThreadSnapshot(next);
      // A fresh server history IS authoritative (fromServer defaults to true).
      applyThreadSnapshot(next, { fromServer: true });
      // Throttle the full-transcript write while the thread is actively
      // streaming: during a run the blob is re-fetched and rewritten on every
      // ~1s refresh. Non-running statuses (including the final post-run
      // snapshot) always persist immediately. Only the persistence is
      // throttled — the in-memory snapshot above is always applied.
      const snapshotKey = `${desktop.desktopId}:${threadId}`;
      const now = Date.now();
      if (
        shouldPersistThreadSnapshot(
          next.thread.status,
          threadSnapshotSavedAtRef.current.get(snapshotKey),
          now,
        )
      ) {
        try {
          await saveThreadSnapshot(desktop.desktopId, threadId, next);
          threadSnapshotSavedAtRef.current.set(snapshotKey, now);
        } catch {
          // Caching is best-effort; a Dexie write failure must not flip offline
          // (the server was reachable) — the in-memory snapshot is already applied.
        }
      }
    } catch (error) {
      if (options.isCurrent && !options.isCurrent()) return latest;
      setOperationMessage(describeError(error, i18n._(msg`Unable to load thread.`)));
      downgradeConnectionOnError(error);
      // One bounded retry even when cached history painted successfully: the
      // cache may be exactly the partial transcript from before Safari was
      // suspended. Skipped when the user has moved on.
      if (!options.retried && selectedThreadIdRef.current === threadId) {
        window.setTimeout(() => {
          if (
            selectedThreadIdRef.current === threadId &&
            activeDesktopIdRef.current === desktop.desktopId
          ) {
            void loadThreadSnapshot(threadId, desktop, { preferCache: true, retried: true });
          }
        }, 1500);
      }
    }
    return latest;
  }

  function resolveThreadProjectLocation(thread: Thread) {
    const project = projects.find((entry) => entry.id === thread.projectId);
    if (!project) return null;
    return thread.worktreePath
      ? buildWorktreeLocation(project.location, thread.worktreePath)
      : project.location;
  }

  /**
   * Activate an inactive thread on the desktop when the user opens it in the
   * PWA — the same reopen contract the desktop renderer applies (see
   * shared/threadRelaunch). Terminal threads spawn a fresh PTY; GUI (native
   * chat) threads resume their structured session via `sessionRef` (or open a
   * new one when none was ever recorded). Both are driven with an empty
   * prompt — the supervisor's `startThread` opens/resumes the session and
   * leaves it idle, starting a turn only when a prompt is supplied.
   */
  async function ensureThreadRunning(
    thread: Thread,
    desktop: StoredDesktop,
    terminalSize?: TerminalSize,
  ): Promise<void> {
    if (!shouldRelaunchThreadOnOpen(thread)) return;
    const projectLocation = resolveThreadProjectLocation(thread);
    if (!projectLocation) {
      // The thread is startable but its project isn't in the current shell
      // snapshot (transient race after a remote project change). Surface it
      // instead of silently leaving the thread inactive.
      setOperationMessage(i18n._(msg`Unable to start the thread.`));
      return;
    }
    await clientFor(desktop).startThread(
      buildThreadRelaunchStartInput({
        thread,
        projectLocation,
        initialSize: terminalSize ?? DEFAULT_TERMINAL_SIZE,
      }),
    );
    void refresh(desktop, { refreshSelectedThread: true });
  }

  /**
   * The desktop's submit core with the remote client as transport: optimistic
   * user_message paint, working flip, checkpoint capture, rollback, and touch
   * all follow the same lifecycle as a local prompt.
   */
  async function sendPrompt(prompt: string, segments?: PromptSegment[]) {
    const desktop = activeDesktop;
    const thread = selectedThread;
    if (!desktop || !thread || prompt.length === 0) return;
    await performThreadInputSubmit({
      thread,
      prompt,
      ...(segments ? { segments } : {}),
      transport: clientFor(desktop),
      captureCheckpoint: async (checkpointItemId) => {
        if (isHomeProjectId(thread.projectId)) return;
        const projectLocation = resolveThreadProjectLocation(thread);
        if (!projectLocation) return;
        await captureFileCheckpoint({
          threadId: thread.id,
          checkpointItemId,
          projectLocation,
        });
      },
    });
  }

  async function interrupt() {
    const desktop = activeDesktop;
    if (!desktop || !selectedThread) return;
    await clientFor(desktop).interruptThread(selectedThread.id);
  }

  async function startThread(project: Project, input: DraftStartInput): Promise<string | null> {
    const desktop = activeDesktop;
    if (!desktop) return null;
    // Resolve the worktree the thread should run in. Existing worktree → use it
    // as-is; a new-worktree draft → create it on the desktop first (mirrors the
    // desktop's handleDraftStart). Either way the thread launches via a
    // projectLocation pointed at the worktree dir (the supervisor cd's there).
    let worktreePath = input.existingWorktreePath;
    let isNewWorktree = false;
    const addWorktree = buildGitAddWorktreePayload(project, input);
    if (addWorktree) {
      try {
        const created = await readBridge().gitAddWorktree(addWorktree);
        worktreePath = created.path;
        isNewWorktree = true;
      } catch (error) {
        setOperationMessage(describeError(error, i18n._(msg`Couldn't create the worktree.`)));
        return null;
      }
    }
    const threadId = crypto.randomUUID();
    const launchResult = clientFor(desktop)
      .startNewThread({
        threadId,
        projectId: project.id,
        agentKind: input.agentKind,
        config: input.config,
        prompt: input.prompt,
        ...(input.segments ? { segments: input.segments } : {}),
        presentationMode: input.presentationMode ?? "gui",
        ...(worktreePath ? { worktreePath } : {}),
        ...(input.worktreeBranch ? { worktreeBranch: input.worktreeBranch } : {}),
        ...(isNewWorktree ? { isNewWorktree: true } : {}),
      })
      .then(
        () => ({ kind: "started" }) as const,
        (error: unknown) => ({ kind: "failed", error }) as const,
      );
    // The desktop persists the launching row before it awaits the provider's
    // process/session handshake. Poll for that durable acknowledgement in
    // parallel so navigation is not blocked by the full agent launch.
    const appearance = waitForRemoteThread(desktop, threadId);
    const first = await Promise.race([
      launchResult,
      appearance.then((appeared) => ({ kind: "appeared", appeared }) as const),
    ]);
    if (first.kind === "failed") throw first.error;
    const appeared = first.kind === "appeared" ? first.appeared : await appearance;
    if (!appeared) {
      setOperationMessage(i18n._(msg`Unable to start the thread.`));
      return null;
    }
    if (first.kind === "appeared") {
      void launchResult.then((result) => {
        if (result.kind !== "failed") return;
        setOperationMessage(describeError(result.error, i18n._(msg`Unable to start the thread.`)));
        void refresh(desktop, { refreshSelectedThread: true, includeAuxiliary: false });
      });
    }
    setSelectedThreadId(threadId);
    // Sync the ref before the snapshot load below: its stale-paint guard keys
    // off the ref, which otherwise still points at the previous thread until
    // the next render.
    selectedThreadIdRef.current = threadId;
    // Declare the new thread's content interest HERE rather than leaving it to
    // the effect below. The effect runs a render later — and much later under
    // load — and until the host has the new interest, this thread's live deltas
    // are filtered out. Publishing before the history fetch is issued keeps the
    // window closed: the host learns what we want before we ask what we missed.
    publishSelectedThreadItemInterest(threadId);
    void loadThreadSnapshot(threadId, desktop, { preferCache: false });
    return threadId;
  }

  /**
   * Thread-metadata action (rename, done, pin, archive, delete): applied
   * optimistically through the shared store, then forwarded to the desktop
   * renderer which owns and persists thread metadata. On failure the next
   * refresh restores the desktop's truth.
   */
  async function applyThreadAction(thread: Thread, action: ThreadAction) {
    const desktop = activeDesktop;
    if (!desktop) return;
    const store = useAppStore.getState();
    switch (action.kind) {
      case "rename":
        store.renameThread(thread.id, action.title);
        break;
      case "set-done":
        if (action.done) store.markThreadDone(thread.id);
        else store.unmarkThreadDone(thread.id);
        break;
      case "set-starred":
        if (action.starred) store.starThread(thread.id);
        else store.unstarThread(thread.id);
        break;
      case "archive":
        store.archiveThread(thread.id);
        break;
      case "unarchive":
        store.unarchiveThread(thread.id);
        break;
      case "delete":
        store.deleteThread(thread.id);
        break;
    }
    if (
      (action.kind === "archive" || action.kind === "delete") &&
      selectedThreadIdRef.current === thread.id
    ) {
      setSelectedThreadId(null);
      setThreadSnapshot(null);
    }
    try {
      await clientFor(desktop).sendThreadCommand({ ...action, threadId: thread.id });
    } catch (error) {
      setOperationMessage(describeError(error, i18n._(msg`Unable to update the thread.`)));
      void refresh(desktop, { refreshSelectedThread: true });
    }
  }

  /**
   * Destructive worktree cleanup is desktop-owned. The PWA removes the linked
   * rows optimistically, then asks the paired renderer to run its existing
   * `deleteWorktreeGroup` path (cleanup script, terminal teardown, branch/git
   * refresh, and persisted thread deletion).
   */
  async function deleteWorktreeGroup(input: WorktreeGroupDeleteInput) {
    const desktop = activeDesktop;
    if (!desktop || input.threadIds.length === 0) return;
    const store = useAppStore.getState();
    for (const threadId of input.threadIds) {
      store.deleteThread(threadId);
    }
    if (selectedThreadIdRef.current && input.threadIds.includes(selectedThreadIdRef.current)) {
      setSelectedThreadId(null);
      setThreadSnapshot(null);
    }
    try {
      await clientFor(desktop).sendThreadCommand({
        kind: "delete-worktree-group",
        threadId: input.threadIds[0]!,
        projectId: input.projectId,
        worktreePath: input.worktreePath,
        threadIds: [...input.threadIds],
      });
    } catch (error) {
      setOperationMessage(describeError(error, i18n._(msg`Unable to delete the worktree.`)));
      void refresh(desktop, { refreshSelectedThread: true });
    }
  }

  /**
   * Move a main-checkout thread into a fresh worktree on the paired desktop.
   * Mirrors the desktop's moveThreadToWorktree: the worktree is created through
   * the bridge (host git), then the host's `set-worktree` command re-tags the
   * durable row and — with isNewWorktree — primes git state and runs the setup
   * script there. An active thread is restarted in the new directory.
   * `withChanges` MOVES the main checkout's uncommitted changes along, leaving
   * the current branch clean.
   */
  async function moveThreadToWorktree(thread: Thread, withChanges: boolean) {
    const desktop = activeDesktop;
    if (!desktop || thread.worktreePath || movingThreadIds.has(thread.id)) return;
    const project = useAppStore.getState().projects.find((item) => item.id === thread.projectId);
    if (!project) return;
    if (thread.status === "launching") {
      setOperationMessage(
        i18n._(msg`Wait for the thread to finish starting before moving it to a worktree.`),
      );
      return;
    }
    const wasActive = thread.status !== "inactive";
    const bridge = readBridge();
    movingThreadIds.add(thread.id);
    try {
      // Re-tagging only sticks for a stopped thread — close any live runtime first.
      if (wasActive) {
        await bridge.closeThread({ threadId: thread.id });
      }
      const currentBranch = useGitSummariesStore.getState().byThread[thread.id]?.branch;
      const branch = generateWorktreeBranch();
      const created = await bridge.gitAddWorktree({
        projectLocation: project.location,
        branch,
        ...(currentBranch ? { startPoint: currentBranch } : {}),
        createBranch: true,
        ...(project.scripts?.worktreeCopyPatterns?.length
          ? { copyIgnoredPatterns: project.scripts.worktreeCopyPatterns }
          : {}),
        ...worktreePlacementPayload(project),
        transferUncommitted: withChanges,
        keepChangesInSource: false,
      });
      // Optimistic mirror; the host owns the durable row and confirms it via
      // the next snapshot. On failure the refresh below restores its truth.
      useAppStore.getState().setThreadWorktree(thread.id, created.path, branch);
      await clientFor(desktop).sendThreadCommand({
        kind: "set-worktree",
        threadId: thread.id,
        worktreePath: created.path,
        worktreeBranch: branch,
        isNewWorktree: true,
      });
      if (wasActive) {
        await bridge.startThread({
          threadId: thread.id,
          projectLocation: buildWorktreeLocation(project.location, created.path),
          agentKind: thread.agentKind,
          ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
          config: thread.config,
          prompt: "",
          initialSize: DEFAULT_TERMINAL_SIZE,
          ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
          ...(thread.presentationMode ? { presentationMode: thread.presentationMode } : {}),
        });
      }
    } catch (error) {
      setOperationMessage(
        describeError(error, i18n._(msg`Couldn't move the thread to a worktree.`)),
      );
      void refresh(desktop, { refreshSelectedThread: true });
    } finally {
      movingThreadIds.delete(thread.id);
    }
  }

  async function switchDesktop(desktop: StoredDesktop) {
    const previous = activeDesktop;
    let restored: StoredDesktop;
    try {
      restored = await restoreSshTransport(desktop);
    } catch (error) {
      reportSshRestoreFailure(error);
      throw error;
    }
    await setActiveDesktopId(restored.desktopId);
    setActiveDesktopSelection(restored.desktopId);
    resetSessionState();
    await reloadDesktops(restored.desktopId);
    await loadCached(restored.desktopId);
    await refresh(restored);
    if (previous?.transport?.kind === "ssh" && previous.desktopId !== restored.desktopId) {
      void disconnectMobileSsh(previous.transport.connection.id);
    }
  }

  async function forget(desktop: StoredDesktop) {
    const wasActive = desktop.desktopId === activeDesktopIdRef.current;
    // Best-effort: tell the desktop to drop this device's push registration
    // before its credentials are deleted below. The desktop may be offline or
    // unreachable, so this must never block or fail the unpair — it's fired
    // and forgotten, capturing the client (endpoint + token) now so it can
    // still complete after forgetDesktop() removes the stored credentials.
    if (isNativeApp()) {
      const client = clientFor(desktop);
      void getOrCreateDeviceId()
        .then((deviceId) => unregisterPush(client, deviceId))
        .catch((error: unknown) => {
          console.warn("[push] unregisterPush on unpair failed", error);
        });
    }
    if (desktop.transport?.kind === "ssh") {
      await Promise.allSettled([
        disconnectMobileSsh(desktop.transport.connection.id),
        deleteSshCredential(desktop.transport.connection.id),
      ]);
    }
    await forgetDesktop(desktop.desktopId);
    if (!wasActive) {
      // Forgetting a background desktop must NOT blank the active desktop's
      // live session — just drop the row and refresh the desktop list, keeping
      // the current desktop active.
      await reloadDesktops(activeDesktopIdRef.current ?? undefined);
      return;
    }
    // The active desktop is gone: clear its session, then hydrate the desktop
    // that becomes active next (mirrors switchDesktop). Pick the most-recent
    // remaining desktop and persist it as active so a reload doesn't lose it.
    resetSessionState();
    const nextDesktop = (await listStoredDesktops())[0] ?? null;
    if (!nextDesktop) {
      shellSnapshotRef.current = null;
      await reloadDesktops();
      return;
    }
    await setActiveDesktopId(nextDesktop.desktopId);
    await reloadDesktops(nextDesktop.desktopId);
    await loadCached(nextDesktop.desktopId);
    await refresh(nextDesktop);
  }

  /** Rename a paired desktop locally (a personal nickname; see renameDesktop). */
  async function rename(desktop: StoredDesktop, label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    await renameDesktop(desktop.desktopId, trimmed);
    await reloadDesktops();
  }

  /**
   * Manual "Reconnect" affordance: tear down and re-establish the socket from
   * scratch (resetting backoff) and re-pull a fresh snapshot. Used by the
   * connection banner/pill so the user is never stuck waiting out a backoff.
   */
  function reconnect() {
    setConnection("reconnecting");
    clearConnectionMessage();
    void (async () => {
      try {
        const restored = activeDesktop ? await restoreSshTransport(activeDesktop) : null;
        if (restored && restored.endpoint !== activeDesktop?.endpoint) {
          await reloadDesktops(restored.desktopId);
        }
        setReconnectNonce((nonce) => nonce + 1);
        await refresh(restored, { refreshSelectedThread: true });
      } catch (error) {
        reportSshRestoreFailure(error);
      }
    })();
  }

  /**
   * Add (existing folder / clone) or remove a project on the active desktop,
   * then refresh the snapshot so the new project list shows. Requires the
   * `projects:manage` scope; throws a RemoteClientError if it's missing.
   */
  async function manageProject(command: RemoteProjectCommand) {
    const desktop = activeDesktop;
    if (!desktop) return;
    await clientFor(desktop).projectCommand(command);
    await refresh(desktop);
  }

  return {
    desktops,
    activeDesktopId,
    activeDesktop,
    snapshot: shellSnapshotRef.current,
    connection,
    message,
    booted,
    projects,
    activeThreads: threads,
    archivedThreads,
    selectedThread,
    selectedThreadSnapshot,
    selectedProject,
    refresh,
    openThread,
    pairDesktop,
    pairSsh,
    probeSshHost: probeMobileSshHost,
    sendPrompt,
    interrupt,
    startThread,
    applyThreadAction,
    deleteWorktreeGroup,
    moveThreadToWorktree,
    manageProject,
    switchDesktop,
    forget,
    rename,
    reconnect,
    actions: sessionTransport.actions,
  };
}

export type RemoteDesktopSession = ReturnType<typeof useRemoteDesktop>;
