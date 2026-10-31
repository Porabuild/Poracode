import { toast } from "@heroui/react";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ImportableSession, Thread } from "@/shared/contracts";
import { friendlyError, msg as message } from "@/shared/messages";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { useAppStore } from "@/renderer/state/appStore";
import { hostSupportsProjectCommandResultsForConnection } from "@/renderer/state/remote/projectCommandResultsCapability";
import { sendClientProjectCommand } from "@/renderer/state/remoteServers/catalog/clientCatalogCommands";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

/** The host's own threads, which are the only ones that can already hold its sessions. */
export function hostThreads(threads: readonly Thread[], hostKey: string): Thread[] {
  return threads.filter((thread) => thread.remoteServerId === hostKey);
}

/**
 * Imports `sessions` from the host a remote client is bound to. The host
 * registers each session's folder as a project, saves a resumable thread and
 * replays the transcript (`import-session`), so nothing here writes local
 * rows; the host's catalog broadcast brings the threads in.
 */
export async function importSessionsOnHost(input: {
  hostKey: string;
  sessions: readonly ImportableSession[];
  fallbackProjectId?: string;
  findImportedThreadId: (
    session: ImportableSession,
    threads: readonly Thread[],
  ) => string | undefined;
  resolveModel: (session: ImportableSession, projectId: string) => string;
  titleFor: (session: ImportableSession) => string;
}): Promise<{ imported: number; failed: number; threadIds: Map<string, string> }> {
  const { hostKey } = input;
  const store = useRemoteServersStore.getState();
  const threadIds = new Map<string, string>();
  let imported = 0;
  let failed = 0;
  const environment = await store.withClient(hostKey, (client) => client.environment());
  if (!environment.capabilities?.sessionImport?.versions.includes(1)) {
    const server = store.servers.find((entry) => remoteConnectionKey(entry) === hostKey);
    const host = server ? desktopTitle(server.label) : hostKey;
    toast.danger(i18n._(msg`Update ${host} to import its sessions.`));
    return { imported, failed: input.sessions.length, threadIds };
  }
  for (const session of input.sessions) {
    const existing = input.findImportedThreadId(
      session,
      hostThreads(useAppStore.getState().threads, hostKey),
    );
    if (existing) {
      threadIds.set(session.id, existing);
      continue;
    }
    const fallback = useAppStore
      .getState()
      .projects.find(
        (project) => project.id === input.fallbackProjectId && project.remoteServerId === hostKey,
      );
    const hasFolder = !!session.cwd && session.cwdExists;
    const model = input.resolveModel(session, fallback?.id ?? "");
    if ((!fallback && !hasFolder) || !model) {
      failed += 1;
      const agent = session.agentKind;
      toast.danger(
        fallback || hasFolder
          ? i18n._(msg`No model is available for ${agent}. Check the agent in Settings.`)
          : i18n._(msg`Choose a project for sessions whose folder no longer exists.`),
      );
      continue;
    }
    const threadId = crypto.randomUUID();
    try {
      let hostProjectId = fallback?.remoteId;
      if (hasFolder) {
        // The host reconciles registration by location, so a retry after a
        // lost reply finds the same project instead of adding another.
        const response = await store.withClient(hostKey, (client) =>
          sendClientProjectCommand(
            client,
            { kind: "add-existing", path: session.cwd! },
            hostSupportsProjectCommandResultsForConnection(hostKey) ? { result: "bounded" } : {},
          ),
        );
        if (!response.project) throw new Error(message("remote.project.notFound"));
        hostProjectId = response.project.id;
      }
      await store.withClient(hostKey, (client) =>
        client.sendThreadCommand({
          kind: "import-session",
          threadId,
          projectId: hostProjectId!,
          agentKind: session.agentKind,
          model,
          title: input.titleFor(session),
          path: session.path,
          providerSessionId: session.providerSessionId,
        }),
      );
      threadIds.set(session.id, remoteThreadId(hostKey, threadId));
      imported += 1;
    } catch (error) {
      failed += 1;
      toast.danger(friendlyError(error));
    }
  }
  if (imported > 0) await store.refreshServer(hostKey).catch(() => undefined);
  return { imported, failed, threadIds };
}
