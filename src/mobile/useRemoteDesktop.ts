import { useEffect, useMemo, useRef, useState } from "react";
import type { SshBridgeAuthentication } from "@lightcode/ssh-bridge";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useShallow } from "zustand/react/shallow";
import {
  DEFAULT_TERMINAL_SIZE,
  type Project,
  type PromptSegment,
  type TerminalSize,
  type Thread,
  type ThreadStatus,
} from "@/shared/contracts";
import { buildWorktreeLocation } from "@/shared/worktree";
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
import { useAppStore } from "@/renderer/state/appStore";
import { readBridge } from "@/renderer/bridge";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { i18n } from "@/renderer/i18n/i18n";
import { setRemoteBridgeClient } from "./bridge";
import { resetBrowserMirror } from "./browserMirror";
import { buildGitAddWorktreePayload } from "./navHelpers";
import { isNativeApp } from "./pwaInstall";
import { connectMobileSsh, disconnectMobileSsh, probeMobileSshHost } from "./mobileSsh";
import { unregisterPush } from "./push/pushRegistration";
import { resetTerminalFeed } from "./terminalFeed";
import { RemoteDesktopClient } from "./remoteClient";
import {
  createRemoteSocketCoordinator,
  isUnauthorizedRemoteError,
} from "./remoteSocketCoordinator";
import { applyDesktopSettings, resetDesktopSettings } from "./settingsSync";
import { sortThreadsByRecency } from "./presentation";
import {
  applyAgentStatuses,
  applyShellSnapshot,
  applyThreadSnapshot,
  resetRemoteStores,
} from "./storeSync";
import {
  forgetDesktop,
  getActiveDesktopId,
  getOrCreateDeviceId,
  getStoredShellSnapshot,
  getStoredThreadSnapshot,
  listStoredDesktops,
  markDesktopConnected,
  readShellSnapshotMirror,
  renameDesktop,
  saveDesktop,
  saveShellSnapshot,
  saveThreadSnapshot,
  setActiveDesktopId,
  shouldPersistThreadSnapshot,
  updateDesktopPlatform,
  updateDesktopEndpoint,
  type StoredDesktop,
} from "./storage";
import { deleteSshCredential, getSshCredential, setSshCredential } from "./sshVault";

export type ConnectionState =
  | "booting"
  | "pairing"
  | "online"
  | "reconnecting"
  | "offline"
  | "unauthorized"
  | "error";

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

export const CONNECTION_LABELS: Record<ConnectionState, MessageDescriptor> = {
  booting: msg`Starting`,
  pairing: msg`Pairing`,
  online: msg`Live`,
  reconnecting: msg`Reconnecting`,
  offline: msg`Offline`,
  unauthorized: msg`Pair again`,
  error: msg`Error`,
};

const REMOTE_THREAD_APPEAR_ATTEMPTS = 10;
const REMOTE_THREAD_APPEAR_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function firstThreadIdByRecency(threads: readonly Thread[]): string | undefined {
  return sortThreadsByRecency(threads)[0]?.id;
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
  const result = await connectMobileSsh(connection, credential, false);
  await updateDesktopEndpoint(desktop.desktopId, result.endpoint);
  return { ...desktop, endpoint: result.endpoint };
}

const MOBILE_TERMINAL_START_STATUSES = new Set<ThreadStatus>([
  "inactive",
  "launching",
  "finished",
  "error",
]);

// For GUI threads "finished" (and "launching") mean the structured session is
// still alive on the desktop — restarting would close+reopen a live session.
// Only resume sessions that are actually gone, and only ones that ended
// CLEANLY: a prompt-less resume of an "error" thread replays its broken turn,
// which the agent session can keep re-entering on its own — an infinite
// relaunch-into-working loop with no user input. Errored threads wait for an
// explicit prompt instead.
const MOBILE_GUI_START_STATUSES = new Set<ThreadStatus>(["inactive"]);

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
  const [snapshot, setSnapshot] = useState<RemoteShellSnapshot | null>(() => {
    const mirror = readShellSnapshotMirror();
    if (!mirror) return null;
    applyShellSnapshot(mirror.snapshot);
    return mirror.snapshot;
  });
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadSnapshot, setThreadSnapshot] = useState<RemoteThreadSnapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("booting");
  const [message, setMessage] = useState("");
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
  // Whether the live event socket is currently open. `refresh()` consults this
  // so an HTTP-only success/failure doesn't flap the connection pill while the
  // WebSocket (the real source of "Live") is up or down.
  const socketOpenRef = useRef(false);
  // Highest shell-snapshot seq successfully persisted this session, per desktop.
  // The server bumps snapshotSeq on every remotely-consumed event (see
  // RemoteAccessServer), so an unchanged seq means the shell snapshot content is
  // identical and the Dexie write + desktop-row bump + reloadDesktops() can be
  // skipped. Kept in a ref (not `desktop.lastSeenSeq`, which can lag) and reset
  // on every session change so the first refresh after boot/switch always
  // persists (bumping lastConnectedAt/updatedAt for list ordering).
  const persistedShellSeqRef = useRef<Map<string, number>>(new Map());
  // Last transcript-snapshot save time per `desktopId:threadId`, used to throttle
  // full-blob writes while a thread is actively streaming.
  const threadSnapshotSavedAtRef = useRef<Map<string, number>>(new Map());

  const activeDesktop = desktops.find((desktop) => desktop.desktopId === activeDesktopId) ?? null;
  const storeThreads = useAppStore(useShallow((state) => state.threads));
  const projects = useAppStore(useShallow((state) => state.projects));
  // sortThreadsByRecency already drops archived threads; memoize so unrelated
  // re-renders (connection/message changes during streaming) don't re-sort.
  const threads = useMemo(() => sortThreadsByRecency(storeThreads), [storeThreads]);
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
        if (snapshot) resetSessionState();
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
          setConnection("error");
          setMessage(describeError(error, i18n._(msg`Unable to restore the SSH connection.`)));
          return;
        }
      }
      setDesktops(stored);
      await loadCached(desktopId);
      if (desktop) {
        await refresh(desktop);
      }
    }
    void boot()
      .catch((error: unknown) => {
        if (cancelled) return;
        setConnection("error");
        setMessage(describeError(error, i18n._(msg`Unable to start mobile app.`)));
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
      setRemoteBridgeClient(null);
      return;
    }
    setRemoteBridgeClient(
      new RemoteDesktopClient(activeDesktop.endpoint, activeDesktop.accessToken),
      activeDesktop.platform ?? null,
    );
    return () => setRemoteBridgeClient(null);
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
    const coordinator = createRemoteSocketCoordinator({
      createClient: () => clientFor(desktop),
      initialLastSeenSeq: desktop.lastSeenSeq,
      getSelectedThreadId: () => selectedThreadIdRef.current,
      requestRefresh: (options) => {
        void refresh(desktop, options);
      },
      onConnectionChange: setConnection,
      onMessageChange: setMessage,
      onOpenChange: (open) => {
        socketOpenRef.current = open;
      },
      getPairingExpiredMessage: () => i18n._(msg`Pairing expired — pair again to reconnect.`),
    });
    coordinator.start();
    return () => coordinator.dispose();
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
    setSnapshot(cached.snapshot);
    applyShellSnapshot(cached.snapshot);
    const firstThreadId = firstThreadIdByRecency(cached.snapshot.threads) ?? null;
    setSelectedThreadId((current) => current ?? firstThreadId);
    setConnection("offline");
  }

  function clientFor(desktop: StoredDesktop): RemoteDesktopClient {
    return new RemoteDesktopClient(desktop.endpoint, desktop.accessToken);
  }

  function setActiveDesktopSelection(desktopId: string | null) {
    activeDesktopIdRef.current = desktopId;
    setActiveDesktopState(desktopId);
  }

  /**
   * Downgrade the connection pill after a failed HTTP request: unauthorized
   * errors force re-pairing; otherwise only drop to "offline" when the live
   * socket isn't up (a working socket keeps the pill "online" despite HTTP
   * hiccups).
   */
  function downgradeConnectionOnError(error: unknown) {
    if (isUnauthorizedRemoteError(error)) setConnection("unauthorized");
    else if (!socketOpenRef.current) setConnection("offline");
  }

  /** Clear all state tied to a desktop session (on pair/switch/forget). */
  function resetSessionState() {
    resetRemoteStores();
    resetBrowserMirror();
    resetTerminalFeed();
    resetDesktopSettings();
    setSnapshot(null);
    setThreadSnapshot(null);
    setSelectedThreadId(null);
    // Drop the per-desktop persistence bookkeeping so the first refresh after a
    // pair/switch always re-persists (bumping the desktop's ordering timestamps)
    // even when returning to a desktop whose seq hasn't advanced meanwhile.
    persistedShellSeqRef.current.clear();
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
    setConnection("pairing");
    setMessage("");
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
      setMessage(describeError(error, i18n._(msg`Unable to pair with that desktop.`)));
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

  async function refresh(
    desktop = activeDesktop,
    options: {
      readonly refreshSelectedThread?: boolean;
      /**
       * When true (explicit/initial/reconnect refreshes) also re-fetch agent
       * statuses and remote settings. Event-driven refreshes skip these — those
       * signals already arrive as live WS events, so re-polling them on every
       * status change of any thread is pure waste.
       */
      readonly includeAuxiliary?: boolean;
    } = {},
  ) {
    if (!desktop) return;
    const includeAuxiliary = options.includeAuxiliary ?? true;
    try {
      const client = clientFor(desktop);
      const next = await client.snapshot();
      // The user may have switched desktops while this snapshot was in flight;
      // a stale result must not overwrite the desktop now on screen.
      if (desktop.desktopId !== activeDesktopIdRef.current) return null;
      applyShellSnapshot(next);
      setSnapshot(next);
      // Auxiliary data (agent statuses + remote-editable AI settings) is
      // independent of the thread list and streams as live events, so only
      // re-poll it on explicit/initial/reconnect refreshes. Never let either
      // failure hide threads. Older desktops without the settings endpoint just
      // fall back to cached values.
      if (includeAuxiliary) {
        const [statuses, desktopSettings, environment] = await Promise.allSettled([
          client.agentStatuses(),
          client.settings(),
          // Refresh host platform for existing pairings that predate the field
          // (and keep it current if the user migrates the desktop OS).
          client.environment(),
        ]);
        if (desktop.desktopId !== activeDesktopIdRef.current) return null;
        if (statuses.status === "fulfilled") applyAgentStatuses(statuses.value);
        if (desktopSettings.status === "fulfilled") applyDesktopSettings(desktopSettings.value);
        if (environment.status === "fulfilled" && environment.value.platform) {
          const platform = environment.value.platform;
          if (desktop.platform !== platform) {
            await updateDesktopPlatform(desktop.desktopId, platform).catch(() => undefined);
            // Reload so the bridge effect picks up the new host platform.
            await reloadDesktops(desktop.desktopId);
          }
        }
      }
      setSelectedThreadId((current) => current ?? firstThreadIdByRecency(next.threads) ?? null);
      // Only report a live connection when the socket is actually open. HTTP
      // can succeed while the WS is blocked; downgrading/upgrading purely off
      // HTTP results makes the pill flap. Leave a live socket's "online" alone.
      if (socketOpenRef.current) setConnection("online");
      setMessage("");
      // The shell snapshot content is keyed by snapshotSeq: an unchanged seq
      // means nothing the snapshot carries has changed since the last persist,
      // so skip the Dexie write, the desktop-row bump, AND the reloadDesktops()
      // that follows (which on native rehydrates every desktop's token from the
      // OS keystore). The in-memory application above still runs on every
      // refresh — only the persistence side effects are elided. The first
      // refresh per desktop this session has no recorded seq, so it always
      // persists (bumping lastConnectedAt/updatedAt for list ordering).
      const lastPersistedSeq = persistedShellSeqRef.current.get(desktop.desktopId);
      if (lastPersistedSeq !== next.snapshotSeq) {
        // Persist to Dexie in its OWN try/catch, outside the reachability path: a
        // transient IndexedDB write failure must surface as a banner, not flip a
        // live connection offline (the server was clearly reachable — we just got
        // the snapshot from it).
        try {
          await Promise.all([
            saveShellSnapshot(desktop.desktopId, next),
            markDesktopConnected(desktop.desktopId, next.snapshotSeq),
          ]);
          persistedShellSeqRef.current.set(desktop.desktopId, next.snapshotSeq);
        } catch (error) {
          setMessage(describeError(error, i18n._(msg`Couldn't cache offline data.`)));
        }
        // Do NOT force the active desktop here — only switchDesktop/pair set it.
        // Forcing it would flip the user back to a stale desktop when a late
        // refresh of a previous desktop resolves after a switch.
        await reloadDesktops();
      }
      const threadId = selectedThreadIdRef.current ?? firstThreadIdByRecency(next.threads);
      if (options.refreshSelectedThread && threadId) {
        await loadThreadSnapshot(threadId, desktop, { preferCache: false });
      }
      return next;
    } catch (error) {
      // A failed refresh must not knock a live socket offline (transient HTTP
      // or Dexie hiccup while deltas keep streaming). Surface the message; only
      // downgrade the pill when the socket isn't actually up.
      setMessage(describeError(error, i18n._(msg`Desktop is unreachable.`)));
      downgradeConnectionOnError(error);
      return null;
    }
  }

  async function waitForRemoteThread(desktop: StoredDesktop, threadId: string): Promise<boolean> {
    for (let attempt = 0; attempt < REMOTE_THREAD_APPEAR_ATTEMPTS; attempt += 1) {
      await refresh(desktop);
      if (useAppStore.getState().threads.some((thread) => thread.id === threadId)) {
        return true;
      }
      if (attempt < REMOTE_THREAD_APPEAR_ATTEMPTS - 1) {
        await delay(REMOTE_THREAD_APPEAR_DELAY_MS);
      }
    }
    return false;
  }

  async function openThread(thread: Thread) {
    // Mirror the desktop sidebar click: the shared store action marks the
    // thread as the visible pane (so live "idle" events apply as idle instead
    // of being downgraded to the unwatched "finished" state) and clears any
    // stale finished/done flags on the way in. Without it the PWA never
    // populates state.view, and a finished thread stays "Finished" forever.
    // ThreadsRoute resets the view to home on the way back so unwatched
    // completions keep earning their badge.
    const wasDone = thread.done === true;
    useAppStore.getState().openThread(thread.id);
    setSelectedThreadId(thread.id);
    setThreadSnapshot((current) => (current?.thread.id === thread.id ? current : null));
    const desktop = activeDesktop;
    if (!desktop) return;
    // The store clear above only touches this PWA's in-memory mirror. Unlike
    // the desktop — whose renderer store is authoritative and persisted — it
    // never reaches the desktop DB, so the next snapshot would revert `done`
    // back to true. Propagate the un-done to the desktop (best-effort, the same
    // command the explicit "Unmark done" menu sends) so opening a done thread
    // actually clears it there too, matching desktop behaviour.
    if (wasDone) {
      void clientFor(desktop)
        .sendThreadCommand({ kind: "set-done", done: false, threadId: thread.id })
        .catch(() => undefined);
    }
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
      setMessage(describeError(error, i18n._(msg`Unable to start the thread.`)));
    }
  }

  async function loadThreadSnapshot(
    threadId: string,
    desktop: StoredDesktop,
    options: { readonly preferCache: boolean },
  ): Promise<{ readonly snapshot: RemoteThreadSnapshot; readonly fromServer: boolean } | null> {
    let latest: { snapshot: RemoteThreadSnapshot; fromServer: boolean } | null = null;
    const cached = await getStoredThreadSnapshot(desktop.desktopId, threadId);
    // The user may have switched desktops during the async cache read; a stale
    // preload must not paint over the desktop now on screen.
    if (desktop.desktopId !== activeDesktopIdRef.current) return null;
    if (options.preferCache && cached) {
      latest = { snapshot: cached.snapshot, fromServer: false };
      setThreadSnapshot(cached.snapshot);
      // A cached preload is NOT authoritative — pass fromServer:false so a
      // shorter cached snapshot can't clobber a fuller live transcript.
      applyThreadSnapshot(cached.snapshot, { fromServer: false });
    }
    try {
      const next = await clientFor(desktop).threadHistory(threadId);
      // Bail if the active desktop changed while the fetch was in flight.
      if (desktop.desktopId !== activeDesktopIdRef.current) return latest;
      latest = { snapshot: next, fromServer: true };
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
      setMessage(describeError(error, i18n._(msg`Unable to load thread.`)));
      downgradeConnectionOnError(error);
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
   * PWA. Terminal threads spawn a fresh PTY; GUI (native chat) threads resume
   * their structured session via `sessionRef` (or open a new one when none was
   * ever recorded). Both are driven with an empty prompt — the supervisor's
   * `startThread` opens/resumes the session and leaves it idle, starting a turn
   * only when a prompt is supplied. Only the presentation and terminal size
   * differ between the two, so a single call covers both.
   */
  async function ensureThreadRunning(
    thread: Thread,
    desktop: StoredDesktop,
    terminalSize?: TerminalSize,
  ): Promise<void> {
    const presentation = thread.presentationMode ?? "terminal";
    const startStatuses =
      presentation === "terminal" ? MOBILE_TERMINAL_START_STATUSES : MOBILE_GUI_START_STATUSES;
    if (!startStatuses.has(thread.status)) return;
    const projectLocation = resolveThreadProjectLocation(thread);
    if (!projectLocation) {
      // The thread is startable but its project isn't in the current shell
      // snapshot (transient race after a remote project change). Surface it
      // instead of silently leaving the thread inactive.
      setMessage(i18n._(msg`Unable to start the thread.`));
      return;
    }
    await clientFor(desktop).startThread({
      threadId: thread.id,
      projectLocation,
      agentKind: thread.agentKind,
      ...(thread.agentInstanceId ? { agentInstanceId: thread.agentInstanceId } : {}),
      config: thread.config,
      prompt: "",
      initialSize: terminalSize ?? DEFAULT_TERMINAL_SIZE,
      ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
      presentationMode: presentation,
    });
    void refresh(desktop, { refreshSelectedThread: true });
  }

  /**
   * The desktop's submit core with the remote client as transport: optimistic
   * user_message paint, working flip, rollback, and touch all come from
   * `performThreadInputSubmit`. No checkpoint capture — checkpoints are a
   * desktop-local concern. Rejects on transport failure so callers (the
   * mobile composer dock collapse) only react to successful sends.
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
        setMessage(describeError(error, i18n._(msg`Couldn't create the worktree.`)));
        return null;
      }
    }
    const result = await clientFor(desktop).startNewThread({
      projectId: project.id,
      agentKind: input.agentKind,
      config: input.config,
      prompt: input.prompt,
      ...(input.segments ? { segments: input.segments } : {}),
      presentationMode: input.presentationMode ?? "gui",
      ...(worktreePath ? { worktreePath } : {}),
      ...(input.worktreeBranch ? { worktreeBranch: input.worktreeBranch } : {}),
      ...(isNewWorktree ? { isNewWorktree: true } : {}),
    });
    const appeared = await waitForRemoteThread(desktop, result.threadId);
    if (!appeared) {
      setMessage(i18n._(msg`Unable to start the thread.`));
      return null;
    }
    setSelectedThreadId(result.threadId);
    void loadThreadSnapshot(result.threadId, desktop, { preferCache: false });
    return result.threadId;
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
      setMessage(describeError(error, i18n._(msg`Unable to update the thread.`)));
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
      setMessage(describeError(error, i18n._(msg`Unable to delete the worktree.`)));
      void refresh(desktop, { refreshSelectedThread: true });
    }
  }

  async function switchDesktop(desktop: StoredDesktop) {
    const previous = activeDesktop;
    let restored: StoredDesktop;
    try {
      restored = await restoreSshTransport(desktop);
    } catch (error) {
      setConnection("error");
      setMessage(describeError(error, i18n._(msg`Unable to restore the SSH connection.`)));
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
      setSnapshot(null);
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
    setConnection((current) => (current === "online" ? current : "reconnecting"));
    setMessage("");
    void (async () => {
      try {
        const restored = activeDesktop ? await restoreSshTransport(activeDesktop) : null;
        if (restored && restored.endpoint !== activeDesktop?.endpoint) {
          await reloadDesktops(restored.desktopId);
        }
        setReconnectNonce((nonce) => nonce + 1);
        await refresh(restored, { refreshSelectedThread: true });
      } catch (error) {
        setConnection("error");
        setMessage(describeError(error, i18n._(msg`Unable to restore the SSH connection.`)));
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
    snapshot,
    connection,
    message,
    booted,
    projects,
    threads,
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
    manageProject,
    switchDesktop,
    forget,
    rename,
    reconnect,
  };
}

export type RemoteDesktopSession = ReturnType<typeof useRemoteDesktop>;
