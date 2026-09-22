import { msg } from "@lingui/core/macro";
import {
  experimentSchema,
  type Experiment,
  type ExperimentCandidateRowUpdate,
  type ExperimentCandidateThreadCreation,
  type RemoteExperimentCommand,
  type RemoteExperimentCommandResult,
} from "@/shared/contracts";
import {
  RemoteClientError,
  remoteMutationMayHaveCommitted,
  type RemoteDesktopClient,
} from "@/shared/remote/client";
import { friendlyError } from "@/shared/messages";
import { i18n } from "@/renderer/i18n/i18n";
import {
  readManagedLoopbackActivation,
  subscribeManagedLoopbackActivation,
  subscribeManagedLoopbackMembershipEvents,
  type ManagedLoopbackActivationSnapshot,
} from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { isManagedRootDesktopRuntime } from "./rootCatalogCommands";
import { managedRootSupportsExperiments } from "./rootLaunchMetadataCapability";

/**
 * Managed-root experiment authority (capabilities.experiments v1).
 *
 * The co-located backend host owns the durable experiment store: the canonical
 * records plus a store-wide content-hash CAS token are read from
 * `GET /api/experiments`, and every durable change is one explicit command
 * (`create`/`replace`/`remove`) on the SAME managed loopback client the root
 * catalog uses. This module:
 *
 * - resolves the live activation + advertised capability and refuses
 *   truthfully BEFORE any local mutation when either is absent (never a
 *   preload/whole-map fallback);
 * - projects the host's canonical records into the memory-only experiment
 *   store (`experimentStore.ts` no longer persists anything);
 * - sends commands under an explicit per-operation command id. A revision
 *   conflict re-reads the host state and rebases ONLY the intended semantic
 *   change under a NEW id, bounded; an uncertain outcome retries the exact
 *   original id and body under the host's crash-safe receipt (never a fresh
 *   destructive intent, never duplicated worktree/provider effects).
 *
 * Local state is only ever changed from confirmed host outcomes, except for
 * the caller's own optimistic paint (which the next projection overwrites).
 */

const MAX_CONFLICT_REBASES = 3;
const MAX_UNCERTAIN_RETRIES = 2;

export type ManagedExperimentAuthorityStatus =
  | { readonly status: "idle" }
  | { readonly status: "ready" }
  | { readonly status: "unsupported" }
  | { readonly status: "offline" }
  | { readonly status: "failed"; readonly message: string };

let status: ManagedExperimentAuthorityStatus = { status: "idle" };
const statusListeners = new Set<() => void>();

function statusKey(value: ManagedExperimentAuthorityStatus): string {
  return value.status === "failed" ? `failed:${value.message}` : value.status;
}

function setStatus(next: ManagedExperimentAuthorityStatus): void {
  if (statusKey(status) === statusKey(next)) return;
  status = next;
  for (const listener of [...statusListeners]) listener();
}

export function getManagedExperimentAuthorityStatus(): ManagedExperimentAuthorityStatus {
  return status;
}

export function subscribeManagedExperimentAuthorityStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

/** Cached state belongs to one exact managed transport activation. */
interface AuthoritySession {
  readonly activation: ManagedLoopbackActivationSnapshot;
  readonly client: RemoteDesktopClient;
  revision: string | null;
  readonly pendingCreateIds: Set<string>;
}
let currentSession: AuthoritySession | null = null;

function isCurrentSession(session: AuthoritySession): boolean {
  return readManagedLoopbackActivation() === session.activation;
}

function requireCurrentSession(session: AuthoritySession): void {
  if (!isCurrentSession(session)) {
    throw new ManagedExperimentAuthorityUnavailableError(unavailableMessage());
  }
}

function unavailableMessage(): string {
  return i18n._(
    msg`The desktop's own server is not connected. The experiment change was not saved.`,
  );
}

function unsupportedMessage(): string {
  return i18n._(msg`Experiments are unavailable on this host. The change was not saved.`);
}

export class ManagedExperimentAuthorityUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagedExperimentAuthorityUnavailableError";
  }
}

export class ManagedExperimentConflictError extends Error {
  constructor(cause?: unknown) {
    super(
      i18n._(
        msg`The experiment changed on the host while it was being saved. Reload and try again.`,
      ),
      cause !== undefined ? { cause } : undefined,
    );
    this.name = "ManagedExperimentConflictError";
  }
}

export class ManagedExperimentNotFoundError extends Error {
  constructor() {
    super(i18n._(msg`The experiment no longer exists on the host.`));
    this.name = "ManagedExperimentNotFoundError";
  }
}

export class ManagedExperimentOutcomeUncertainError extends Error {
  constructor(cause?: unknown) {
    super(
      i18n._(
        msg`Couldn't confirm the experiment change with the host. It may still have been applied — reload the experiment before trying again.`,
      ),
      cause !== undefined ? { cause } : undefined,
    );
    this.name = "ManagedExperimentOutcomeUncertainError";
  }
}

/**
 * True when the operation may have taken effect on the host (the explicit
 * uncertain code, a dispatched transport failure, or our own wrapper after a
 * bounded same-id retry). Callers must not roll back possibly-committed work
 * or start dependent external effects when this is true.
 */
export function isManagedExperimentOutcomeUncertain(error: unknown): boolean {
  return (
    error instanceof ManagedExperimentOutcomeUncertainError || remoteMutationMayHaveCommitted(error)
  );
}

function isExperimentRevisionConflict(error: unknown): boolean {
  return (
    error instanceof RemoteClientError &&
    error.status === 409 &&
    error.code === "experiment_revision_conflict"
  );
}

/**
 * The host authoritatively resolved THIS operation as a definite failure for
 * the same command id (a recorded `failed` receipt), so a retry under that id
 * cannot re-apply anything.
 */
function isAuthoritativelyResolvedFailure(error: unknown): boolean {
  return error instanceof RemoteClientError && error.code === "command_failed";
}

function isExperimentStateTooLarge(error: unknown): boolean {
  return (
    error instanceof RemoteClientError &&
    (error.code === "experiments_too_large" || error.status === 413)
  );
}

function tooLargeMessage(): string {
  return i18n._(msg`The experiment state is too large to load or change safely.`);
}

/**
 * Resolve the live authority or throw a localized refusal. This is the single
 * pre-effect gate for actions that must not start any local or external work
 * when experiments are unsupported or the loopback leg is down.
 */
export async function requireManagedExperimentAuthority(): Promise<void> {
  const activation = readManagedLoopbackActivation();
  if (!activation) throw new ManagedExperimentAuthorityUnavailableError(unavailableMessage());
  const supported = await managedRootSupportsExperiments();
  if (readManagedLoopbackActivation() !== activation) {
    throw new ManagedExperimentAuthorityUnavailableError(unavailableMessage());
  }
  if (!supported) {
    throw new ManagedExperimentAuthorityUnavailableError(unsupportedMessage());
  }
}

async function resolveSession(): Promise<AuthoritySession> {
  const activation = readManagedLoopbackActivation();
  await requireManagedExperimentAuthority();
  if (!activation || readManagedLoopbackActivation() !== activation) {
    throw new ManagedExperimentAuthorityUnavailableError(unavailableMessage());
  }
  if (currentSession?.activation !== activation) {
    currentSession = {
      activation,
      client: activation.client,
      revision: null,
      pendingCreateIds: new Set(),
    };
  }
  return currentSession;
}

interface HostExperimentState {
  readonly revision: string;
  readonly experiments: Record<string, Experiment>;
}

/** Read + canonically parse the host store. Fail closed on a malformed record. */
async function readHostState(client: RemoteDesktopClient): Promise<HostExperimentState> {
  try {
    const state = await client.experimentState();
    const experiments: Record<string, Experiment> = {};
    for (const [id, wire] of Object.entries(state.experiments)) {
      const record = experimentSchema.parse(wire);
      experiments[id] = record;
    }
    return { revision: state.revision, experiments };
  } catch (error) {
    if (isExperimentStateTooLarge(error)) {
      throw new ManagedExperimentAuthorityUnavailableError(tooLargeMessage());
    }
    throw error;
  }
}

/**
 * Install the canonical host projection. The read is the whole store, so an
 * absent record IS authoritative removal; only a locally pending create is
 * retained (its command may still commit). Records are never filtered by the
 * locally known project set.
 */
function projectHostState(session: AuthoritySession, state: HostExperimentState): void {
  requireCurrentSession(session);
  for (const experimentId of [...session.pendingCreateIds]) {
    if (state.experiments[experimentId]) session.pendingCreateIds.delete(experimentId);
  }
  const projected: Record<string, Experiment> = { ...state.experiments };
  for (const experimentId of session.pendingCreateIds) {
    const local = useExperimentStore.getState().experiments[experimentId];
    if (local) projected[experimentId] = local;
  }
  session.revision = state.revision;
  useExperimentStore.getState().replaceExperiments(projected);
}

async function refreshHostState(session: AuthoritySession): Promise<HostExperimentState> {
  for (let attempt = 0; attempt < MAX_CONFLICT_REBASES; attempt += 1) {
    requireCurrentSession(session);
    const startingRevision = session.revision;
    const state = await readHostState(session.client);
    requireCurrentSession(session);
    // A command acknowledgement or another read advanced the projection while
    // this read was in flight. Its snapshot may predate that confirmed state;
    // re-read instead of rolling the projection and CAS token backwards.
    if (session.revision !== startingRevision) continue;
    projectHostState(session, state);
    return state;
  }
  throw new ManagedExperimentConflictError();
}

/**
 * Read + project the canonical state once per activation. Returns false when
 * the authority is unsupported/offline or the read fails; the refusal is
 * already reflected in {@link getManagedExperimentAuthorityStatus}.
 */
export async function hydrateManagedExperimentState(): Promise<boolean> {
  const activation = readManagedLoopbackActivation();
  if (!activation) {
    setStatus({ status: "offline" });
    return false;
  }
  try {
    if (!(await managedRootSupportsExperiments())) {
      if (readManagedLoopbackActivation() === activation) setStatus({ status: "unsupported" });
      return false;
    }
    const session = await resolveSession();
    if (session.activation !== activation) return false;
    await refreshHostState(session);
    requireCurrentSession(session);
    setStatus({ status: "ready" });
    return true;
  } catch (error) {
    // A retired read cannot change either the successor's projection or status.
    if (readManagedLoopbackActivation() !== activation) return false;
    setStatus({
      status: "failed",
      message: friendlyError(error) || i18n._(msg`The experiment state could not be verified.`),
    });
    return false;
  }
}

/**
 * Send one command under a single explicit id, retrying the EXACT same id and
 * body only for an outcome that may have committed. A later definite refusal
 * after an uncertain attempt stays uncertain unless the host authoritatively
 * resolved the operation as failed.
 */
async function sendCommandWithUncertainRetry(
  session: AuthoritySession,
  command: RemoteExperimentCommand,
  commandId: string,
): Promise<RemoteExperimentCommandResult> {
  let uncertainSeen = false;
  requireCurrentSession(session);
  for (let attempt = 0; ; attempt += 1) {
    try {
      if (!isCurrentSession(session)) throw new ManagedExperimentOutcomeUncertainError();
      const result = await session.client.sendExperimentCommand(command, { commandId });
      if (!isCurrentSession(session)) throw new ManagedExperimentOutcomeUncertainError();
      return result;
    } catch (error) {
      if (!isCurrentSession(session)) throw new ManagedExperimentOutcomeUncertainError(error);
      if (remoteMutationMayHaveCommitted(error)) uncertainSeen = true;
      if (uncertainSeen && attempt < MAX_UNCERTAIN_RETRIES) continue;
      if (uncertainSeen && !isAuthoritativelyResolvedFailure(error)) {
        throw new ManagedExperimentOutcomeUncertainError(error);
      }
      throw error;
    }
  }
}

/**
 * A receipt confirms an operation, not that its resulting revision is still
 * current. If another response intervened, read the current host state rather
 * than replaying the earlier post-state over a newer projection.
 */
async function projectConfirmedCommand(
  session: AuthoritySession,
  startingRevision: string | null,
  result: RemoteExperimentCommandResult,
  experimentId: string,
  record: Experiment | null,
): Promise<Experiment | null> {
  if (!isCurrentSession(session)) throw new ManagedExperimentOutcomeUncertainError();
  if (session.revision !== startingRevision && session.revision !== result.revision) {
    let state: HostExperimentState;
    try {
      state = await refreshHostState(session);
    } catch (error) {
      // The mutation was acknowledged: failure to refresh cannot justify
      // rolling back a possibly-existing create or starting dependent effects.
      throw new ManagedExperimentOutcomeUncertainError(error);
    }
    const current = state.experiments[experimentId];
    if (record !== null) {
      if (!current) throw new ManagedExperimentNotFoundError();
      return current;
    }
    if (current) throw new ManagedExperimentConflictError();
    return null;
  }
  session.revision = result.revision;
  if (record) useExperimentStore.getState().upsertExperiment(record);
  else useExperimentStore.getState().removeExperiment(experimentId);
  return record;
}

/** The base record for a rebase: the projection, or a fresh authoritative read. */
async function baseExperimentRecord(
  session: AuthoritySession,
  experimentId: string,
): Promise<Experiment> {
  if (session.revision === null) await refreshHostState(session);
  const projected = useExperimentStore.getState().experiments[experimentId];
  if (projected) return projected;
  const state = await refreshHostState(session);
  const record = state.experiments[experimentId];
  if (!record) throw new ManagedExperimentNotFoundError();
  return record;
}

/**
 * Atomic insert-only create: the record plus every candidate thread spec are
 * one host transaction BEFORE any worktree preparation or launch. Only this
 * command has no supervisor call.
 */
export async function commitManagedExperimentCreate(
  record: Experiment,
  threads: readonly ExperimentCandidateThreadCreation[],
): Promise<void> {
  const session = await resolveSession();
  session.pendingCreateIds.add(record.id);
  const startingRevision = session.revision;
  try {
    const result = await sendCommandWithUncertainRetry(
      session,
      {
        kind: "create",
        experimentId: record.id,
        record,
        threads: [...threads],
      },
      crypto.randomUUID(),
    );
    session.pendingCreateIds.delete(record.id);
    await projectConfirmedCommand(session, startingRevision, result, record.id, record);
  } catch (error) {
    if (!isManagedExperimentOutcomeUncertain(error)) session.pendingCreateIds.delete(record.id);
    throw error;
  }
}

export interface ManagedExperimentChangePlan {
  readonly record: Experiment;
  readonly rows?: readonly ExperimentCandidateRowUpdate[];
}

/**
 * One semantic record change. `plan` receives the authoritative base record
 * (the projection, or the freshly re-read host record after a conflict) and
 * returns the exact intended post-state plus any narrow candidate-row updates,
 * or null when the intended change is already satisfied (for example a
 * generated title must not overwrite a user's newer title).
 */
export type ManagedExperimentChangePlanner = (
  baseRecord: Experiment,
) => ManagedExperimentChangePlan | null;

/**
 * Apply one semantic record change with bounded conflict rebase: a stale CAS
 * token re-reads the host store and re-runs `plan` against the current record
 * under a NEW command id, so another client's record is preserved.
 */
export async function commitManagedExperimentChange(
  experimentId: string,
  plan: ManagedExperimentChangePlanner,
): Promise<Experiment | null> {
  const session = await resolveSession();
  for (let conflictAttempts = 0; ; conflictAttempts += 1) {
    const base = await baseExperimentRecord(session, experimentId);
    const planned = plan(base);
    if (planned === null) return null;
    const startingRevision = session.revision;
    try {
      const result = await sendCommandWithUncertainRetry(
        session,
        {
          kind: "replace",
          experimentId,
          revision: session.revision!,
          record: planned.record,
          ...(planned.rows && planned.rows.length > 0 ? { rows: [...planned.rows] } : {}),
        },
        crypto.randomUUID(),
      );
      return await projectConfirmedCommand(
        session,
        startingRevision,
        result,
        experimentId,
        planned.record,
      );
    } catch (error) {
      if (!isExperimentRevisionConflict(error)) throw error;
      if (conflictAttempts >= MAX_CONFLICT_REBASES - 1) {
        throw new ManagedExperimentConflictError(error);
      }
      await refreshHostState(session);
    }
  }
}

/**
 * Remove a record with the requested candidate disposition (`release` clears
 * only group fields; `delete` requires confirmed retirement host-side) and drop
 * it from the projection only after the host confirms.
 */
export async function commitManagedExperimentRemoval(
  experimentId: string,
  candidateDisposition: "delete" | "release",
): Promise<void> {
  const session = await resolveSession();
  for (let conflictAttempts = 0; ; conflictAttempts += 1) {
    if (session.revision === null) await refreshHostState(session);
    const startingRevision = session.revision;
    try {
      const result = await sendCommandWithUncertainRetry(
        session,
        {
          kind: "remove",
          experimentId,
          revision: session.revision!,
          candidateDisposition,
        },
        crypto.randomUUID(),
      );
      await projectConfirmedCommand(session, startingRevision, result, experimentId, null);
      return;
    } catch (error) {
      if (!isExperimentRevisionConflict(error)) throw error;
      if (conflictAttempts >= MAX_CONFLICT_REBASES - 1) {
        throw new ManagedExperimentConflictError(error);
      }
      await refreshHostState(session);
    }
  }
}

let installed = false;
let unsubscribeActivation: (() => void) | null = null;
let unsubscribeMembership: (() => void) | null = null;

/**
 * Installs the managed experiment authority once per renderer process. Only
 * the managed Electron desktop has the co-located experiment authority, so
 * attached/browser runtimes never configure it.
 */
export function installManagedExperimentAuthorityRuntime(): void {
  if (installed) return;
  if (!isManagedRootDesktopRuntime()) return;
  installed = true;
  unsubscribeActivation = subscribeManagedLoopbackActivation((activation) => {
    if (!activation) {
      setStatus({ status: "offline" });
      return;
    }
    void hydrateManagedExperimentState().catch(() => undefined);
  });
  // A host-side project removal cascades experiment records; re-read when the
  // host reports project membership changed rather than pruning from a partial
  // local catalog.
  unsubscribeMembership = subscribeManagedLoopbackMembershipEvents((eventType) => {
    if (eventType !== "remote-projects-changed" && eventType !== "resync-required") return;
    if (!readManagedLoopbackActivation()) return;
    void hydrateManagedExperimentState().catch(() => undefined);
  });
  void hydrateManagedExperimentState().catch(() => undefined);
}

/** Test seam: tear down the runtime and every cached authority value. */
export function __resetManagedExperimentAuthorityForTest(): void {
  unsubscribeActivation?.();
  unsubscribeMembership?.();
  unsubscribeActivation = null;
  unsubscribeMembership = null;
  installed = false;
  currentSession = null;
  status = { status: "idle" };
  statusListeners.clear();
}
