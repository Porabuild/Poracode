import { useEffect, useMemo, useRef, useState } from "react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useShallow } from "zustand/react/shallow";
import type { Project, PromptSegment, Thread, ThreadServerRequestId } from "@/shared/contracts";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import { buildWorktreeLocation } from "@/shared/worktree";
import type {
  RemoteShellSnapshot,
  RemoteThreadSnapshot,
  RemoteWebSocketClientMessage,
} from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { readBridge } from "@/renderer/bridge";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { i18n } from "@/renderer/i18n/i18n";
import { setRemoteBridgeClient } from "./bridge";
import {
  handleBrowserServerMessage,
  resetBrowserMirror,
  setBrowserSocketSender,
} from "./browserMirror";
import { buildGitAddWorktreePayload } from "./navHelpers";
import { parsePairingLaunch } from "./pairing";
import {
  handleTerminalServerMessage,
  resetTerminalFeed,
  setTerminalSocketSender,
} from "./terminalFeed";
import { RemoteClientError, RemoteDesktopClient } from "./remoteClient";
import { applyDesktopSettings, resetDesktopSettings } from "./settingsSync";
import { sortThreadsByRecency } from "./presentation";
import {
  applyAgentStatuses,
  applyShellSnapshot,
  applyThreadSnapshot,
  dispatchRemoteSupervisorEvent,
  resetRemoteStores,
} from "./storeSync";
import {
  forgetDesktop,
  getActiveDesktopId,
  getStoredShellSnapshot,
  getStoredThreadSnapshot,
  listStoredDesktops,
  markDesktopConnected,
  renameDesktop,
  saveDesktop,
  saveShellSnapshot,
  saveThreadSnapshot,
  setActiveDesktopId,
  type StoredDesktop,
} from "./storage";

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

export const CONNECTION_LABELS: Record<ConnectionState, MessageDescriptor> = {
  booting: msg`Starting`,
  pairing: msg`Pairing`,
  online: msg`Live`,
  reconnecting: msg`Reconnecting`,
  offline: msg`Offline`,
  unauthorized: msg`Pair again`,
  error: msg`Error`,
};

/** WebSocket reconnect backoff: full-jitter exponential, capped. */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 20000;
function reconnectDelay(attempt: number): number {
  const ceiling = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
  // Full jitter keeps a fleet of clients from retrying in lockstep.
  return ceiling / 2 + Math.random() * (ceiling / 2);
}

function isUnauthorizedRemoteError(error: unknown): error is RemoteClientError {
  return error instanceof RemoteClientError && error.status === 401;
}

/** Status-affecting events warrant a snapshot refresh; streaming deltas don't. */
function shouldRefreshAfterSupervisorEvent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "thread-state" ||
    type === "thread-exited" ||
    type === "thread-reset" ||
    type === "windows-agent-statuses" ||
    type === "wsl-agent-statuses"
  );
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
  const [activeDesktopId, setActiveDesktop] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RemoteShellSnapshot | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadSnapshot, setThreadSnapshot] = useState<RemoteThreadSnapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("booting");
  const [message, setMessage] = useState("");
  const [booted, setBooted] = useState(false);
  // Bumped by reconnect() to force the socket effect to tear down and
  // re-establish immediately (resetting its backoff attempt counter).
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const selectedThreadIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const launch = parsePairingLaunch();
      const stored = await listStoredDesktops();
      const active = await getActiveDesktopId();
      if (cancelled) return;
      setDesktops(stored);
      setActiveDesktop(active ?? stored[0]?.desktopId ?? null);
      if (launch.credential) {
        await pairDesktop(launch.endpoint, launch.credential);
        // The pairing params were already stripped from the URL by
        // capturePairingLaunch() before the router started; nothing to clean.
        return;
      }
      const desktopId = active ?? stored[0]?.desktopId;
      if (!desktopId) {
        setConnection("offline");
        return;
      }
      await loadCached(desktopId);
      const desktop = stored.find((entry) => entry.desktopId === desktopId);
      if (desktop) {
        await refresh(desktop);
      }
    }
    void boot()
      .catch((error: unknown) => {
        if (cancelled) return;
        setConnection("error");
        setMessage(
          error instanceof Error ? error.message : i18n._(msg`Unable to start mobile app.`),
        );
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
  // shim; keep it pointed at the active connection.
  useEffect(() => {
    if (!activeDesktop) {
      setRemoteBridgeClient(null);
      return;
    }
    setRemoteBridgeClient(
      new RemoteDesktopClient(activeDesktop.endpoint, activeDesktop.accessToken),
    );
    return () => setRemoteBridgeClient(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the connection identity
  }, [activeDesktop?.desktopId, activeDesktop?.endpoint, activeDesktop?.accessToken]);

  useEffect(() => {
    const desktopCandidate = activeDesktop;
    if (!desktopCandidate) return;
    const desktop: StoredDesktop = desktopCandidate;
    let closed = false;
    let ws: WebSocket | null = null;
    // Guards against the online/visibility listeners spawning a second socket
    // while one is already opening.
    let connecting = false;
    let timer = 0;
    let refreshTimer = 0;
    // Consecutive failed connect attempts since the last successful open;
    // drives the exponential backoff and resets to 0 on every open().
    let attempt = 0;
    // Tracked locally so reconnects resume from the latest event; the seq is
    // persisted via markDesktopConnected on the debounced refresh below.
    let lastSeenSeq = desktop.lastSeenSeq;

    function scheduleRefresh() {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void refresh(desktop, { refreshSelectedThread: true });
      }, 600);
    }

    /** Schedule the next reconnect with capped, jittered backoff. */
    function scheduleReconnect() {
      if (closed) return;
      // A device with no network connection won't recover until it comes
      // back; surface that distinctly and let the "online" listener wake us.
      setConnection(navigator.onLine === false ? "offline" : "reconnecting");
      window.clearTimeout(timer);
      timer = window.setTimeout(connect, reconnectDelay(attempt));
      attempt += 1;
    }

    function connect() {
      // The browser may queue this from a backoff timer that fired after the
      // device went offline; defer until the "online" event wakes us.
      if (closed || navigator.onLine === false) return;
      // Already open, or an attempt is in flight — don't stack sockets.
      if (connecting || ws?.readyState === WebSocket.OPEN) return;
      connecting = true;
      void (async () => {
        try {
          const client = clientFor(desktop);
          const ticket = await client.websocketTicket();
          if (closed) {
            connecting = false;
            return;
          }
          const socket = new WebSocket(client.websocketUrl(ticket, lastSeenSeq));
          ws = socket;
          socket.addEventListener("open", () => {
            connecting = false;
            attempt = 0;
            setConnection("online");
            setMessage("");
            // Browser mirroring (watch/input) rides this socket; registering the
            // sender re-subscribes a watching BrowserView after reconnects.
            const socketSender = (outgoing: RemoteWebSocketClientMessage) => {
              if (socket.readyState !== WebSocket.OPEN) return false;
              socket.send(JSON.stringify(outgoing));
              return true;
            };
            setBrowserSocketSender(socketSender);
            // Live terminal streaming (CLI threads + dev shells) rides this
            // socket too; registering re-subscribes on-screen terminals.
            setTerminalSocketSender(socketSender);
            // A refresh that failed while the socket was down would otherwise
            // be masked by this handler — re-fetch so the failure either heals
            // or resurfaces its error message.
            scheduleRefresh();
          });
          socket.addEventListener("message", (event) => {
            try {
              const parsed = client.parseSocketMessage(String(event.data));
              if (handleBrowserServerMessage(parsed)) return;
              if (handleTerminalServerMessage(parsed)) return;
              if (parsed.type === "event") {
                lastSeenSeq = Math.max(lastSeenSeq, parsed.seq);
                // Live path: stream events straight into the shared stores so
                // open transcripts update without a fetch round-trip.
                dispatchRemoteSupervisorEvent(parsed.event);
                if (shouldRefreshAfterSupervisorEvent(parsed.event)) {
                  scheduleRefresh();
                }
              }
              if (parsed.type === "resync-required") {
                scheduleRefresh();
              }
            } catch {
              // Bad frames are ignored; HTTP refresh remains authoritative.
            }
          });
          socket.addEventListener("close", () => {
            connecting = false;
            if (ws === socket) ws = null;
            setBrowserSocketSender(null);
            setTerminalSocketSender(null);
            scheduleReconnect();
          });
        } catch (error) {
          connecting = false;
          if (isUnauthorizedRemoteError(error)) {
            window.clearTimeout(timer);
            setConnection("unauthorized");
            setMessage(error.message);
            return;
          }
          scheduleReconnect();
        }
      })();
    }

    // The OS network transitions let us react instantly instead of waiting
    // out a backoff timer: drop to "offline" the moment the radio dies, and
    // retry immediately (reset backoff) the moment it returns.
    function handleOnline() {
      if (closed) return;
      attempt = 0;
      window.clearTimeout(timer);
      connect();
      // If the socket survived (stale-open), connect() is a no-op; re-pull a
      // snapshot so state is correct after the network gap either way.
      scheduleRefresh();
    }
    function handleOffline() {
      if (closed) return;
      setConnection("offline");
    }
    // Re-establishing on tab focus catches sockets the OS quietly killed while
    // the PWA was backgrounded (common on mobile) without firing a close event.
    function handleVisibility() {
      if (closed || document.visibilityState !== "visible") return;
      if (ws?.readyState === WebSocket.OPEN) {
        scheduleRefresh();
        return;
      }
      handleOnline();
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      window.clearTimeout(refreshTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      setBrowserSocketSender(null);
      setTerminalSocketSender(null);
      ws?.close();
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

  async function reloadDesktops(nextActive?: string) {
    const stored = await listStoredDesktops();
    setDesktops(stored);
    setActiveDesktop(nextActive ?? (await getActiveDesktopId()) ?? stored[0]?.desktopId ?? null);
  }

  async function loadCached(desktopId: string) {
    const cached = await getStoredShellSnapshot(desktopId);
    if (!cached) return;
    setSnapshot(cached.snapshot);
    applyShellSnapshot(cached.snapshot);
    const firstThreadId = sortThreadsByRecency(cached.snapshot.threads)[0]?.id ?? null;
    setSelectedThreadId((current) => current ?? firstThreadId);
    setConnection("offline");
  }

  function clientFor(desktop: StoredDesktop): RemoteDesktopClient {
    return new RemoteDesktopClient(desktop.endpoint, desktop.accessToken);
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
  }

  async function pairDesktop(endpoint: string, credential: string) {
    setConnection("pairing");
    setMessage("");
    const anonymousClient = new RemoteDesktopClient(endpoint);
    const descriptor = await anonymousClient.environment();
    const token = await anonymousClient.exchangePairingCredential({ credential });
    resetSessionState();
    const desktop = await saveDesktop({
      descriptor,
      accessToken: token.accessToken,
      tokenExpiresAt: token.expiresAt,
      scopes: token.scopes,
    });
    await reloadDesktops(desktop.desktopId);
    await refresh(desktop);
  }

  async function refresh(
    desktop = activeDesktop,
    options: { readonly refreshSelectedThread?: boolean } = {},
  ) {
    if (!desktop) return;
    try {
      const client = clientFor(desktop);
      const next = await client.snapshot();
      await Promise.all([
        saveShellSnapshot(desktop.desktopId, next),
        markDesktopConnected(desktop.desktopId, next.snapshotSeq),
      ]);
      setSnapshot(next);
      applyShellSnapshot(next);
      // Agent statuses and remote-editable settings (AI helpers) are auxiliary
      // and independent of each other — fetch them concurrently, and never let
      // either failure hide threads. Older desktops without the settings
      // endpoint just fall back to cached values.
      const [statuses, desktopSettings] = await Promise.allSettled([
        client.agentStatuses(),
        client.settings(),
      ]);
      if (statuses.status === "fulfilled") applyAgentStatuses(statuses.value);
      if (desktopSettings.status === "fulfilled") applyDesktopSettings(desktopSettings.value);
      setSelectedThreadId(
        (current) => current ?? sortThreadsByRecency(next.threads)[0]?.id ?? null,
      );
      setConnection("online");
      setMessage("");
      await reloadDesktops(desktop.desktopId);
      const threadId = selectedThreadIdRef.current ?? sortThreadsByRecency(next.threads)[0]?.id;
      if (options.refreshSelectedThread && threadId) {
        await loadThreadSnapshot(threadId, desktop, { preferCache: false });
      }
    } catch (error) {
      setConnection(isUnauthorizedRemoteError(error) ? "unauthorized" : "offline");
      setMessage(error instanceof Error ? error.message : i18n._(msg`Desktop is unreachable.`));
    }
  }

  async function openThread(thread: Thread) {
    setSelectedThreadId(thread.id);
    setThreadSnapshot((current) => (current?.thread.id === thread.id ? current : null));
    const desktop = activeDesktop;
    if (!desktop) return;
    await loadThreadSnapshot(thread.id, desktop, { preferCache: true });
  }

  async function loadThreadSnapshot(
    threadId: string,
    desktop: StoredDesktop,
    options: { readonly preferCache: boolean },
  ) {
    const cached = await getStoredThreadSnapshot(desktop.desktopId, threadId);
    if (options.preferCache && cached) {
      setThreadSnapshot(cached.snapshot);
      applyThreadSnapshot(cached.snapshot);
    }
    try {
      const next = await clientFor(desktop).threadHistory(threadId);
      await saveThreadSnapshot(desktop.desktopId, threadId, next);
      setThreadSnapshot(next);
      applyThreadSnapshot(next);
    } catch (error) {
      setConnection(isUnauthorizedRemoteError(error) ? "unauthorized" : "offline");
      setMessage(error instanceof Error ? error.message : i18n._(msg`Unable to load thread.`));
    }
  }

  /**
   * Mirrors the desktop's `ThreadPane.onSubmitInput`: paint an optimistic
   * user_message for GUI threads (the supervisor reuses the same item id, so
   * the live event dedupes), then forward the prompt.
   */
  async function sendPrompt(prompt: string, segments?: PromptSegment[]) {
    const desktop = activeDesktop;
    const thread = selectedThread;
    if (!desktop || !thread || prompt.length === 0) return;
    const store = useAppStore.getState();
    const presentation = thread.presentationMode ?? "terminal";
    let userMessageItemId: string | undefined;
    let markedWorking = false;
    if (presentation === "gui") {
      userMessageItemId = `user-${crypto.randomUUID()}`;
      store.applyRuntimeEvent(thread.id, {
        type: "item.started",
        threadId: thread.id,
        itemId: userMessageItemId,
        itemType: "user_message",
        payload: { content: buildPromptContentBlocks(prompt, segments) },
      });
      store.applyRuntimeEvent(thread.id, {
        type: "item.completed",
        threadId: thread.id,
        itemId: userMessageItemId,
      });
      store.updateThreadRuntime(thread.id, {
        status: "working",
        attention: "working",
        canResumeWithConfig: thread.canResumeWithConfig,
        ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
      });
      markedWorking = true;
    }
    try {
      await clientFor(desktop).sendThreadInput({
        threadId: thread.id,
        prompt,
        ...(segments ? { segments } : {}),
        config: thread.config,
        ...(userMessageItemId ? { userMessageItemId } : {}),
      });
    } catch (error) {
      if (markedWorking) {
        store.updateThreadRuntime(thread.id, {
          status: thread.status,
          attention: thread.attention,
          canResumeWithConfig: thread.canResumeWithConfig,
          forceCloseActiveTurn: true,
          ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
        });
      }
      throw error;
    }
    store.touchThread(thread.id);
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
        setMessage(
          error instanceof Error ? error.message : i18n._(msg`Couldn't create the worktree.`),
        );
        return null;
      }
    }
    const projectLocation = worktreePath
      ? buildWorktreeLocation(project.location, worktreePath)
      : project.location;
    const result = await clientFor(desktop).startThread({
      projectLocation,
      agentKind: input.agentKind,
      config: input.config,
      prompt: input.prompt,
      ...(input.segments ? { segments: input.segments } : {}),
      presentationMode: input.presentationMode ?? "gui",
    });
    await refresh(desktop);
    // The supervisor launches in the worktree but doesn't record worktree
    // metadata. Tag the new thread (now present after refresh) so it groups
    // under its worktree, matching desktop; for a new worktree this also tells
    // the desktop to prime git + run setup. Non-fatal if it fails.
    if (worktreePath) {
      try {
        await clientFor(desktop).sendThreadCommand({
          kind: "set-worktree",
          threadId: result.threadId,
          worktreePath,
          ...(input.worktreeBranch ? { worktreeBranch: input.worktreeBranch } : {}),
          ...(isNewWorktree ? { isNewWorktree: true } : {}),
        });
        await refresh(desktop);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : i18n._(msg`Couldn't tag the thread's worktree.`),
        );
      }
    }
    setSelectedThreadId(result.threadId);
    void loadThreadSnapshot(result.threadId, desktop, { preferCache: false });
    return result.threadId;
  }

  async function resolveRequest(input: {
    readonly requestId: ThreadServerRequestId;
    readonly method: string;
    readonly response: unknown;
  }) {
    const desktop = activeDesktop;
    if (!desktop || !selectedThread) return;
    await clientFor(desktop).resolveRequest({
      threadId: selectedThread.id,
      requestId: input.requestId,
      method: input.method,
      response: input.response,
    });
    useAppStore.getState().touchThread(selectedThread.id);
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
      setMessage(
        error instanceof Error ? error.message : i18n._(msg`Unable to update the thread.`),
      );
      void refresh(desktop, { refreshSelectedThread: true });
    }
  }

  async function switchDesktop(desktop: StoredDesktop) {
    await setActiveDesktopId(desktop.desktopId);
    setActiveDesktop(desktop.desktopId);
    resetSessionState();
    await loadCached(desktop.desktopId);
    await refresh(desktop);
  }

  async function forget(desktop: StoredDesktop) {
    await forgetDesktop(desktop.desktopId);
    resetSessionState();
    await reloadDesktops();
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
    setReconnectNonce((nonce) => nonce + 1);
    void refresh(activeDesktop, { refreshSelectedThread: true });
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
    sendPrompt,
    interrupt,
    startThread,
    resolveRequest,
    applyThreadAction,
    switchDesktop,
    forget,
    rename,
    reconnect,
  };
}

export type RemoteDesktopSession = ReturnType<typeof useRemoteDesktop>;
