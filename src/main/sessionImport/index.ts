import type {
  ImportSessionTranscriptPayload,
  ImportSessionTranscriptResult,
  ListImportableSessionsPayload,
  ListImportableSessionsResult,
  RuntimeEvent,
  Thread,
} from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { getSessionImportProvider } from "./providers";
import { copySessionIntoHome } from "./copy";
import { resolveImportHomes } from "./homes";
import { replayTranscript } from "./replay";
import { scanImportableSessions } from "./scan";

export interface SessionImportDeps {
  readSharedSettings: () => SharedSettings;
  getThreads: () => readonly Thread[];
  applyRuntimeEvents: (threadId: string, events: readonly RuntimeEvent[]) => void;
  flushRuntimeWrites: (threadId: string) => void;
}

/**
 * Which sessions a thread already covers. Keyed on both the transcript path
 * and the provider session id: the first catches a repeat import, the second
 * catches a session Poracode itself started, which is already a live thread
 * and would otherwise be offered as if it were history.
 */
function importedThreads(threads: readonly Thread[]): {
  byPath: Map<string, string>;
  bySessionId: Map<string, string>;
} {
  const byPath = new Map<string, string>();
  const bySessionId = new Map<string, string>();
  for (const thread of threads) {
    const imported = thread.config.importedFrom;
    if (imported && !byPath.has(imported.path)) byPath.set(imported.path, thread.id);
    const sessionId = thread.sessionRef?.providerSessionId;
    if (sessionId && !bySessionId.has(sessionId)) bySessionId.set(sessionId, thread.id);
  }
  return { byPath, bySessionId };
}

export function listImportableSessions(
  payload: ListImportableSessionsPayload,
  deps: SessionImportDeps,
): ListImportableSessionsResult {
  const homes = resolveImportHomes(deps.readSharedSettings());
  const { sessions, facets, truncated } = scanImportableSessions({
    homes,
    ...(payload.cwd ? { cwd: payload.cwd } : {}),
    ...(payload.provider ? { provider: payload.provider } : {}),
    ...(payload.agentKind ? { agentKind: payload.agentKind } : {}),
    ...(payload.query ? { query: payload.query } : {}),
  });
  const { byPath, bySessionId } = importedThreads(deps.getThreads());
  return {
    sessions: sessions.map((session) => {
      const threadId = byPath.get(session.path) ?? bySessionId.get(session.providerSessionId);
      return threadId ? { ...session, importedThreadId: threadId } : session;
    }),
    facets,
    truncated,
  };
}

/**
 * Every session an import in this process is holding, and the thread holding
 * it, keyed by transcript path and by provider session id.
 *
 * `deps.getThreads()` is the database's view of that question, and the
 * renderer stamps a newly created thread with the path and session id
 * asynchronously — so two windows importing the same session within the same
 * moment can both look at that view and both see the session free, and end up
 * with two threads resuming one provider session. Main sees every import, in
 * order, so it can answer what the database cannot yet.
 *
 * A claim is never more than a stand-in for a stamp that has not landed. It
 * lasts exactly as long as the thread that took it: released in a `finally`
 * when the import threw, and dropped once that thread is no longer in the
 * database. Held any longer, importing a session, deleting its thread and
 * importing again would be refused for the life of the main process, in the
 * name of a thread the user cannot open — and the map would grow by two
 * entries per import and never shrink.
 */
const claimedSessions = new Map<string, string>();

/**
 * Forget every claim whose thread is gone. A deleted thread releases the
 * session it held; a thread that is merely unstamped is still in the
 * database, so the claim that speaks for it survives.
 */
function dropClaimsOfDeletedThreads(threads: readonly Thread[]): void {
  if (claimedSessions.size === 0) return;
  const live = new Set(threads.map((thread) => thread.id));
  for (const [claim, holder] of claimedSessions) {
    if (!live.has(holder)) claimedSessions.delete(claim);
  }
}

/**
 * Test seam. The map above is module state shared by every test in a file, so
 * a test that leaves a claim behind would change what a later one sees.
 */
export function resetImportClaims(): void {
  claimedSessions.clear();
}

function sessionClaimKeys(path: string, providerSessionId?: string): string[] {
  return [`path:${path}`, ...(providerSessionId ? [`session:${providerSessionId}`] : [])];
}

export function importSessionTranscript(
  payload: ImportSessionTranscriptPayload,
  deps: SessionImportDeps,
): ImportSessionTranscriptResult {
  const threads = deps.getThreads();
  const currentThread = threads.find((thread) => thread.id === payload.threadId);
  if (!currentThread) {
    throw new Error(`Cannot import into unknown thread ${payload.threadId}.`);
  }
  // The renderer already stamps this thread with the target path and session
  // id before calling in, so it would otherwise match against itself: exclude
  // it before checking whether another thread already holds this session.
  const { byPath, bySessionId } = importedThreads(
    threads.filter((thread) => thread.id !== payload.threadId),
  );
  dropClaimsOfDeletedThreads(threads);
  const sessionId = currentThread.sessionRef?.providerSessionId;
  const claims = sessionClaimKeys(payload.path, sessionId);
  const claimedBy = claims
    .map((claim) => claimedSessions.get(claim))
    .find((holder) => holder !== undefined && holder !== payload.threadId);
  const existingThreadId =
    claimedBy ?? byPath.get(payload.path) ?? (sessionId ? bySessionId.get(sessionId) : undefined);
  if (existingThreadId) {
    // Nothing is replayed and nothing is claimed: the caller rolls its own
    // thread back and points the user at the one that already holds this
    // session. Throwing here made the two-window race lose both threads.
    return { messageCount: 0, path: payload.path, existingThreadId };
  }
  for (const claim of claims) claimedSessions.set(claim, payload.threadId);
  let imported = false;
  try {
    // Copy before replaying: a failed copy leaves the thread empty, which the
    // renderer rolls back; a replayed thread whose provider cannot resume it
    // would look imported and silently start over on the first message.
    const path = payload.targetAgentKind
      ? copySessionIntoHome({
          provider: payload.provider,
          path: payload.path,
          homes: resolveImportHomes(deps.readSharedSettings()),
          targetAgentKind: payload.targetAgentKind,
        })
      : payload.path;
    const transcript = getSessionImportProvider(payload.provider).parseTranscript(path);
    // The thread carries the session id the *scan* reported for this path.
    // Nothing has re-checked that the file is still that session: a transcript
    // replaced between the scan and now would be replayed into a thread that
    // goes on resuming a different conversation entirely. Better to send the
    // user back to a rescan than to build that thread.
    if (sessionId && transcript.providerSessionId && transcript.providerSessionId !== sessionId) {
      throw new Error(`Session at ${payload.path} changed on disk — rescan and try again.`);
    }
    const messageCount = replayTranscript({
      threadId: payload.threadId,
      transcript,
      apply: deps.applyRuntimeEvents,
      flush: deps.flushRuntimeWrites,
    });
    imported = true;
    return { messageCount, path };
  } finally {
    if (!imported) for (const claim of claims) claimedSessions.delete(claim);
  }
}
