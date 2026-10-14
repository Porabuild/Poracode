import type { Project, Thread } from "@/shared/contracts";
import {
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  isRemoteBoundedReadProtocolError,
  type RemoteBoundedReadsProof,
  type RemoteBoundedShellSnapshotPage,
  type RemoteBoundedThreadListResult,
  type RemoteDesktopClient,
} from "@/shared/remote/client";
import { reconcileThreadRowsWithAppliedEvents, reuseRemoteRows } from "../rowReuse";
import {
  BOUNDED_CATALOG_INVENTORY_LIMIT,
  BOUNDED_CATALOG_MEMBERSHIP_BATCH,
  BOUNDED_CATALOG_PAGE_LIMIT,
  BOUNDED_CATALOG_RECONCILE_INTERVAL_MS,
  BOUNDED_CATALOG_SEGMENT_PAGES,
  advanceInventoryWalk,
  beginInventoryWalk,
  catalogDeletionCandidates,
  chunkCatalogIds,
  type CatalogInventoryWalk,
  type CatalogKind,
  type CatalogWalkAdvance,
} from "./boundedCatalogAlgorithm";

/**
 * B4 bounded-catalog controller (W1, renderer).
 *
 * Owns the per-connection logical-pass state behind
 * `RemoteServersState.refreshServer`, so managed Electron, remote Electron and
 * web/PWA share one implementation. The state machine itself is pure
 * (`boundedCatalogAlgorithm.ts`); this module owns clients, generations,
 * timers and store commits.
 *
 * Invariants (ratified §2):
 *
 * - every connection key has ONE explicit, stable consumer owner captured when
 *   its state is created; registering a consumer never repoints or clobbers
 *   another consumer's connections, and every read, scheduled pass, capability
 *   readiness check, deletion gate and cleanup resolves the owning consumer;
 * - every async continuation is fenced by `{generation, identity, attempt}`; a
 *   delayed page or membership answer from a superseded connection or pass is
 *   dropped, never applied;
 * - only the shell page 1 advances the connection event cursor; paint and
 *   inventory continuations never do;
 * - rows merge by id and a page never deletes: deletion requires a completed
 *   inventory pass plus an authoritative membership confirmation;
 * - a segment yields after `BOUNDED_CATALOG_SEGMENT_PAGES` pages through the
 *   injected scheduler; event follow-ups are scheduled, never looped;
 * - the periodic reconciliation pass runs only while the connection is online
 *   and the surface is foregrounded, one kind at a time.
 */

/**
 * The live connection behind a catalog key: one client, one generation, one
 * routing identity. The remote wiring supplies today's server record logic
 * (endpoint + token identity, event-socket generation, paired client); the
 * managed root supplies the live loopback activation (activation seq as
 * generation, endpoint as identity, the ONE loopback client). A key without a
 * live connection is undefined and every delayed page from it is dropped.
 */
export interface BoundedCatalogConnectionIdentity {
  readonly generation: number;
  readonly identity: string;
  readonly client: RemoteDesktopClient;
}

export interface BoundedCatalogDeps {
  readonly connectionIdentity: (
    connectionKey: string,
  ) => BoundedCatalogConnectionIdentity | undefined;
  readonly runtimeThreads: (connectionKey: string) => readonly Thread[] | undefined;
  readonly runtimeProjects: (connectionKey: string) => readonly Project[] | undefined;
  readonly runtimeStatus: (connectionKey: string) => string | undefined;
  /** Merge page rows into the runtime catalog and mirror them into app rows. */
  readonly commitThreadRows: (
    connectionKey: string,
    rows: Thread[],
    preserveThreadIds: ReadonlySet<string>,
  ) => void;
  readonly commitProjectRows: (connectionKey: string, rows: Project[]) => void;
  readonly removeThreadRows: (connectionKey: string, threadIds: readonly string[]) => void;
  readonly removeProjectRows: (connectionKey: string, projectIds: readonly string[]) => void;
  readonly withClient: <Result>(
    connectionKey: string,
    invoke: (client: RemoteDesktopClient) => Promise<Result>,
  ) => Promise<Result>;
  readonly reportProtocolError: (connectionKey: string, error: unknown) => void;
  readonly appliedThreadSeq: (connectionKey: string, threadId: string) => number | undefined;
  readonly connectionSeq: (connectionKey: string) => number;
  readonly bumpConnectionSeq: (connectionKey: string, seq: number) => void;
  readonly protectedThreadIds: (connectionKey: string) => ReadonlySet<string>;
  readonly isForeground: () => boolean;
  /**
   * Declared manual-order convergence for a bounded catalog whose projection
   * can apply an authoritative manual id order (the managed root and each
   * paired/remote connection). When declared, the controller applies the
   * accumulated id order of every completed manual paint pass and refreshes
   * that paint from the host on membership events, so an external reorder or
   * host-prepended row converges without a full catalog read.
   * `generation(connectionKey, kind)` is captured when a paint walk starts and
   * reported back on completion: a consumer refuses an order whose generation
   * was superseded by a newer local paint intent. The fence itself is the
   * consumer's (shared, per connection key); a connection that does not declare
   * this keeps the historical paint behavior (rows merge by id; no order is
   * applied).
   */
  readonly manualOrderConvergence?: {
    /** The kind's current generation: threads and projects are independent. */
    readonly generation: (connectionKey: string, kind: CatalogKind) => number;
    /**
     * Apply one completed pass's accumulated order. `"stale"` means the
     * consumer refused because the captured generation was superseded (the
     * controller schedules a bounded re-walk so the newest order converges);
     * `"deferred"` means a local order intent of that kind is still in flight
     * (its own settle path owns convergence, so no re-walk is scheduled).
     */
    readonly apply: (
      connectionKey: string,
      kind: CatalogKind,
      orderedIds: readonly string[],
      generation: number,
    ) => "applied" | "deferred" | "stale" | void;
  };
  readonly now?: () => number;
  readonly schedule?: (callback: () => void, delayMs: number) => TimerHandle;
}

type TimerHandle = ReturnType<typeof setTimeout>;

interface WalkSlot {
  walk: CatalogInventoryWalk;
  proof: RemoteBoundedReadsProof | null;
}

interface CatalogPaintState {
  cursor: string | null;
  proof: RemoteBoundedReadsProof | null;
  attempt: number;
  /** Manual-order generation captured when this paint walk started. */
  generation: number;
  /** Manual ids accumulated from page 1 through the current page. */
  orderedIds: string[];
}

interface BoundedCatalogConnection {
  readonly connectionKey: string;
  /** Stable identity of the consumer that owns this connection. */
  readonly ownerId: string;
  readonly generation: number;
  readonly identity: string;
  attempt: number;
  /** True once the first pass of the current attempt has been started. */
  passesStarted: boolean;
  paintThreads: CatalogPaintState | null;
  paintProjects: CatalogPaintState | null;
  /** Attempt owning the in-flight paint loop per kind, or null when idle. */
  threadsPaintRunningAttempt: number | null;
  projectsPaintRunningAttempt: number | null;
  refreshThreadsPaint: boolean;
  refreshProjectsPaint: boolean;
  threads: WalkSlot | null;
  projects: WalkSlot | null;
  /** Attempt owning the in-flight segment per kind, or null when idle. */
  threadsRunningAttempt: number | null;
  projectsRunningAttempt: number | null;
  threadsScheduled: boolean;
  projectsScheduled: boolean;
  pendingThreads: boolean;
  pendingProjects: boolean;
  lastReconcileAt: number;
  reconcileKind: CatalogKind;
}

const EVENT_FOLLOW_UP_DELAY_MS = 600;
const RECONCILE_TICK_MS = 30_000;

/**
 * One bounded-catalog consumer (the managed root adapter, the paired/remote
 * server store). Ownership is explicit and stable per connection key:
 * configuring a consumer registers it without touching any other consumer's
 * connections, so module evaluation order can never decide which catalog works.
 */
export interface BoundedCatalogConsumer {
  /** Stable process-local consumer identity. */
  readonly id: string;
  /** Whether this consumer is the authority for a connection key. */
  readonly ownsConnection: (connectionKey: string) => boolean;
}

interface RegisteredConsumer extends BoundedCatalogConsumer {
  readonly deps: BoundedCatalogDeps;
}

const consumers = new Map<string, RegisteredConsumer>();
const connections = new Map<string, BoundedCatalogConnection>();
const legacyConnections = new Map<string, { generation: number }>();
let reconcileTicker: TimerHandle | null = null;

/**
 * Register (or replace) one consumer's dependencies. A connection keeps the
 * consumer captured when its state was created: registering another consumer
 * never repoints an existing connection, and two consumers with disjoint
 * ownership coexist in one process.
 */
export function configureBoundedCatalogController(
  consumer: BoundedCatalogConsumer,
  next: BoundedCatalogDeps,
): void {
  consumers.set(consumer.id, { ...consumer, deps: next });
}

/**
 * True once any bounded catalog consumer installed its dependencies. The
 * managed root and the paired/remote store both configure the same controller,
 * so a process without any consumer never declares signal-shaped notifications.
 */
export function isBoundedCatalogControllerConfigured(): boolean {
  return consumers.size > 0;
}

/**
 * Whether some installed consumer owns this exact connection key. Capability
 * declarations are per connection: a consumer for another key never authorizes
 * the signal-shaped upgrade.
 */
export function hasBoundedCatalogConsumerFor(connectionKey: string): boolean {
  return resolveConsumer(connectionKey) !== undefined;
}

/**
 * The consumer that owns a key, chosen deterministically by consumer id when
 * several claim it (never by registration order). A connection state captures
 * its consumer id at creation, so a later registration cannot steal it.
 */
function resolveConsumer(connectionKey: string): RegisteredConsumer | undefined {
  let chosen: RegisteredConsumer | undefined;
  for (const consumer of consumers.values()) {
    if (!consumer.ownsConnection(connectionKey)) continue;
    if (!chosen || consumer.id < chosen.id) chosen = consumer;
  }
  return chosen;
}

/** The consumer captured by a connection state, while it still owns the key. */
function stateConsumer(state: BoundedCatalogConnection): RegisteredConsumer | undefined {
  const consumer = consumers.get(state.ownerId);
  return consumer && consumer.ownsConnection(state.connectionKey) ? consumer : undefined;
}

function nowOf(consumer: RegisteredConsumer | undefined): number {
  return (consumer?.deps.now ?? Date.now)();
}

function scheduleOf(
  consumer: RegisteredConsumer | undefined,
  callback: () => void,
  delayMs: number,
): TimerHandle {
  return (consumer?.deps.schedule ?? ((fn, delay) => setTimeout(fn, delay)))(callback, delayMs);
}

function stateIsCurrent(connectionKey: string, state: BoundedCatalogConnection): boolean {
  const consumer = stateConsumer(state);
  if (!consumer || connections.get(connectionKey) !== state) return false;
  const identity = consumer.deps.connectionIdentity(connectionKey);
  if (!identity) return false;
  return state.generation === identity.generation && state.identity === identity.identity;
}

function attemptIsCurrent(
  connectionKey: string,
  state: BoundedCatalogConnection,
  attempt: number,
): boolean {
  return stateIsCurrent(connectionKey, state) && state.attempt === attempt;
}

function ensureConnection(connectionKey: string): BoundedCatalogConnection | undefined {
  const existing = connections.get(connectionKey);
  let consumer = existing ? stateConsumer(existing) : undefined;
  if (!consumer) {
    // The captured consumer is gone or no longer owns the key (e.g. a removed
    // server record): the state is retired and the key resolved afresh.
    if (existing) connections.delete(connectionKey);
    consumer = resolveConsumer(connectionKey);
  }
  if (!consumer) return undefined;
  const live = consumer.deps.connectionIdentity(connectionKey);
  if (!live) return undefined;
  const generation = live.generation;
  const identity = live.identity;
  if (
    existing &&
    existing.ownerId === consumer.id &&
    existing.generation === generation &&
    existing.identity === identity
  ) {
    return existing;
  }
  const state: BoundedCatalogConnection = {
    connectionKey,
    ownerId: consumer.id,
    generation,
    identity,
    attempt: (existing?.attempt ?? 0) + 1,
    passesStarted: false,
    paintThreads: null,
    paintProjects: null,
    threadsPaintRunningAttempt: null,
    projectsPaintRunningAttempt: null,
    refreshThreadsPaint: false,
    refreshProjectsPaint: false,
    threads: null,
    projects: null,
    threadsRunningAttempt: null,
    projectsRunningAttempt: null,
    threadsScheduled: false,
    projectsScheduled: false,
    pendingThreads: true,
    pendingProjects: true,
    lastReconcileAt: nowOf(consumer),
    reconcileKind: "threads",
  };
  connections.set(connectionKey, state);
  startReconcileTicker();
  return state;
}

/** Fresh logical passes for connect / host switch / resync gap / reconnect. */
export function beginBoundedCatalogAttempt(connectionKey: string): void {
  const state = connections.get(connectionKey);
  // A reconnect re-probes the capability: an upgraded host must not stay on
  // the assembled legacy path forever.
  legacyConnections.delete(connectionKey);
  if (!state) return;
  state.attempt += 1;
  state.passesStarted = false;
  state.paintThreads = null;
  state.paintProjects = null;
  state.refreshThreadsPaint = false;
  state.refreshProjectsPaint = false;
  state.threads = null;
  state.projects = null;
  state.pendingThreads = true;
  state.pendingProjects = true;
}

export function isKnownLegacyCatalogConnection(connectionKey: string): boolean {
  const record = legacyConnections.get(connectionKey);
  if (!record) return false;
  const live = resolveConsumer(connectionKey)?.deps.connectionIdentity(connectionKey);
  return live !== undefined && record.generation === live.generation;
}

export function noteBoundedCatalogLegacy(connectionKey: string): void {
  const state = connections.get(connectionKey);
  const identity = state
    ? stateConsumer(state)?.deps.connectionIdentity(connectionKey)
    : resolveConsumer(connectionKey)?.deps.connectionIdentity(connectionKey);
  const generation = state?.generation ?? identity?.generation ?? 0;
  connections.delete(connectionKey);
  legacyConnections.set(connectionKey, { generation });
}

/** Installs a bounded shell page 1 and schedules the background passes. */
export function installBoundedCatalogShellPage(
  connectionKey: string,
  page: RemoteBoundedShellSnapshotPage,
): void {
  const state = ensureConnection(connectionKey);
  if (!state) return;
  const consumer = stateConsumer(state);
  if (!consumer) return;
  const active = consumer.deps;
  legacyConnections.delete(connectionKey);
  active.bumpConnectionSeq(connectionKey, page.snapshotSeq);
  commitThreadPage(active, connectionKey, page.threads, page.snapshotSeq);
  if (page.projects.length > 0) commitProjectRows(active, connectionKey, page.projects);
  // Page 1 is authoritative manual paint order. It (re)starts each walk for a
  // fresh attempt, but a repeated install within the SAME attempt keeps an
  // in-flight walk (the historical idempotence): replacing it would make the
  // running loop overwrite the fresh page-1 state with its stale continuation.
  // The project walk exists only for a connection that declared manual-order
  // convergence, so a connection without one keeps the historical behavior.
  installShellPaint(state, active, connectionKey, "threads", {
    cursor: page.threadsNextCursor,
    proof: page,
    ids: page.threads.map((row) => row.id),
  });
  if (active.manualOrderConvergence) {
    installShellPaint(state, active, connectionKey, "projects", {
      cursor: page.projectsNextCursor,
      proof: null,
      ids: page.projects.map((row) => row.id),
    });
  }
  // Idempotent: resumes a walk whose page failed (no loop owns the slot) and
  // never opens a second loop while one is in flight. Without this a plain
  // refresh would leave a failed paint walk stalled until a fresh attempt.
  schedulePaintSegment(connectionKey, "threads");
  if (state.paintProjects) schedulePaintSegment(connectionKey, "projects");
  if (!state.passesStarted) {
    state.passesStarted = true;
    scheduleInventory(connectionKey, "threads", 0);
    scheduleInventory(connectionKey, "projects", 0);
  } else {
    if (state.pendingThreads) scheduleInventory(connectionKey, "threads", EVENT_FOLLOW_UP_DELAY_MS);
    if (state.pendingProjects)
      scheduleInventory(connectionKey, "projects", EVENT_FOLLOW_UP_DELAY_MS);
  }
}

function manualOrderGeneration(
  active: BoundedCatalogDeps,
  connectionKey: string,
  kind: CatalogKind,
): number {
  return active.manualOrderConvergence?.generation(connectionKey, kind) ?? 0;
}

/**
 * Install page-1 paint state for one kind. A paint belonging to the same
 * attempt is never replaced (only its proof refreshed, as before), so an
 * in-flight walk survives a repeated install; a fresh attempt always restarts.
 */
function installShellPaint(
  state: BoundedCatalogConnection,
  active: BoundedCatalogDeps,
  connectionKey: string,
  kind: CatalogKind,
  page: {
    readonly cursor: string | null;
    readonly proof: RemoteBoundedReadsProof | null;
    readonly ids: readonly string[];
  },
): void {
  const existing = readPaint(state, kind);
  if (existing && existing.attempt === state.attempt) {
    if (page.proof !== null && existing.proof === null) {
      writePaint(state, kind, { ...existing, proof: page.proof });
    }
    return;
  }
  writePaint(state, kind, {
    cursor: page.cursor,
    proof: page.proof,
    attempt: state.attempt,
    generation: manualOrderGeneration(active, connectionKey, kind),
    orderedIds: [...page.ids],
  });
}

function readPaint(state: BoundedCatalogConnection, kind: CatalogKind): CatalogPaintState | null {
  return kind === "threads" ? state.paintThreads : state.paintProjects;
}

function writePaint(
  state: BoundedCatalogConnection,
  kind: CatalogKind,
  paint: CatalogPaintState | null,
): void {
  if (kind === "threads") state.paintThreads = paint;
  else state.paintProjects = paint;
}

function paintRunningAttempt(state: BoundedCatalogConnection, kind: CatalogKind): number | null {
  return kind === "threads" ? state.threadsPaintRunningAttempt : state.projectsPaintRunningAttempt;
}

function setPaintRunningAttempt(
  state: BoundedCatalogConnection,
  kind: CatalogKind,
  attempt: number | null,
): void {
  if (kind === "threads") state.threadsPaintRunningAttempt = attempt;
  else state.projectsPaintRunningAttempt = attempt;
}

function paintRefreshRequested(state: BoundedCatalogConnection, kind: CatalogKind): boolean {
  return kind === "threads" ? state.refreshThreadsPaint : state.refreshProjectsPaint;
}

function setPaintRefreshRequested(
  state: BoundedCatalogConnection,
  kind: CatalogKind,
  requested: boolean,
): void {
  if (kind === "threads") state.refreshThreadsPaint = requested;
  else state.refreshProjectsPaint = requested;
}

function commitThreadPage(
  active: BoundedCatalogDeps,
  connectionKey: string,
  rows: readonly Thread[],
  guardSeq: number,
): void {
  const current = active.runtimeThreads(connectionKey) ?? [];
  // Row-level sequence arbitration: a live event newer than this page keeps
  // the live row, and a live row the page omitted is re-appended (protected
  // from the app-row mirror with `preserveThreadIds`).
  const { rows: reconciled, staleThreadIds } = reconcileThreadRowsWithAppliedEvents(
    connectionKey,
    guardSeq,
    [...rows],
    current,
  );
  const merged = mergeCatalogRows(current, reuseRemoteRows([...current], [...reconciled]));
  active.commitThreadRows(connectionKey, merged, staleThreadIds);
}

function commitProjectRows(
  active: BoundedCatalogDeps,
  connectionKey: string,
  rows: readonly Project[],
): void {
  const current = active.runtimeProjects(connectionKey) ?? [];
  const merged = mergeCatalogRows(current, reuseRemoteRows([...current], [...rows]));
  active.commitProjectRows(connectionKey, merged);
}

function mergeCatalogRows<T extends { readonly id: string }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  if (incoming.length === 0) return current as T[];
  const incomingById = new Map(incoming.map((row) => [row.id, row]));
  let changed = false;
  const next: T[] = current.map((row) => {
    const replacement = incomingById.get(row.id);
    if (!replacement) return row;
    incomingById.delete(row.id);
    if (replacement !== row) changed = true;
    return replacement;
  });
  if (incomingById.size > 0) {
    changed = true;
    for (const row of incoming) {
      if (incomingById.has(row.id)) next.push(row);
    }
  }
  return changed ? next : (current as T[]);
}

/**
 * Ask for a fresh page-1 manual paint of one kind. The flag is taken by the
 * running walk (or by a newly scheduled one) before its next page, so a burst
 * of membership events coalesces into one refresh read. Also the bounded repair
 * for a refused/lost manual pass: one queued refresh per kind, never a loop.
 */
export function requestManualPaintRefresh(connectionKey: string, kind: CatalogKind): void {
  const state = connections.get(connectionKey);
  if (!state) return;
  if (!stateConsumer(state)?.deps.manualOrderConvergence) return;
  setPaintRefreshRequested(state, kind, true);
  schedulePaintSegment(connectionKey, kind);
}

function schedulePaintSegment(connectionKey: string, kind: CatalogKind): void {
  const state = connections.get(connectionKey);
  if (!state) return;
  const consumer = stateConsumer(state);
  if (!consumer) return;
  // A project paint exists only where order convergence is declared; without
  // it the historical thread-only paint walk stays byte-identical.
  if (
    kind === "projects" &&
    !consumer.deps.manualOrderConvergence &&
    readPaint(state, kind) === null
  ) {
    return;
  }
  if (paintRunningAttempt(state, kind) !== null) return;
  setPaintRunningAttempt(state, kind, state.attempt);
  const attempt = state.attempt;
  scheduleOf(
    consumer,
    () => {
      void runPaintSegment(connectionKey, kind, attempt);
    },
    0,
  );
}

interface PaintPageResult {
  readonly ids: readonly string[];
  readonly nextCursor: string | null;
  readonly proof: RemoteBoundedReadsProof | null;
}

/** One bounded manual paint page (page 1 when `paint` is null). */
async function readPaintPage(
  active: BoundedCatalogDeps,
  connectionKey: string,
  kind: CatalogKind,
  paint: CatalogPaintState | null,
): Promise<PaintPageResult | null> {
  try {
    if (kind === "threads") {
      const cursor = paint?.cursor ?? null;
      const proof = paint?.proof ?? null;
      const result = await active.withClient(connectionKey, (client) =>
        cursor !== null && proof !== null
          ? client.boundedThreadListPage({
              mode: "page",
              order: "manual",
              limit: BOUNDED_CATALOG_PAGE_LIMIT,
              summaries: false,
              cursor,
              after: proof,
              maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
              maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
            })
          : client.boundedThreadListPage({
              mode: "page",
              order: "manual",
              limit: BOUNDED_CATALOG_PAGE_LIMIT,
              summaries: false,
              maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
              maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
            }),
      );
      if (result.negotiation !== "bounded") {
        active.reportProtocolError(
          connectionKey,
          new Error("A bounded paint response lost its reads echo."),
        );
        return null;
      }
      commitThreadPage(
        active,
        connectionKey,
        result.page.threads,
        active.connectionSeq(connectionKey),
      );
      return {
        ids: result.page.threads.map((row) => row.id),
        nextCursor: result.page.nextCursor,
        proof: result.page,
      };
    }
    const projectCursor = paint?.cursor ?? null;
    const result = await active.withClient(connectionKey, (client) =>
      projectCursor !== null
        ? client.boundedProjectListPage({
            mode: "page",
            projectLimit: BOUNDED_CATALOG_PAGE_LIMIT,
            cursor: projectCursor,
            maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
            maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
          })
        : client.boundedProjectListPage({
            mode: "page",
            projectLimit: BOUNDED_CATALOG_PAGE_LIMIT,
            maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
            maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
          }),
    );
    commitProjectRows(active, connectionKey, result.projects);
    return {
      ids: result.projects.map((row) => row.id),
      nextCursor: result.projectsNextCursor,
      proof: null,
    };
  } catch (error) {
    reportIfProtocolError(active, connectionKey, error);
    return null;
  }
}

/**
 * Report one completed paint pass's order and repair liveness: a pass whose
 * captured generation was superseded is refused by the controller itself (the
 * consumer's own check stays as defense in depth) and asks for one bounded
 * re-walk, so the newest order converges without waiting for an unrelated
 * event. A `"deferred"` verdict (a local intent of this kind is mid-flight)
 * schedules nothing: the intent's settle path owns that convergence.
 */
function completeCatalogPaintPass(
  active: BoundedCatalogDeps,
  connectionKey: string,
  kind: CatalogKind,
  paint: CatalogPaintState,
): void {
  const manualOrder = active.manualOrderConvergence;
  if (!manualOrder || paint.orderedIds.length === 0) return;
  if (manualOrder.generation(connectionKey, kind) !== paint.generation) {
    requestManualPaintRefresh(connectionKey, kind);
    return;
  }
  if (manualOrder.apply(connectionKey, kind, paint.orderedIds, paint.generation) === "stale") {
    requestManualPaintRefresh(connectionKey, kind);
  }
}

async function runPaintSegment(
  connectionKey: string,
  kind: CatalogKind,
  attempt: number,
): Promise<void> {
  try {
    const state = connections.get(connectionKey);
    if (!state || !attemptIsCurrent(connectionKey, state, attempt)) return;
    const consumer = stateConsumer(state);
    if (!consumer) return;
    const active = consumer.deps;
    for (;;) {
      if (!attemptIsCurrent(connectionKey, state, attempt)) return;
      if (paintRefreshRequested(state, kind)) {
        setPaintRefreshRequested(state, kind, false);
        const page = await readPaintPage(active, connectionKey, kind, null);
        if (page === null) return;
        if (!attemptIsCurrent(connectionKey, state, attempt)) return;
        writePaint(state, kind, {
          cursor: page.nextCursor,
          proof: page.proof,
          attempt,
          generation: manualOrderGeneration(active, connectionKey, kind),
          orderedIds: [...page.ids],
        });
        continue;
      }
      const paint = readPaint(state, kind);
      if (!paint || paint.attempt !== attempt) return;
      if (paint.cursor === null) {
        completeCatalogPaintPass(active, connectionKey, kind, paint);
        // A refresh requested during (or by) the completion must run before the
        // loop releases its slot: a membership event landing while the walk
        // awaited its final page would otherwise be silently dropped.
        if (!paintRefreshRequested(state, kind)) return;
        continue;
      }
      const page = await readPaintPage(active, connectionKey, kind, paint);
      if (page === null) return;
      if (!attemptIsCurrent(connectionKey, state, attempt)) return;
      const next: CatalogPaintState = {
        ...paint,
        cursor: page.nextCursor,
        proof: page.proof,
        orderedIds: [...paint.orderedIds, ...page.ids],
      };
      writePaint(state, kind, next);
      if (page.nextCursor === null) {
        completeCatalogPaintPass(active, connectionKey, kind, next);
        if (!paintRefreshRequested(state, kind)) return;
        continue;
      }
    }
  } finally {
    const state = connections.get(connectionKey);
    // Ownership: only the loop that installed the flag releases it, so a stale
    // loop (superseded attempt, or a re-paired connection's replaced state)
    // can never free a successor's slot. A superseding attempt that installed
    // a new paint while this page was in flight left its continuation
    // unscheduled (the slot was taken); hand it over now.
    if (state && paintRunningAttempt(state, kind) === attempt) {
      setPaintRunningAttempt(state, kind, null);
      if (state.attempt !== attempt) schedulePaintSegment(connectionKey, kind);
    }
  }
}

function inventoryRunning(state: BoundedCatalogConnection, kind: CatalogKind): boolean {
  return kind === "threads"
    ? state.threadsRunningAttempt !== null
    : state.projectsRunningAttempt !== null;
}

function inventoryScheduled(state: BoundedCatalogConnection, kind: CatalogKind): boolean {
  return kind === "threads" ? state.threadsScheduled : state.projectsScheduled;
}

function setInventoryScheduled(
  state: BoundedCatalogConnection,
  kind: CatalogKind,
  scheduled: boolean,
): void {
  if (kind === "threads") state.threadsScheduled = scheduled;
  else state.projectsScheduled = scheduled;
}

function scheduleInventory(connectionKey: string, kind: CatalogKind, delayMs: number): void {
  const state = connections.get(connectionKey);
  if (!state) return;
  const consumer = stateConsumer(state);
  if (!consumer) return;
  // One queued or running pass per kind: a reconcile tick or a follow-up must
  // never start a second concurrent walk while a debounced event timer is
  // already queued (both timer sources would otherwise fire into
  // `runInventorySegment`, which has no dedicated walk slot until its first
  // page resolves).
  if (inventoryRunning(state, kind) || inventoryScheduled(state, kind)) return;
  setInventoryScheduled(state, kind, true);
  scheduleOf(
    consumer,
    () => {
      setInventoryScheduled(state, kind, false);
      void runInventorySegment(connectionKey, kind);
    },
    delayMs,
  );
}

async function runInventorySegment(connectionKey: string, kind: CatalogKind): Promise<void> {
  const state = connections.get(connectionKey);
  if (!state || !stateIsCurrent(connectionKey, state)) return;
  const consumer = stateConsumer(state);
  if (!consumer) return;
  const active = consumer.deps;
  // Entry guard: a queued pass that fires after another path already started
  // one must not open a second walk for the same kind.
  if (inventoryRunning(state, kind)) return;
  const attempt = state.attempt;
  let slot: WalkSlot | null = kind === "threads" ? state.threads : state.projects;
  if (!slot) {
    slot = {
      walk: beginInventoryWalk({
        kind,
        attempt,
        knownBefore:
          kind === "threads"
            ? (active.runtimeThreads(connectionKey) ?? []).map((row) => row.id)
            : (active.runtimeProjects(connectionKey) ?? []).map((row) => row.id),
        startedSeq: active.connectionSeq(connectionKey),
      }),
      proof: null,
    };
    // Events observed before this logical pass are consumed by it; events
    // during the walk set the flag again and force a follow-up pass (R4).
    if (kind === "threads") state.pendingThreads = false;
    else state.pendingProjects = false;
  }
  if (slot.walk.attempt !== attempt) {
    if (kind === "threads") state.threads = null;
    else state.projects = null;
    return;
  }
  if (kind === "threads") state.threadsRunningAttempt = attempt;
  else state.projectsRunningAttempt = attempt;
  let reschedule = false;
  try {
    let pagesInSegment = slot.walk.pagesInSegment;
    while (pagesInSegment < BOUNDED_CATALOG_SEGMENT_PAGES) {
      if (!attemptIsCurrent(connectionKey, state, attempt)) return;
      const walk: CatalogInventoryWalk = slot.walk;
      const cursor = walk.cursor;
      const proof: RemoteBoundedReadsProof | null = slot.proof;
      if (cursor !== null && proof === null) {
        resetWalk(connectionKey, kind);
        return;
      }
      const guardSeq = active.connectionSeq(connectionKey);
      let advance: CatalogWalkAdvance | null = null;
      try {
        if (kind === "threads") {
          const request = {
            mode: "inventory" as const,
            limit: BOUNDED_CATALOG_INVENTORY_LIMIT,
            maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
            maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
          };
          const result: RemoteBoundedThreadListResult = await (cursor !== null && proof !== null
            ? active.withClient(connectionKey, (client) =>
                client.boundedThreadListPage({ ...request, cursor, after: proof }),
              )
            : active.withClient(connectionKey, (client) => client.boundedThreadListPage(request)));
          if (result.negotiation !== "bounded") {
            active.reportProtocolError(
              connectionKey,
              new Error("A bounded thread inventory response lost its reads echo."),
            );
            return;
          }
          slot = { proof: result.page, walk };
          commitThreadPage(active, connectionKey, result.page.threads, guardSeq);
          advance = advanceInventoryWalk(walk, {
            ids: result.page.threads.map((row) => row.id),
            nextCursor: result.page.nextCursor,
            frontier: result.page.inventoryFrontier,
          });
        } else {
          const result = await active.withClient(connectionKey, (client) =>
            client.boundedProjectListPage({
              mode: "inventory",
              projectLimit: BOUNDED_CATALOG_INVENTORY_LIMIT,
              ...(cursor !== null ? { cursor } : {}),
              maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
              maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
            }),
          );
          slot = { proof: result, walk: walk };
          commitProjectRows(active, connectionKey, result.projects);
          advance = advanceInventoryWalk(walk, {
            ids: result.projects.map((row) => row.id),
            nextCursor: result.projectsNextCursor,
            frontier: result.inventoryFrontier,
          });
        }
      } catch (error) {
        reportIfProtocolError(active, connectionKey, error);
        // A failed page leaves the walk in place; the connection's next
        // refresh/reconcile resumes or restarts it.
        if (kind === "threads") {
          state.pendingThreads = true;
          state.threads = slot;
        } else {
          state.pendingProjects = true;
          state.projects = slot;
        }
        return;
      }
      if (!attemptIsCurrent(connectionKey, state, attempt)) {
        if (kind === "threads") state.threads = slot;
        else state.projects = slot;
        return;
      }
      if (advance === null) return;
      if (advance.status === "cursor-repeat") {
        active.reportProtocolError(
          connectionKey,
          new Error("The host repeated a bounded inventory cursor; restarting the pass."),
        );
        resetWalk(connectionKey, kind);
        return;
      }
      slot = { walk: advance.walk, proof: slot.proof };
      if (kind === "threads") state.threads = slot;
      else state.projects = slot;
      pagesInSegment = slot.walk.pagesInSegment;
      if (advance.status === "segment-end") {
        slot = { walk: { ...slot.walk, pagesInSegment: 0 }, proof: slot.proof };
        if (kind === "threads") state.threads = slot;
        else state.projects = slot;
        reschedule = true;
        return;
      }
      if (advance.status === "complete") {
        await completeInventoryPass(active, connectionKey, state, kind, slot.walk, attempt);
        return;
      }
    }
  } finally {
    if (kind === "threads") {
      // Ownership: a superseded segment must not release the successor's slot.
      if (state.threadsRunningAttempt === attempt) state.threadsRunningAttempt = null;
      if (reschedule || (state.pendingThreads && state.threads === null)) {
        scheduleInventory(connectionKey, "threads", 0);
      }
    } else {
      if (state.projectsRunningAttempt === attempt) state.projectsRunningAttempt = null;
      if (reschedule || (state.pendingProjects && state.projects === null)) {
        scheduleInventory(connectionKey, "projects", 0);
      }
    }
  }
}

function resetWalk(connectionKey: string, kind: CatalogKind): void {
  const state = connections.get(connectionKey);
  if (!state) return;
  if (kind === "threads") {
    state.threads = null;
    state.pendingThreads = true;
  } else {
    state.projects = null;
    state.pendingProjects = true;
  }
  scheduleInventory(connectionKey, kind, 0);
}

async function completeInventoryPass(
  active: BoundedCatalogDeps,
  connectionKey: string,
  state: BoundedCatalogConnection,
  kind: CatalogKind,
  walk: CatalogInventoryWalk,
  attempt: number,
): Promise<void> {
  await runDeletionGate(active, connectionKey, state, kind, walk, attempt);
  if (!attemptIsCurrent(connectionKey, state, attempt)) {
    // A superseded pass leaves its slot in place; the next attempt resets it.
    return;
  }
  if (kind === "threads") state.threads = null;
  else state.projects = null;
  // Follow-up scheduling stays with the segment's `finally`: the deletion gate
  // runs while this segment still owns the kind, so a direct schedule here
  // would be suppressed as "already running" and silently drop the pass.
}

async function runDeletionGate(
  active: BoundedCatalogDeps,
  connectionKey: string,
  state: BoundedCatalogConnection,
  kind: CatalogKind,
  walk: CatalogInventoryWalk,
  attempt: number,
): Promise<void> {
  const rowsFor = () =>
    kind === "threads"
      ? (active.runtimeThreads(connectionKey) ?? [])
      : (active.runtimeProjects(connectionKey) ?? []);
  const liveSeqNewer = (id: string): boolean => {
    if (kind !== "threads") return false;
    const applied = active.appliedThreadSeq(connectionKey, id);
    return applied !== undefined && applied > walk.startedSeq;
  };
  const protectedFor = (): ReadonlySet<string> =>
    kind === "threads" ? active.protectedThreadIds(connectionKey) : new Set<string>();
  const localIds = rowsFor().map((row) => row.id);
  const candidates = catalogDeletionCandidates({
    walk,
    localIds,
    protectedIds: protectedFor(),
    liveSeqNewerIds: localIds.filter(liveSeqNewer),
  });
  if (candidates.length === 0) return;
  for (const batch of chunkCatalogIds(candidates, BOUNDED_CATALOG_MEMBERSHIP_BATCH)) {
    if (!attemptIsCurrent(connectionKey, state, attempt)) return;
    const requestIds = batch.filter((id) => rowsFor().some((row) => row.id === id));
    if (requestIds.length === 0) continue;
    let answer;
    try {
      answer = await active.withClient(connectionKey, (client) =>
        client.boundedCatalogMembership(
          kind === "threads" ? { threadIds: requestIds } : { projectIds: requestIds },
        ),
      );
    } catch (error) {
      reportIfProtocolError(active, connectionKey, error);
      return;
    }
    if (!attemptIsCurrent(connectionKey, state, attempt)) return;
    const existing = new Set(
      kind === "threads" ? answer.existingThreadIds : answer.existingProjectIds,
    );
    const protectedNow = protectedFor();
    const absent = requestIds.filter((id) => {
      if (existing.has(id) || protectedNow.has(id) || liveSeqNewer(id)) return false;
      return rowsFor().some((row) => row.id === id);
    });
    if (absent.length === 0) continue;
    if (kind === "threads") active.removeThreadRows(connectionKey, absent);
    else active.removeProjectRows(connectionKey, absent);
  }
}

function reportIfProtocolError(
  active: BoundedCatalogDeps,
  connectionKey: string,
  error: unknown,
): void {
  if (isRemoteBoundedReadProtocolError(error)) {
    active.reportProtocolError(connectionKey, error);
  }
}

/** Live `remote-threads-changed` / `remote-projects-changed` scheduling. */
export function noteBoundedCatalogMembershipEvent(connectionKey: string, eventType: string): void {
  const state = connections.get(connectionKey);
  if (!state) return;
  if (eventType === "remote-projects-changed") {
    // A project delete cascades its threads host-side, so the thread catalog
    // is reconciled by the same event.
    state.pendingProjects = true;
    state.pendingThreads = true;
    scheduleInventory(connectionKey, "projects", EVENT_FOLLOW_UP_DELAY_MS);
    scheduleInventory(connectionKey, "threads", EVENT_FOLLOW_UP_DELAY_MS);
    // The event may carry a host-side reorder or a prepended row: refresh the
    // manual paint so the authoritative order converges, not just membership.
    requestManualPaintRefresh(connectionKey, "projects");
    requestManualPaintRefresh(connectionKey, "threads");
    return;
  }
  if (eventType === "remote-threads-changed") {
    state.pendingThreads = true;
    scheduleInventory(connectionKey, "threads", EVENT_FOLLOW_UP_DELAY_MS);
    requestManualPaintRefresh(connectionKey, "threads");
  }
}

/** A sequence gap / resync-required restarts both logical passes and paint. */
export function resetBoundedCatalogForResync(connectionKey: string): void {
  const state = connections.get(connectionKey);
  if (!state) return;
  beginBoundedCatalogAttempt(connectionKey);
  // A gap may hide an external reorder: declared manual-order convergence
  // re-reads page 1 for both kinds instead of waiting for the next activation.
  requestManualPaintRefresh(connectionKey, "threads");
  requestManualPaintRefresh(connectionKey, "projects");
}

export function disposeBoundedCatalog(connectionKey: string): void {
  connections.delete(connectionKey);
  legacyConnections.delete(connectionKey);
  if (connections.size === 0 && reconcileTicker !== null) {
    clearInterval(reconcileTicker);
    reconcileTicker = null;
  }
}

function startReconcileTicker(): void {
  if (reconcileTicker !== null || connections.size === 0) return;
  reconcileTicker = setInterval(() => {
    for (const [connectionKey, state] of connections) {
      const consumer = stateConsumer(state);
      if (!consumer) continue;
      if (!stateIsCurrent(connectionKey, state)) continue;
      if (consumer.deps.runtimeStatus(connectionKey) !== "online") continue;
      if (!consumer.deps.isForeground()) continue;
      const now = nowOf(consumer);
      if (
        state.lastReconcileAt !== 0 &&
        now - state.lastReconcileAt < BOUNDED_CATALOG_RECONCILE_INTERVAL_MS
      ) {
        continue;
      }
      const kind = state.reconcileKind;
      if (inventoryRunning(state, kind)) continue;
      state.lastReconcileAt = now;
      state.reconcileKind = kind === "threads" ? "projects" : "threads";
      if (kind === "threads") {
        state.threads = null;
        state.pendingThreads = true;
      } else {
        state.projects = null;
        state.pendingProjects = true;
      }
      scheduleInventory(connectionKey, kind, 0);
    }
  }, RECONCILE_TICK_MS);
}

/** Test-only: drop all controller state and timers. */
export function __resetBoundedCatalogForTest(): void {
  connections.clear();
  legacyConnections.clear();
  if (reconcileTicker !== null) {
    clearInterval(reconcileTicker);
    reconcileTicker = null;
  }
}

export type { BoundedCatalogConnection };
