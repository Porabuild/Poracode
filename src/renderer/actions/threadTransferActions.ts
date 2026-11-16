import { msg } from "@lingui/core/macro";
import { base64ToUint8Array } from "@/shared/base64";
import type { AgentStatus, Project, Thread, ThreadConfig } from "@/shared/contracts";
import { remoteMutationMayHaveCommitted } from "@/shared/remote/client";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import {
  authStateForPresentation,
  capabilitiesForPresentation,
  resolveModelSelection,
} from "@/shared/agentSelection";
import { supportsPresentation } from "@/shared/continueProviderRanking";
import {
  THREAD_TRANSFER_CHUNK_MAX_BYTES,
  THREAD_TRANSFER_VERSION,
  type ThreadTransferPlanProject,
  type ThreadTransferSource,
} from "@/shared/threadTransfer";
import { friendlyError } from "@/shared/messages";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { entityHost, hostHandle, type EntityHost } from "@/renderer/state/entityHost";
import {
  environmentParentRef,
  remoteConnectionKey,
  type RemoteServersState,
} from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { readProjectEnvironmentLabel } from "@/renderer/state/projectGroups/environmentLabels";
import { localEnvLabel } from "@/renderer/utils/machineLabels";
import { archiveThread, openThread } from "./threadActions";
import { submitThreadInput } from "./threadRuntimeActions";

/**
 * "Move to another machine": this client drives a thread transfer between two
 * hosts it holds grants for (see `src/shared/threadTransfer.ts`). Each host
 * stays the only writer of its own data — the source packages, the target
 * saves — and bytes pass through this client in bounded chunks.
 */

/** A host a thread can move to. `key` is a paired connection key; undefined is this desktop's host. */
export interface ThreadTransferTarget {
  readonly key: string | undefined;
  readonly label: string;
  readonly online: boolean;
  /**
   * An environment whose parent is this desktop's own host: clients reach it
   * only through this computer, so it is unreachable while this computer is off.
   */
  readonly viaThisComputer?: boolean;
}

export interface ThreadTransferPreview {
  readonly source: ThreadTransferSource;
  /** The chosen target project on the destination host, when the plan found it. */
  readonly project: ThreadTransferPlanProject | undefined;
  /**
   * Chat agents ready on the target — installed, GUI-capable, signed in, with
   * at least one GUI model — as full statuses so the composer can offer the
   * same provider/model controls as a new thread. The source agent is first
   * when it is among them.
   */
  readonly agents: readonly AgentStatus[];
  /** The thread's own agent is ready on the target. */
  readonly sourceAgentReady: boolean;
}

export type ThreadTransferProgress =
  | { readonly phase: "stopping" | "packaging" | "restoring" | "finishing" }
  | { readonly phase: "transferring"; readonly transferred: number; readonly total: number };

function hostLabel(host: EntityHost): string {
  if (host.connectionKey === undefined) return localEnvLabel({ kind: "native" });
  const server = useRemoteServersStore
    .getState()
    .servers.find((entry) => remoteConnectionKey(entry) === host.connectionKey);
  return server ? desktopTitle(server.label) : host.connectionKey;
}

function requireHost(host: EntityHost | undefined): EntityHost {
  if (!host) throw new Error(i18n._(msg`That machine is not available.`));
  return host;
}

/**
 * Member project rows of the thread's logical project that can receive the
 * move: a different host than the thread's, not WSL, and not disabled. The
 * same rows the environment menu offers, minus the machine the thread is on.
 */
export function transferCandidateMembers(thread: Thread, members: readonly Project[]): Project[] {
  const source = entityHost(thread);
  if (!source) return [];
  return members.filter((member) => {
    if (member.location.kind === "wsl" || member.disabled) return false;
    const host = entityHost(member);
    return host !== undefined && host.connectionKey !== source.connectionKey;
  });
}

/**
 * The transfer target a member project row stands for: its owning host's
 * connection key (undefined = this desktop's managed host), the member's
 * machine label, live reachability, and whether clients reach it only through
 * this computer. `hostProjectId` is the project id on the owning host — what
 * plan and commit address.
 */
export function transferTargetForMember(
  member: Project,
): { readonly target: ThreadTransferTarget; readonly hostProjectId: string } | undefined {
  const host = entityHost(member);
  if (!host) return undefined;
  const key = host.connectionKey;
  const server =
    key === undefined
      ? undefined
      : useRemoteServersStore
          .getState()
          .servers.find((entry) => remoteConnectionKey(entry) === key);
  const viaThisComputer =
    server?.transport?.kind === "environment" &&
    environmentParentRef(server.transport)?.kind === "managed";
  return {
    target: {
      key,
      label: readProjectEnvironmentLabel(member),
      online: host.isConnected(),
      ...(viaThisComputer ? { viaThisComputer: true } : {}),
    },
    hostProjectId: host.hostId,
  };
}

/**
 * Whether a transfer target is reachable now. Paired hosts read the live
 * runtime so a host that connects after the dialog opened counts; this
 * desktop's own host keeps the connection snapshot taken with the target list.
 */
export function transferTargetOnline(
  target: ThreadTransferTarget,
  runtime: RemoteServersState["runtime"],
): boolean {
  return target.key === undefined ? target.online : runtime[target.key]?.status === "online";
}

async function requireTransferCapability(host: EntityHost) {
  const environment = await host.withClient((client) => client.environment());
  if (!environment.capabilities?.threadTransfer?.versions.includes(THREAD_TRANSFER_VERSION)) {
    const label = hostLabel(host);
    throw new Error(i18n._(msg`Update ${label} to move threads between machines.`));
  }
  return environment;
}

/**
 * What moving this thread to the chosen member project on the target would
 * carry. `project` is undefined when that project no longer exists on the
 * target host. `agents` lists every ready chat agent on the target (source
 * first) so the composer can offer the full provider/model surface.
 */
export async function loadThreadTransferPreview(
  thread: Thread,
  target: ThreadTransferTarget,
  projectId: string,
): Promise<ThreadTransferPreview> {
  const source = requireHost(entityHost(thread));
  const destination = requireHost(hostHandle(target.key));
  const [sourceEnvironment, targetEnvironment] = await Promise.all([
    requireTransferCapability(source),
    requireTransferCapability(destination),
  ]);
  if (sourceEnvironment.desktopId === targetEnvironment.desktopId) {
    const label = target.label;
    throw new Error(i18n._(msg`This thread is already on ${label}.`));
  }
  const described = await source.withClient((client) =>
    client.threadTransfer({ kind: "describe", threadId: source.hostId }),
  );
  const [plan, agents] = await Promise.all([
    destination.withClient((client) =>
      client.threadTransfer({
        kind: "plan",
        projectId,
        repoIdentities: described.source.git?.repoIdentities ?? [],
      }),
    ),
    readyChatAgents(destination, thread),
  ]);
  return {
    source: described.source,
    project: plan.projects.find((project) => project.projectId === projectId),
    agents: agents ?? [],
    // An unreadable roster never blocks a move; the target reports a missing agent at launch.
    sourceAgentReady:
      agents === undefined || agents.some((agent) => agent.kind === thread.agentKind),
  };
}

/**
 * The target's chat agents that are installed, GUI-capable, signed in, and
 * offer at least one GUI model, as full statuses for the target composer. The
 * thread's own agent sorts first. Undefined when the target's roster cannot be
 * read.
 */
async function readyChatAgents(
  destination: EntityHost,
  thread: Thread,
): Promise<AgentStatus[] | undefined> {
  const statuses = await destination
    .withClient((client) => client.agentStatuses({ omitSlashCommands: true }))
    .catch(() => undefined);
  if (!statuses) return undefined;
  const agents = statuses.windows.filter((status) => {
    if (!status.installed || !supportsPresentation(status, "gui")) return false;
    if (authStateForPresentation(status, "gui") === "missing") return false;
    return Boolean(
      resolveModelSelection(
        capabilitiesForPresentation(status.capabilities, "gui"),
        status.kind === thread.agentKind ? thread.config.model : undefined,
      ),
    );
  });
  return agents.sort(
    (left, right) =>
      Number(right.kind === thread.agentKind) - Number(left.kind === thread.agentKind),
  );
}

/** Long enough for a provider to wind down a turn and persist its last items. */
const STOP_SETTLE_TIMEOUT_MS = 30_000;
const STOP_SETTLE_POLL_MS = 500;

/**
 * Stops the source run and waits until the host reports the thread settled.
 * Returns false without interrupting when the host already reports the thread
 * settled, so a turn that ended on its own is not disturbed.
 */
async function stopAndSettle(source: EntityHost): Promise<boolean> {
  const described = await source.withClient((client) =>
    client.threadTransfer({ kind: "describe", threadId: source.hostId }),
  );
  if (described.source.blocker !== "busy") return false;
  await source.withClient((client) => client.interruptThread(source.hostId));
  const deadline = Date.now() + STOP_SETTLE_TIMEOUT_MS;
  for (;;) {
    const poll = await source.withClient((client) =>
      client.threadTransfer({ kind: "describe", threadId: source.hostId }),
    );
    if (poll.source.blocker !== "busy") return true;
    if (Date.now() > deadline) {
      throw new Error(i18n._(msg`The agent did not stop in time. Try the move again.`));
    }
    await new Promise((resolve) => setTimeout(resolve, STOP_SETTLE_POLL_MS));
  }
}

export interface ThreadTransferOutcome {
  readonly thread: Thread;
  readonly targetLabel: string;
  readonly branch: string | undefined;
  readonly branchRenamed: boolean;
  /** The thread moved, but the follow-up message could not be sent. */
  readonly continueFailed: boolean;
}

export async function moveThreadToHost(input: {
  readonly thread: Thread;
  readonly target: ThreadTransferTarget;
  /** The target host's own project id. */
  readonly projectId: string;
  readonly continuePrompt?: string;
  /**
   * The agent and config the moved thread continues with on the target — the
   * composer's live selection. Sent whenever provided, even when it keeps the
   * source agent, so a same-provider model/settings change still applies.
   */
  readonly agent?: { readonly kind: string; readonly config: ThreadConfig };
  /** Stop a working agent here first, then resume the work on the target. */
  readonly stopFirst?: boolean;
  readonly onProgress?: (progress: ThreadTransferProgress) => void;
}): Promise<ThreadTransferOutcome> {
  const source = requireHost(entityHost(input.thread));
  const destination = requireHost(hostHandle(input.target.key));
  const transferId = crypto.randomUUID();
  let interrupted = false;
  if (input.stopFirst) {
    input.onProgress?.({ phase: "stopping" });
    interrupted = await stopAndSettle(source);
  }
  let committed;
  // Only a failure before the target saved means the move didn't finish.
  try {
    const plan = await destination.withClient((client) =>
      client.threadTransfer({ kind: "plan", projectId: input.projectId, repoIdentities: [] }),
    );
    input.onProgress?.({ phase: "packaging" });
    const exported = await source.withClient((client) =>
      client.threadTransfer({
        kind: "export",
        transferId,
        threadId: source.hostId,
        haves: plan.haves,
      }),
    );
    try {
      if (exported.summary.git && exported.summary.git.basisCount === 0 && plan.haves.length > 0) {
        const label = input.target.label;
        throw new Error(
          i18n._(msg`The selected project on ${label} doesn't share history with this repository.`),
        );
      }
      for (let offset = 0; offset < exported.byteLength;) {
        const read = await source.withClient((client) =>
          client.threadTransfer({
            kind: "read",
            transferId,
            offset,
            length: THREAD_TRANSFER_CHUNK_MAX_BYTES,
          }),
        );
        const data = base64ToUint8Array(read.data);
        if (data.length === 0) throw new Error(i18n._(msg`The transfer ended early. Try again.`));
        await destination.withClient((client) =>
          client.uploadThreadTransferChunk({
            transferId,
            offset,
            total: exported.byteLength,
            sha256: exported.sha256,
            data,
          }),
        );
        offset += data.length;
        input.onProgress?.({
          phase: "transferring",
          transferred: offset,
          total: exported.byteLength,
        });
      }
      input.onProgress?.({ phase: "restoring" });
      const commit = {
        kind: "commit" as const,
        transferId,
        threadId: crypto.randomUUID(),
        projectId: input.projectId,
        byteLength: exported.byteLength,
        sha256: exported.sha256,
        ...(input.agent ? { agent: { kind: input.agent.kind, config: input.agent.config } } : {}),
      };
      committed = await destination
        .withClient((client) => client.threadTransfer(commit))
        .catch((error: unknown) => {
          // A commit is idempotent per transfer, so an uncertain one is asked again.
          if (!remoteMutationMayHaveCommitted(error)) throw error;
          return destination.withClient((client) => client.threadTransfer(commit));
        });
    } catch (error) {
      void destination
        .withClient((client) => client.threadTransfer({ kind: "abort", transferId }))
        .catch(() => undefined);
      throw error;
    } finally {
      void source
        .withClient((client) => client.threadTransfer({ kind: "release", transferId }))
        .catch(() => undefined);
    }
  } catch (error) {
    // The run was already stopped on the source; say so instead of implying nothing happened.
    if (!interrupted) throw error;
    const reason = friendlyError(error);
    throw new Error(
      i18n._(msg`The agent was stopped here, but the move didn't finish: ${reason}`),
      { cause: error },
    );
  }
  input.onProgress?.({ phase: "finishing" });
  // The work continues on the target, so the original is archived — but only when
  // the source host, the authority on its own runs, still reports it settled. A
  // turn another client started during the move keeps it open, and so does a
  // source that cannot be asked: the move already succeeded.
  let sourceSettled = false;
  try {
    const described = await source.withClient((client) =>
      client.threadTransfer({ kind: "describe", threadId: source.hostId }),
    );
    sourceSettled = described.source.blocker !== "busy";
  } catch {
    // Leave the source open rather than risk archiving a live run.
  }
  if (sourceSettled) archiveThread(input.thread.id);
  const moved = destination.adoptThreadRow(committed.thread);
  openThread(moved.id, { reopenRuntime: false });
  // Work stopped for the move resumes on the target without waiting for the user.
  const prompt =
    input.continuePrompt?.trim() ||
    (interrupted ? i18n._(msg`Continue where you left off.`) : undefined);
  let continueFailed = false;
  if (prompt) {
    await submitThreadInput(moved.id, prompt).catch(() => {
      continueFailed = true;
    });
  } else {
    useAppStore.getState().requestComposerFocus(moved.id);
  }
  return {
    thread: moved,
    targetLabel: input.target.label,
    branch: committed.branch,
    branchRenamed: committed.branchRenamed,
    continueFailed,
  };
}
