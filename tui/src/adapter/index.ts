import type { TuiBootstrap } from "../bootstrap";
import { connectRemoteSession, connectRemoteSocket, createRemoteClient } from "./connection";
import {
  createEventTranslator,
  EventStreamHub,
  openCodeEvent,
  type ThreadEventContext,
} from "./events";
import { logAdapterDebug } from "./diagnostics";
import { createRouter } from "./router";

export async function createAdapter(bootstrap: TuiBootstrap) {
  const {
    client,
    dispose: disposeClient,
    socketTls,
  } = bootstrap.auth === "session"
    ? await connectRemoteSession(bootstrap.home)
    : await createRemoteClient(bootstrap.pairingUrl, bootstrap.home);
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
