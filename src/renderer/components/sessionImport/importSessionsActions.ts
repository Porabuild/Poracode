import { toast } from "@heroui/react";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ImportableSession, ProjectLocation, Thread } from "@/shared/contracts";
import { resolveModelSelection } from "@/shared/agentSelection";
import { friendlyError, msg as message } from "@/shared/messages";
import { projectLocationKey } from "@/shared/projectIdentity";
import { RemoteClientError, remoteMutationMayHaveCommitted } from "@/shared/remote/client";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { resolveSavedProviderDraftConfig } from "@/renderer/components/thread/threadDraftViewHelpers";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { hostHandle, type EntityHost } from "@/renderer/state/entityHost";
import { managedRootOfflineError } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import { currentProjectIdentityOptions } from "@/renderer/state/projectReferences";
import { environmentAdvertisesProjectCommandResults } from "@/renderer/state/remote/projectCommandResultsCapability";
import { sendClientProjectCommand } from "@/renderer/state/remoteServers/catalog/clientCatalogCommands";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { localEnvLabel } from "@/renderer/utils/machineLabels";

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

/** The host's own threads: the only ones that can already hold its sessions. */
export function hostThreads(
  threads: readonly Thread[],
  connectionKey: string | undefined,
): Thread[] {
  return threads.filter((thread) => thread.remoteServerId === connectionKey);
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

/** A session's cwd is a path on the host that owns it; its shape names the location kind. */
function locationForCwd(cwd: string): ProjectLocation {
  return /^(?:[A-Za-z]:[\\/]|\\\\)/u.test(cwd)
    ? { kind: "windows", path: cwd }
    : { kind: "posix", path: cwd };
}

/**
 * The host's registered project for a session's folder, else the chosen
 * fallback: the project whose saved draft config picks the import model.
 */
function resolveImportProjectId(
  session: ImportableSession,
  fallbackProjectId: string | undefined,
  connectionKey: string | undefined,
): string | undefined {
  const projects = useAppStore
    .getState()
    .projects.filter((project) => project.remoteServerId === connectionKey);
  if (session.cwd && session.cwdExists) {
    const options = currentProjectIdentityOptions();
    const key = projectLocationKey(locationForCwd(session.cwd), options);
    const registered = projects.find(
      (project) => projectLocationKey(project.location, options) === key,
    );
    if (registered) return registered.id;
  }
  return projects.find((project) => project.id === fallbackProjectId)?.id;
}

function hostLabel(host: EntityHost): string {
  if (host.connectionKey === undefined) return localEnvLabel({ kind: "native" });
  const server = useRemoteServersStore
    .getState()
    .servers.find((entry) => remoteConnectionKey(entry) === host.connectionKey);
  return server ? desktopTitle(server.label) : host.connectionKey;
}

function updateHostToImportMessage(entityHost: EntityHost): string {
  const host = hostLabel(entityHost);
  return i18n._(msg`Update ${host} to import its sessions.`);
}

/**
 * Imports of one session that are still running, so an overlapping request
 * for the same session joins it instead of asking the host for a second thread.
 */
const importsInFlight = new Map<string, Promise<string | undefined>>();
/**
 * Thread ids whose import ended without a confirmed outcome. The host may
 * already hold the row, so a retry reuses the id: the host answers
 * `thread_already_exists` instead of importing the session twice.
 */
const uncertainThreadIds = new Map<string, string>();

/**
 * One inactive GUI thread per session, created by the host that owns the
 * session store: the host registers the session's folder as a project, saves a
 * resumable thread and replays the transcript (`import-session`). The same
 * host commands serve the desktop's managed host and a paired host; nothing
 * here writes rows, the host's catalog brings the threads in. Returns session
 * id to thread id for every session that now has a thread.
 */
export async function importSessions(input: {
  sessions: readonly ImportableSession[];
  fallbackProjectId?: string;
  /** A paired host's connection key. Omitted for the desktop's managed host. */
  hostKey?: string;
}): Promise<{ imported: number; failed: number; threadIds: Map<string, string> }> {
  const threadIds = new Map<string, string>();
  const host = hostHandle(input.hostKey);
  let environment;
  try {
    if (!host) throw managedRootOfflineError();
    environment = await host.withClient((client) => client.environment());
  } catch (error) {
    toast.danger(friendlyError(error));
    return { imported: 0, failed: input.sessions.length, threadIds };
  }
  if (!environment.capabilities?.sessionImport?.versions.includes(1)) {
    toast.danger(updateHostToImportMessage(host));
    return { imported: 0, failed: input.sessions.length, threadIds };
  }
  // The descriptor that proved the import capability also says whether this
  // host answers a project registration with the bounded result.
  const resultMode = environmentAdvertisesProjectCommandResults(environment)
    ? { result: "bounded" as const }
    : {};
  let imported = 0;
  let failed = 0;
  for (const session of input.sessions) {
    const claimKey = `${host.connectionKey ?? ""}\u0000${session.path}`;
    // Join an import of this session already under way: its thread is the
    // answer, unless it failed, in which case this request tries for itself.
    const running = importsInFlight.get(claimKey);
    const joined = running ? await running : undefined;
    if (joined !== undefined) {
      threadIds.set(session.id, host.projectThreadRow(joined).threadId);
      continue;
    }
    const existing = findImportedThreadId(
      session,
      hostThreads(useAppStore.getState().threads, host.connectionKey),
    );
    if (existing) {
      threadIds.set(session.id, existing);
      continue;
    }
    const projectId = resolveImportProjectId(session, input.fallbackProjectId, host.connectionKey);
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
    const attempt = importSessionOnHost(host, session, {
      claimKey,
      model,
      resultMode,
      hostProjectId: projectId ? host.hostProjectId(projectId) : undefined,
    });
    importsInFlight.set(claimKey, attempt);
    try {
      const threadId = await attempt;
      if (threadId === undefined) {
        failed += 1;
        continue;
      }
      threadIds.set(session.id, host.projectThreadRow(threadId).threadId);
      imported += 1;
    } finally {
      importsInFlight.delete(claimKey);
    }
  }
  if (imported > 0) host.refreshCatalog();
  return { imported, failed, threadIds };
}

/** The host's thread id once it holds the session; `undefined` after a reported failure. */
async function importSessionOnHost(
  host: EntityHost,
  session: ImportableSession,
  options: {
    claimKey: string;
    model: string;
    resultMode: { result?: "bounded" };
    hostProjectId: string | undefined;
  },
): Promise<string | undefined> {
  const threadId = uncertainThreadIds.get(options.claimKey) ?? crypto.randomUUID();
  try {
    let hostProjectId = options.hostProjectId;
    if (session.cwd && session.cwdExists) {
      // The host reconciles registration by location, so a retry after a lost
      // reply finds the same project instead of adding another.
      const response = await host.withClient((client) =>
        sendClientProjectCommand(
          client,
          { kind: "add-existing", path: session.cwd! },
          options.resultMode,
        ),
      );
      if (!response.project) throw new Error(message("remote.project.notFound"));
      hostProjectId = response.project.id;
    }
    await host.withClient((client) =>
      client.sendThreadCommand({
        kind: "import-session",
        threadId,
        projectId: hostProjectId!,
        agentKind: session.agentKind,
        model: options.model,
        title: titleFor(session),
        path: session.path,
        providerSessionId: session.providerSessionId,
      }),
    );
    uncertainThreadIds.delete(options.claimKey);
    return threadId;
  } catch (error) {
    if (
      error instanceof RemoteClientError &&
      error.code === "thread_already_exists" &&
      uncertainThreadIds.has(options.claimKey)
    ) {
      // An earlier attempt of this same import did reach the host.
      uncertainThreadIds.delete(options.claimKey);
      return threadId;
    }
    if (remoteMutationMayHaveCommitted(error)) uncertainThreadIds.set(options.claimKey, threadId);
    else uncertainThreadIds.delete(options.claimKey);
    toast.danger(friendlyError(error));
    return undefined;
  }
}
