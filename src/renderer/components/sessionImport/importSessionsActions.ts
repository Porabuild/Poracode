import { toast } from "@heroui/react";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ImportableSession, ProjectLocation, Thread } from "@/shared/contracts";
import { resolveModelSelection } from "@/shared/agentSelection";
import { friendlyError } from "@/shared/messages";
import { isWindows, readBridge } from "@/renderer/bridge";
import { resolveSavedProviderDraftConfig } from "@/renderer/components/thread/threadDraftViewHelpers";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { getActiveWorkspaceId } from "@/renderer/state/workspaceStore";

const TITLE_MAX_CHARS = 60;

/** Thread already holding this session: a previous import, or one Poracode started. */
export function findImportedThreadId(
  session: ImportableSession,
  threads: readonly Thread[],
): string | undefined {
  return threads.find(
    (thread) =>
      thread.config.importedFrom?.path === session.path ||
      (thread.agentKind === session.agentKind &&
        thread.sessionRef?.providerSessionId === session.providerSessionId),
  )?.id;
}

function titleFor(session: ImportableSession): string {
  const title = (session.title ?? session.preview).trim();
  if (!title) return i18n._(msg`Imported session`);
  return title.length > TITLE_MAX_CHARS ? `${title.slice(0, TITLE_MAX_CHARS)}…` : title;
}

/**
 * The session's own model when the agent still offers it, else the provider
 * default a new draft would get (saved draft/provider config, then the first
 * detected model).
 */
export function resolveImportModel(session: ImportableSession, projectId: string): string {
  const status = useAgentStatusesStore
    .getState()
    .agentStatuses.find((entry) => entry.kind === session.agentKind);
  const offers = (model: string | undefined): model is string =>
    !!model && !!status && resolveModelSelection(status.capabilities, model) === model;
  if (offers(session.model)) return session.model;
  const project = useAppStore.getState().projects.find((entry) => entry.id === projectId);
  const saved = resolveSavedProviderDraftConfig(
    session.agentKind,
    project?.lastDraftConfig,
    useSharedSettings.getState().providerConfigs,
  )?.model;
  if (offers(saved)) return saved;
  return (status ? resolveModelSelection(status.capabilities) : "") || session.model || "";
}

function resolveImportProject(
  session: ImportableSession,
  fallbackProjectId: string | undefined,
): { projectId: string | undefined; created: boolean } {
  if (!session.cwd || !session.cwdExists) return { projectId: fallbackProjectId, created: false };
  const location: ProjectLocation = isWindows()
    ? { kind: "windows", path: session.cwd }
    : { kind: "posix", path: session.cwd };
  const { project, created } = useAppStore
    .getState()
    .addProjectWithResult(location, undefined, getActiveWorkspaceId() ?? undefined);
  return { projectId: project.id, created };
}

/**
 * One inactive GUI thread per session, stamped with the provider session so
 * opening it resumes through the normal reopen path; the supervisor replays
 * the transcript into it. Returns session id → thread id for every session
 * that now has a thread.
 */
export async function importSessions(input: {
  sessions: readonly ImportableSession[];
  fallbackProjectId?: string;
}): Promise<{ imported: number; failed: number; threadIds: Map<string, string> }> {
  const store = useAppStore.getState();
  const threadIds = new Map<string, string>();
  let imported = 0;
  let failed = 0;
  for (const session of input.sessions) {
    const existing = findImportedThreadId(session, useAppStore.getState().threads);
    if (existing) {
      threadIds.set(session.id, existing);
      continue;
    }
    const { projectId, created } = resolveImportProject(session, input.fallbackProjectId);
    const model = projectId ? resolveImportModel(session, projectId) : "";
    const agent = session.agentKind;
    if (!projectId || !model) {
      failed += 1;
      toast.danger(
        projectId
          ? i18n._(msg`No model is available for ${agent}. Check the agent in Settings.`)
          : i18n._(msg`Choose a project for sessions whose folder no longer exists.`),
      );
      if (created && projectId) store.deleteProject(projectId);
      continue;
    }
    const thread = store.createThread({
      projectId,
      agentKind: session.agentKind,
      config: { model, importedFrom: { path: session.path, importedAt: new Date().toISOString() } },
      prompt: "",
      title: titleFor(session),
      presentationMode: "gui",
      focus: false,
    });
    store.updateThreadRuntime(thread.id, {
      status: "inactive",
      attention: "none",
      canResumeWithConfig: true,
      forceCloseActiveTurn: true,
      sessionRef: {
        providerSessionId: session.providerSessionId,
        discoveredAt: new Date().toISOString(),
      },
    });
    try {
      await readBridge().importSessionTranscript({
        threadId: thread.id,
        agentKind: session.agentKind,
        path: session.path,
        providerSessionId: session.providerSessionId,
      });
      threadIds.set(session.id, thread.id);
      imported += 1;
    } catch (error) {
      store.deleteThread(thread.id);
      if (created) store.deleteProject(projectId);
      failed += 1;
      toast.danger(friendlyError(error));
    }
  }
  return { imported, failed, threadIds };
}
