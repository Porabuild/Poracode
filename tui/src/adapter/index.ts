import {
  readTuiServers,
  tuiSessionDirectory,
  writeTuiServerSwitch,
  type TuiServerSwitchTarget,
} from "@/shared/tuiServers";
import type { TuiBootstrap } from "../bootstrap";
import {
  connectRemoteSession,
  connectRemoteSocket,
  createRemoteClient,
  hasSavedTuiSession,
} from "./connection";
import {
  createEventTranslator,
  EventStreamHub,
  openCodeEvent,
  type ThreadEventContext,
} from "./events";
import { logAdapterDebug } from "./diagnostics";
import { readGitRoots, resolveLaunchProject } from "./launchProject";
import { createRouter } from "./router";

export async function createAdapter(launchBootstrap: TuiBootstrap) {
  const sessionDirectory = tuiSessionDirectory(launchBootstrap.home, launchBootstrap.server?.id);
  const {
    client,
    dispose: disposeClient,
    socketTls,
  } = launchBootstrap.auth === "session"
    ? await connectRemoteSession(sessionDirectory)
    : await createRemoteClient(launchBootstrap.pairingUrl, sessionDirectory);
  let launch: Awaited<ReturnType<typeof resolveLaunchProject>>;
  try {
    launch = await resolveLaunchProject({
      client,
      directory: launchBootstrap.directory,
      ...(launchBootstrap.projectId ? { projectId: launchBootstrap.projectId } : {}),
      local: launchBootstrap.server === undefined,
      platform: process.platform,
      gitRoots: readGitRoots,
    });
  } catch (error) {
    disposeClient();
    throw error;
  }
  let serverSwitchRequested = false;
  // From here on the adapter's default location is the bound project (or
  // its worktree), which on a remote host is a path on that host.
  const bootstrap: TuiBootstrap = {
    ...launchBootstrap,
    directory: launch.directory,
    projectId: launch.project.id,
  };
  const debug = process.env.PORACODE_TUI_DEBUG === "1";
  const counters = {
    websocketFrames: {} as Record<string, number>,
    remoteEventTypes: {} as Record<string, number>,
    websocketSpaces: {} as Record<string, number>,
    openCodeEventTypes: {} as Record<string, number>,
    sse: {} as Record<string, number>,
    omittedRuntimeThreadIds: 0,
    resyncs: 0,
  };
  const increment = (target: Record<string, number>, key: string) => {
    const safeKey = /^[A-Za-z0-9_.:-]{1,80}$/u.test(key) ? key : "other";
    target[safeKey] = (target[safeKey] ?? 0) + 1;
  };
  const debugInterval = debug
    ? setInterval(() => void logAdapterDebug(bootstrap.home, counters), 5_000)
    : undefined;
  const events = new EventStreamHub(debug ? (event) => increment(counters.sse, event) : undefined);
  const contexts = new Map<string, ThreadEventContext>();
  const translator = createEventTranslator(contexts, (sessionID) =>
    events.nextDurableSequence(sessionID),
  );
  const interests = new Map<string, number>();
  let socket: ReturnType<typeof connectRemoteSocket> | undefined;
  const publishInterests = async (threadIds: readonly string[]) => {
    const now = Date.now();
    for (const threadId of threadIds) interests.set(threadId, now);
    const recent = [...interests.entries()].sort((left, right) => right[1] - left[1]);
    recent.slice(20).forEach(([threadId]) => interests.delete(threadId));
    await socket?.setThreadInterests(recent.slice(0, 20).map(([threadId]) => threadId));
  };
  const translate = (event: unknown) => {
    const translated = translator.translate(event);
    if (debug) translated.forEach((value) => increment(counters.openCodeEventTypes, value.type));
    return translated;
  };
  const router = createRouter({
    bootstrap,
    client,
    events,
    setThreadInterests: publishInterests,
    watchTerminal: (id, onOutput) => socket?.watchTerminal(id, onOutput),
    unwatchTerminal: (id) => socket?.unwatchTerminal(id),
    translate,
    recordPermissionReply: translator.recordPermissionReply,
    recordFormRequest: translator.recordFormRequest,
    forgetFormRequest: translator.forgetFormRequest,
    resetThread: translator.resetThread,
    hasActiveRun: translator.hasActiveRun,
    registerThreadContext: (threadId, context) => contexts.set(threadId, context),
  });
  socket = connectRemoteSocket(
    client,
    (event) => router.handleRemoteEvent(event),
    () => {
      if (debug) counters.resyncs += 1;
      events.resync();
    },
    debug
      ? (frame) => {
          increment(counters.websocketFrames, frame.type);
          if (frame.eventType) increment(counters.remoteEventTypes, frame.eventType);
          if (frame.space) increment(counters.websocketSpaces, frame.space);
          counters.omittedRuntimeThreadIds += frame.omittedRuntimeThreadCount;
        }
      : undefined,
    socketTls,
    (error) =>
      events.emit(
        openCodeEvent("tui.toast.show", { message: error.message, variant: "error" }, {}),
      ),
  );
  const fetch = Object.assign(
    (request: RequestInfo | URL, init?: RequestInit) => router.handle(new Request(request, init)),
    {
      preconnect: (...args: Parameters<typeof globalThis.fetch.preconnect>) =>
        globalThis.fetch.preconnect(...args),
    },
  ) satisfies typeof globalThis.fetch;
  return {
    fetch,
    /** The bound project; `home` when the launch folder belongs to no project. */
    launch,
    /** The paired remote host, or undefined for the local host. */
    server: launchBootstrap.server,
    /** Saved servers the picker offers besides the local host. */
    savedServers: () =>
      readTuiServers(launchBootstrap.home).map((server) => ({
        ...server,
        signedIn: hasSavedTuiSession(tuiSessionDirectory(launchBootstrap.home, server.id)),
      })),
    /** Records the picker's target; the TUI then exits for the CLI to relaunch. */
    requestServerSwitch(target: TuiServerSwitchTarget) {
      writeTuiServerSwitch(launchBootstrap.home, target);
      serverSwitchRequested = true;
    },
    get serverSwitchRequested() {
      return serverSwitchRequested;
    },
    sessionOptions: router.sessionOptions,
    setSessionOptions: router.setSessionOptions,
    exportSession: router.exportSession,
    offeredProviders: router.offeredProviders,
    threadFlags: router.threadFlags,
    setStarred: router.setStarred,
    setDone: router.setDone,
    resumeQueue: router.resumeQueue,
    goalState: router.goalState,
    controlGoal: router.controlGoal,
    subscribeGoal: router.subscribeGoal,
    goalLine: router.goalLine,
    goalSupported: router.goalSupported,
    sendPrompt: router.sendPrompt,
    sessionActions: router.sessionActions,
    invokeSessionAction: router.invokeSessionAction,
    archivedThreads: router.archivedThreads,
    providerUsage: router.providerUsage,
    startSideChat: router.startSideChat,
    loginCandidates: router.loginCandidates,
    crewState: router.crewState,
    updateCrew: router.updateCrew,
    startNewCrew: router.startNewCrew,
    setCrewLead: router.setCrewLead,
    saveCrew: router.saveCrew,
    crewLine: router.crewLine,
    crewSidebar: router.crewSidebar,
    subscribeCrew: router.subscribeCrew,
    async dispose() {
      router.disposeSubagentSubscriptions();
      router.disposeStatusPolling();
      socket?.dispose();
      events.dispose();
      if (debugInterval) clearInterval(debugInterval);
      disposeClient();
      if (debug) await logAdapterDebug(bootstrap.home, counters);
    },
  };
}

export type Adapter = Awaited<ReturnType<typeof createAdapter>>;
