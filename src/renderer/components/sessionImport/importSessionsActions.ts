import { toast } from "@heroui/react";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ImportableSession, ProjectLocation } from "@/shared/contracts";
import { importedSessionProviderForAgentKind } from "@/shared/contracts";
import { resolveModelSelection } from "@/shared/agentSelection";
import { isWindows, readBridge } from "@/renderer/bridge";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { rehydrateThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";
import { getActiveWorkspaceId } from "@/renderer/state/workspaceStore";
import { getSessionImportInfo } from "./providerInfo";

/** Title lines stay short enough to read in the sidebar. */
const TITLE_MAX_CHARS = 60;

/** The provider's own name for the chat when it has one, else its first prompt. */
function titleFor(session: ImportableSession): string {
  const title = (session.title ?? session.preview).trim();
  if (title.length === 0) return i18n._(msg`Imported session`);
  return title.length > TITLE_MAX_CHARS ? `${title.slice(0, TITLE_MAX_CHARS)}…` : title;
}

/**
 * Last resort when neither the project nor detection knows a model. The
 * composer lets the user change it, but a thread cannot be persisted without
 * one: `persistedThreadSchema` requires a non-empty model, and a single
 * invalid thread in the store would fail the whole `dbSyncAll` batch.
 */

/**
 * Model for the imported thread: the model the session itself was held with,
 * when the target account still advertises it; else the project's last draft
 * when it was for this same agent; else the agent's first advertised model;
 * else a fallback.
 *
 * The session's own model wins over the project's last draft — a conversation
 * resumed on a different model is worse than a project preference ignored.
 * `resolveModelSelection` returns the preferred model only when the account's
 * capability list actually contains it, so an account without that model (or
 * a stale capability list) falls through to the chain below unchanged.
 */
export function resolveImportModel(
  session: ImportableSession,
  projectId: string,
  agentKind: string = session.agentKind,
): string {
  const status = useAgentStatusesStore
    .getState()
    .agentStatuses.find((entry) => entry.kind === agentKind);
  if (
    session.model &&
    status &&
    resolveModelSelection(status.capabilities, session.model) === session.model
  ) {
    return session.model;
  }
  const project = useAppStore.getState().projects.find((entry) => entry.id === projectId);
  const draft = project?.lastDraftConfig;
  if (draft && draft.agentKind === agentKind && draft.model) return draft.model;
  const detected = status ? resolveModelSelection(status.capabilities) : "";
  return (
    detected || getSessionImportInfo(session.provider)?.fallbackModel || session.model || "default"
  );
}

/**
 * Agent kind an imported thread runs under. The panel's target account only
 * applies to sessions of its own provider — a Codex profile cannot take a
 * Claude log — so every other session stays with the account it came from.
 */
export function resolveImportAgentKind(
  session: ImportableSession,
  targetAgentKind?: string,
): string {
  if (
    targetAgentKind &&
    getSessionImportInfo(targetAgentKind) &&
    importedSessionProviderForAgentKind(targetAgentKind) === session.provider
  ) {
    return targetAgentKind;
  }
  return session.agentKind;
}

function hostLocation(path: string): ProjectLocation {
  // The renderer has no `process`; the bridge reports the host platform.
  return isWindows() ? { kind: "windows", path } : { kind: "posix", path };
}

/**
 * The project an imported thread belongs in. A session records the folder it
 * ran in, so the natural home is the project for that folder: reuse it when
 * Poracode already has it, create it when the folder still exists on disk.
 * `addProjectWithResult` dedupes by project identity, so a repeat import is a
 * lookup, not a second row. A new project joins the workspace the user is
 * currently looking at — an unfiled project would otherwise appear in all of
 * them.
 *
 * A session whose folder is gone (repo deleted or moved) creates nothing and
 * falls back to the project the user picked in the panel.
 */
export function resolveImportProjectId(
  session: ImportableSession,
  fallbackProjectId?: string,
): { projectId: string | undefined; created: boolean } {
  if (session.cwd && session.cwdExists) {
    const { project, created } = useAppStore
      .getState()
      .addProjectWithResult(
        hostLocation(session.cwd),
        undefined,
        getActiveWorkspaceId() ?? undefined,
      );
    return { projectId: project.id, created };
  }
  return { projectId: fallbackProjectId, created: false };
}

/**
 * Create one thread per selected session and replay its transcript. The thread
 * is created through the store's normal path, so persistence and the sidebar
 * behave exactly as they do for a thread the user started — and the app can
 * stay open while this runs.
 */
export async function importSessions(input: {
  sessions: readonly ImportableSession[];
  fallbackProjectId?: string;
  /** Account to import into; sessions of another provider keep their own. */
  targetAgentKind?: string;
}): Promise<{
  imported: number;
  failed: number;
  /** Sessions another thread already held; nothing was replayed for these. */
  alreadyImported: number;
  threadIds: Map<string, string>;
}> {
  const store = useAppStore.getState();
  let imported = 0;
  let failed = 0;
  let alreadyImported = 0;
  /** Session id → thread id, for every session that made it through. */
  const threadIds = new Map<string, string>();

  for (const session of input.sessions) {
    let threadId: string | undefined;
    let projectCreated = false;
    let projectId: string | undefined;
    try {
      const resolved = resolveImportProjectId(session, input.fallbackProjectId);
      projectId = resolved.projectId;
      projectCreated = resolved.created;
      if (!projectId) {
        failed += 1;
        toast.danger(i18n._(msg`No project to import into — pick one for ${session.preview}.`));
        continue;
      }
      const agentKind = resolveImportAgentKind(session, input.targetAgentKind);
      const config = {
        model: resolveImportModel(session, projectId, agentKind),
        importedFrom: {
          provider: session.provider,
          path: session.path,
          importedAt: new Date().toISOString(),
        },
      };
      const thread = store.createThread({
        projectId,
        agentKind,
        config,
        prompt: "",
        title: titleFor(session),
        // The replayed transcript lives in runtime items, which only the chat
        // pane renders; a terminal thread would open on an empty PTY.
        presentationMode: "gui",
        focus: false,
      });
      threadId = thread.id;
      store.updateThreadRuntime(thread.id, {
        status: "idle",
        attention: "none",
        // The imported config is a placeholder until the first launch picks
        // the provider's defaults, so it cannot be replayed as-is.
        canResumeWithConfig: false,
        sessionRef: {
          providerSessionId: session.providerSessionId,
          discoveredAt: new Date().toISOString(),
        },
      });
      const { path: resumePath, existingThreadId } = await readBridge().importSessionTranscript({
        threadId: thread.id,
        provider: session.provider,
        path: session.path,
        // The account's home needs its own copy of the transcript before it
        // can resume the session; main skips the copy when it already has it.
        targetAgentKind: agentKind,
      });
      if (existingThreadId) {
        // Another thread already holds this session and nothing was replayed
        // into the one just created — drop it rather than leave an empty
        // duplicate, and point the list at the thread that does hold it.
        store.deleteThread(thread.id);
        threadId = undefined;
        if (projectCreated && projectId) store.deleteProject(projectId);
        threadIds.set(session.id, existingThreadId);
        alreadyImported += 1;
        continue;
      }
      // Importing under another account can copy the transcript into that
      // account's home; the thread must resume the copy it actually holds,
      // not the original it was imported from. Replaying a large transcript
      // takes time, and the user could open this thread and change its
      // config (e.g. the model) during the await above; `updateThreadConfig`
      // replaces the whole config, so merge onto the *live* config read right
      // now, not the snapshot captured before the await, or a concurrent edit
      // would be silently discarded.
      if (resumePath !== session.path) {
        const liveConfig =
          useAppStore.getState().threads.find((entry) => entry.id === thread.id)?.config ?? config;
        store.updateThreadConfig(thread.id, {
          ...liveConfig,
          importedFrom: { ...(liveConfig.importedFrom ?? config.importedFrom), path: resumePath },
        });
      }
      // The replay wrote straight to SQLite; a pane opened meanwhile hydrated
      // an empty transcript and has to read it again.
      await rehydrateThreadRuntimeItems(thread.id);
      threadIds.set(session.id, thread.id);
      imported += 1;
    } catch (error) {
      // A thread without its transcript is worse than no thread: drop the
      // half-built row so a retry does not leave duplicates behind.
      if (threadId) store.deleteThread(threadId);
      // Only remove a project this import created for itself, and only once
      // its thread is gone too — an existing project the import merely
      // reused must survive a failed import.
      if (projectCreated && projectId) store.deleteProject(projectId);
      failed += 1;
      toast.danger(
        error instanceof Error ? error.message : i18n._(msg`Could not import ${session.preview}.`),
      );
    }
  }
  return { imported, failed, alreadyImported, threadIds };
}
