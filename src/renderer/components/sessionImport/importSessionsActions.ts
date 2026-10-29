import { toast } from "@heroui/react";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ImportableSession, ProjectLocation, Thread } from "@/shared/contracts";
import { resolveModelSelection } from "@/shared/agentSelection";
import { friendlyError, msg as message } from "@/shared/messages";
import { isWindows, readBridge } from "@/renderer/bridge";
import { resolveSavedProviderDraftConfig } from "@/renderer/components/thread/threadDraftViewHelpers";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { sendManagedRootProjectCommand } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import { applyRootCatalogProjectRows } from "@/renderer/state/managedRootCatalog/rootCatalogRows";
import { projectLocationKey } from "@/shared/projectIdentity";
import { currentProjectIdentityOptions } from "@/renderer/state/projectReferences";
import {
  dropPendingManagedRootLaunch,
  pinManagedRootThread,
} from "@/renderer/state/managedRootCatalog/rootCatalogStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

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
    !!model && !!status && status.capabilities.models.some((entry) => entry.id === model);
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
): string | undefined {
  if (!session.cwd || !session.cwdExists) return fallbackProjectId;
  const location: ProjectLocation = isWindows()
    ? { kind: "windows", path: session.cwd }
    : { kind: "posix", path: session.cwd };
  const options = currentProjectIdentityOptions();
  return useAppStore
    .getState()
    .projects.find(
      (project) =>
        !project.remoteServerId &&
        projectLocationKey(project.location, options) === projectLocationKey(location, options),
    )?.id;
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
    let projectId = resolveImportProject(session, input.fallbackProjectId);
    const hasFolder = !!session.cwd && session.cwdExists;
    const model = resolveImportModel(session, projectId ?? "");
    const agent = session.agentKind;
    if ((!projectId && !hasFolder) || !model) {
      failed += 1;
      toast.danger(
        projectId || hasFolder
          ? i18n._(msg`No model is available for ${agent}. Check the agent in Settings.`)
          : i18n._(msg`Choose a project for sessions whose folder no longer exists.`),
      );
      continue;
    }
    if (hasFolder) {
      try {
        // Registration is owned by the host and reconciles by location. Omitting
        // metadata makes retries safe after a lost reply or another client's edit.
        const response = await sendManagedRootProjectCommand({
          kind: "add-existing",
          path: session.cwd!,
        });
        if (!response.project) throw new Error(message("remote.project.notFound"));
        applyRootCatalogProjectRows([response.project]);
        projectId = response.project.id;
      } catch (error) {
        failed += 1;
        toast.danger(friendlyError(error));
        continue;
      }
    }
    // Registration may have yielded while another import claimed this session.
    const claimed = findImportedThreadId(session, useAppStore.getState().threads);
    if (claimed) {
      threadIds.set(session.id, claimed);
      continue;
    }
    const thread = store.createThread({
      projectId: projectId!,
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
    const release = pinManagedRootThread(thread.id);
    const bridge = readBridge();
    let publicationAttempted = false;
    try {
      // App-store persistence owns UI preferences, not host catalog rows.
      // Save the resumable row before replay so success survives a reload and
      // runtime events always have a durable thread to belong to.
      const resumable = useAppStore.getState().threads.find((entry) => entry.id === thread.id)!;
      publicationAttempted = true;
      await bridge.dbUpsertThread(resumable);
      // Its next open must resume this session, not create and launch a new one.
      dropPendingManagedRootLaunch(thread.id);
      await bridge.importSessionTranscript({
        threadId: thread.id,
        agentKind: session.agentKind,
        path: session.path,
        providerSessionId: session.providerSessionId,
      });
      threadIds.set(session.id, thread.id);
      imported += 1;
    } catch (error) {
      failed += 1;
      toast.danger(friendlyError(error));
      // Once publication has been attempted, another client may use the project.
      // Deleting it would cascade that client's threads, so roll back only ours.
      try {
        if (publicationAttempted) await bridge.dbDeleteThread(thread.id);
        store.deleteThread(thread.id);
      } catch (rollbackError) {
        // Keep the possibly durable row visible, and let the batch continue.
        toast.danger(friendlyError(rollbackError));
      }
    } finally {
      dropPendingManagedRootLaunch(thread.id);
      release();
    }
  }
  return { imported, failed, threadIds };
}
