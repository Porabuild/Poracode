import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { WebSocket } from "ws";
import type { RuntimeEvent, Thread } from "@/shared/contracts";
import { runtimeEventSchema } from "@/shared/contracts/runtimeEvent";
import type { LiveEventInterests } from "@/shared/liveEventInterests";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import {
  applyThreadRuntimeEventsNow,
  resetRuntimeItemsWriterCache,
} from "@/host/db/runtimeItemsWriter";
import { assembleItemStreams, readStreamTails } from "@/host/db/runtimeStreamStore";
import { RuntimeWriteQueue } from "@/host/db/runtimeWriteQueue";
import { RemoteAccessServer, type RemoteAccessServerInfo } from "./RemoteAccessServer";
import type { RemoteBroadcastEvent } from "./server/context";

/**
 * Deterministic, in-process measurement infrastructure for the §0.6
 * event-amplification qualification suite
 * (docs/V2_SERVER_ARCHITECTURE_PRODUCTION_PLAN.md). Two runners:
 *
 * - {@link runFanOutCell} stands up a real `RemoteAccessServer` with N real WS
 *   clients, each interested in one visible thread, while H hidden threads
 *   stream tiny `content.delta` events, and records frames, bytes, empty
 *   continuity envelopes, JSON serialization calls and CPU per cell.
 * - {@link runTinyDeltaAmplification} drives K one-character `content.delta`
 *   events through the real `RuntimeWriteQueue` →
 *   `applyThreadRuntimeEventsNow` → SQLite path on a throwaway database and
 *   records statement counts and physical WAL bytes.
 *
 * No production hooks are added. JSON serialization is counted by a scoped
 * `JSON.stringify` wrapper and SQLite statements by a scoped
 * `better-sqlite3` `prepare` wrapper; both are installed only inside the
 * measurement windows below and always restored.
 */

// ---------------------------------------------------------------------------
// Records and summary emission
// ---------------------------------------------------------------------------

/** One frame one client received. */
export interface FanOutFrameObservation {
  readonly kind: "ready" | "event";
  readonly seq: number;
  /** Batch-level threadId for runtime frames, `null` otherwise. */
  readonly threadId: string | null;
  /** `thread-runtime-events` carrying an empty `events` array. */
  readonly emptyEnvelope: boolean;
  readonly bytes: number;
  readonly raw: string;
}

/** Aggregated §0.6 fan-out measurements for one (N clients × H hidden threads) cell. */
export interface FanOutCellRecord {
  readonly n: number;
  readonly h: number;
  /** Probe publishes used to prove per-client interests were registered. */
  readonly interestProbePublishes: number;
  /** Measured publishes (N visible + H hidden), one `content.delta` each. */
  readonly publishes: number;
  /** Frames per client: 1 `ready` + probes + publishes (continuity contract). */
  readonly framesPerClient: number;
  readonly emptyEnvelopesPerClient: number;
  readonly emptyEnvelopeBytesPerClient: number;
  readonly ownThreadFramesPerClient: number;
  readonly ownThreadBytesPerClient: number;
  readonly bytesPerClient: number;
  readonly serializationCalls: number;
  readonly serializationCallsPerPublish: readonly number[];
  /**
   * What §0.6's "reuse identical authorized projections" bound would cost:
   * one shared serialization per publish plus at most one collapsed-envelope
   * serialization shared by every uninterested client.
   */
  readonly serializationCallsIfProjectionsShared: number;
  /** Whole-process CPU over the publish+drain window (includes the in-process ws client loops). */
  readonly cpuUserUs: number;
  readonly cpuSystemUs: number;
  readonly wallMs: number;
}

export interface FanOutCellResult {
  readonly record: FanOutCellRecord;
  readonly clientThreads: readonly string[];
  readonly hiddenThreadIds: readonly string[];
  readonly clientFrames: readonly (readonly FanOutFrameObservation[])[];
}

export interface TinyDeltaRunRecord {
  /** One-character content.delta events driven into the queue. */
  readonly k: number;
  readonly waveSize: number;
  readonly waves: number;
  /** `RuntimeWriteFlush` invocations (one coalesced batch each). */
  readonly writeCalls: number;
  /** Canonical events after coalescing, across all write calls. */
  readonly coalescedEventsTotal: number;
  readonly admittedEvents: number;
  readonly admittedBytes: number;
  readonly coalescedInputBytes: number;
  readonly coalescedOutputBytes: number;
  /** Executed SQLite statements (run/get/all/iterate; excludes BEGIN/COMMIT). */
  readonly sqliteStatements: number;
  readonly sqliteStatementsPerWave: readonly number[];
  /** Rows inserted/updated/deleted, from `totalChanges`. */
  readonly rowsChanged: number;
  /**
   * Physical bytes written: WAL growth with autocheckpoint disabled, so every
   * page write appends a frame and per-wave deltas are the exact cost.
   */
  readonly physicalWriteBytes: number;
  readonly physicalBytesPerWave: readonly number[];
  readonly dbBytesAtEnd: number;
  readonly headChars: number;
  readonly tailChunkRows: number;
  /** Reassembled head + tail equals the exact concatenated delta text. */
  readonly exactTextMatch: boolean;
}

export interface EventAmplificationSummary {
  readonly generatedAt: string;
  readonly heavyMatrix: boolean;
  readonly fanOut: readonly FanOutCellRecord[];
  readonly tinyDelta: TinyDeltaRunRecord | null;
  /** Present only under `V2_AMPLIFICATION_HEAVY` (head-freezing run past HEAD_CHARS). */
  readonly tinyDeltaHeavy: TinyDeltaRunRecord | null;
  readonly findings: readonly string[];
}

/** Emits the JSON summary when `V2_AMPLIFICATION_OUT` is set; "1"/"true"
 * selects the default `tmp/v2-event-amplification/summary.json`. */
export function writeEventAmplificationSummary(summary: EventAmplificationSummary): string | null {
  const configured = process.env.V2_AMPLIFICATION_OUT;
  if (!configured) return null;
  const path =
    configured === "1" || configured === "true"
      ? "tmp/v2-event-amplification/summary.json"
      : configured;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return path;
}

// ---------------------------------------------------------------------------
// better-sqlite3 driver availability (mirrors the other host-db suites)
// ---------------------------------------------------------------------------

const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");

export const sqliteDriver: { available: boolean; nativeBindingEnv?: string } = (() => {
  try {
    new Database(":memory:").close();
    return { available: true };
  } catch {
    if (!existsSync(serverNativeBinding)) return { available: false };
    return { available: true, nativeBindingEnv: serverNativeBinding };
  }
})();

// ---------------------------------------------------------------------------
// Scoped JSON.stringify counter
// ---------------------------------------------------------------------------

/**
 * Counts `JSON.stringify` calls inside the publish window. The §0.6 path
 * serializes once per publish in `capBroadcastEvent` plus once per per-client
 * projection that differs from the shared form
 * (`remoteAccessServerEvents.ts` per-client scoping branch), so the count
 * isolates the per-socket serialization fan-out exactly.
 */
export class SerializationCounter {
  private calls = 0;
  private readonly original = JSON.stringify;
  private installed = false;

  install(): void {
    if (this.installed) throw new Error("SerializationCounter is already installed.");
    this.installed = true;
    const counter = this;
    const original = counter.original as unknown as (
      value: unknown,
      replacer?: unknown,
      space?: unknown,
    ) => string;
    JSON.stringify = ((value?: unknown, replacer?: unknown, space?: unknown) => {
      counter.calls += 1;
      return original(value, replacer, space);
    }) as typeof JSON.stringify;
  }

  restore(): void {
    if (!this.installed) return;
    JSON.stringify = this.original;
    this.installed = false;
  }

  get current(): number {
    return this.calls;
  }

  /** Calls since `mark` — the cost of one publish. */
  since(mark: number): number {
    return this.calls - mark;
  }
}

// ---------------------------------------------------------------------------
// Scoped SQLite statement counter
// ---------------------------------------------------------------------------

interface SqliteCounters {
  readonly statements: () => number;
  /** Rows reported changed by `run()` results (INSERT/UPDATE/DELETE). */
  readonly rowsChanged: () => number;
}

/**
 * Counts executed statements (`run`/`get`/`all`/`iterate`) by wrapping
 * `Database.prototype.prepare` for the duration of `use`. better-sqlite3
 * issues transaction control (BEGIN/COMMIT) natively, so those are not
 * counted; the writer's prepared-statement cache is reset by the tiny-delta
 * runner teardown so wrapped statements never outlive the window.
 */
export function countSqliteStatements<T>(run: (counters: SqliteCounters) => T): T {
  const original = Database.prototype.prepare as unknown as (
    this: unknown,
    source: string,
    ...options: unknown[]
  ) => unknown;
  let count = 0;
  let rowsChanged = 0;
  const patched = function patchedPrepare(this: unknown, source: string, ...rest: unknown[]) {
    const statement = original.apply(this, [source, ...rest]) as Record<string, unknown>;
    const counted = (method: string) => {
      const fn = statement[method];
      if (typeof fn !== "function") return fn;
      return (...callArgs: unknown[]) => {
        count += 1;
        const result = (fn as (...callArgsInner: unknown[]) => unknown).apply(statement, callArgs);
        if (
          method === "run" &&
          result !== null &&
          typeof result === "object" &&
          typeof (result as { changes?: unknown }).changes === "number"
        ) {
          rowsChanged += (result as { changes: number }).changes;
        }
        return result;
      };
    };
    return new Proxy(statement, {
      get(target, property) {
        if (
          property === "run" ||
          property === "get" ||
          property === "all" ||
          property === "iterate"
        ) {
          return counted(property);
        }
        const value = Reflect.get(target, property);
        return typeof value === "function"
          ? (value as (...boundArgs: unknown[]) => unknown).bind(target)
          : value;
      },
    });
  };
  Database.prototype.prepare = patched as unknown as typeof Database.prototype.prepare;
  try {
    return run({ statements: () => count, rowsChanged: () => rowsChanged });
  } finally {
    Database.prototype.prepare = original as unknown as typeof Database.prototype.prepare;
  }
}

// ---------------------------------------------------------------------------
// Fan-out cell runner (RemoteAccessServer + real WS clients)
// ---------------------------------------------------------------------------

const VISIBLE_THREAD_PREFIX = "amp-visible-";
const HIDDEN_THREAD_PREFIX = "amp-hidden-";
const PROBE_THREAD = "amp-probe";

interface FanOutClient {
  readonly socket: WebSocket;
  readonly threadId: string;
  readonly frames: FanOutFrameObservation[];
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Condition not met in time.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function contentDelta(threadId: string, itemId: string, delta: string): RemoteBroadcastEvent {
  return {
    type: "thread-runtime-event",
    threadId,
    event: runtimeEventSchema.parse({
      type: "content.delta",
      threadId,
      itemId,
      stream: "assistant_text",
      delta,
    }),
  };
}

function parseFrame(text: string, bytes: number): FanOutFrameObservation {
  let parsed: {
    type?: string;
    seq?: number;
    event?: { type?: string; threadId?: string; events?: unknown[] };
  } = {};
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    // Recorded as an opaque event frame with no seq; the contiguity assertion
    // fails loudly on it.
  }
  const event = parsed.event;
  return {
    kind: parsed.type === "ready" ? "ready" : "event",
    seq: typeof parsed.seq === "number" ? parsed.seq : -1,
    threadId: typeof event?.threadId === "string" ? event.threadId : null,
    emptyEnvelope:
      event?.type === "thread-runtime-events" && Array.isArray(event.events)
        ? event.events.length === 0
        : false,
    bytes,
    raw: text,
  };
}

/**
 * Deterministic barrier on the server having processed every client's
 * `thread-item-interests` message: `notifyEventInterestsChanged` aggregates
 * all declared thread ids and reports them through the server's
 * `onEventInterestsChanged` option once per change. The aggregated union is
 * cumulative, so a report listing all n declared threads proves every
 * declaration was applied (connection-setup reports list fewer).
 */
function interestsBarrier(n: number): {
  readonly onEventInterestsChanged: (interests: LiveEventInterests) => void | Promise<void>;
  readonly wait: () => Promise<void>;
} {
  let satisfied = false;
  let waiter: (() => void) | null = null;
  return {
    onEventInterestsChanged: (interests) => {
      if (satisfied || interests.runtimeThreadIds.length < n) return;
      satisfied = true;
      const wake = waiter;
      waiter = null;
      wake?.();
    },
    wait: () =>
      satisfied ? Promise.resolve() : new Promise<void>((resolve) => (waiter = resolve)),
  };
}

/** Production admission caps sockets per principal at 16 and the pairing
 * token exchange at 20 attempts per 5 minutes, so a cell's sockets share
 * ceil(n / 16) principals instead of minting one token per client. */
const SOCKETS_PER_PRINCIPAL = 16;

async function connectFanOutClient(
  server: RemoteAccessServer,
  info: RemoteAccessServerInfo,
  index: number,
  sockets: WebSocket[],
  principalTokens: Map<number, string>,
): Promise<FanOutClient> {
  const principal = Math.floor(index / SOCKETS_PER_PRINCIPAL);
  let accessToken = principalTokens.get(principal);
  if (accessToken === undefined) {
    const pairingUrl = server.issueIndependentPairingUrl(`amp-principal-${principal}`);
    const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
    if (!credential) throw new Error("Independent pairing URL carries no credential.");
    const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential,
        scopes: ["session:read"],
        client: { label: `amp-principal-${principal}`, deviceType: "mobile" },
      }),
    });
    if (tokenResponse.status !== 200) {
      throw new Error(`Token exchange failed for principal ${principal}: ${tokenResponse.status}`);
    }
    accessToken = ((await tokenResponse.json()) as { accessToken: string }).accessToken;
    principalTokens.set(principal, accessToken);
  }
  const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (ticketResponse.status !== 200) {
    throw new Error(`Websocket ticket failed for client ${index}: ${ticketResponse.status}`);
  }
  const { ticket } = (await ticketResponse.json()) as { ticket: string };
  const url = new URL("/ws", info.wsBaseUrl);
  url.searchParams.set("ticket", ticket);
  const socket = new WebSocket(url);
  sockets.push(socket);
  const client: FanOutClient = {
    socket,
    threadId: `${VISIBLE_THREAD_PREFIX}${index}`,
    frames: [],
  };
  socket.on("message", (raw) => {
    const text = raw.toString();
    client.frames.push(parseFrame(text, Buffer.byteLength(text, "utf8")));
  });
  await onceOpen(socket);
  // Declared before any measured publish; `runFanOutCell` awaits the shared
  // barrier once all declarations are sent.
  socket.send(JSON.stringify({ type: "thread-item-interests", threadIds: [client.threadId] }));
  return client;
}

function onceOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    socket.once("open", () => resolve());
    socket.once("error", (error: Error) => reject(error));
  });
}

/**
 * Publishes one collapsed-envelope probe: with every client's interests
 * proven registered by the barrier, an undeclared thread must reach every
 * client as a content-free envelope. A full probe frame means the scoping
 * path stopped honoring declarations — a harness regression, failed loudly.
 */
async function probeItemInterests(
  server: RemoteAccessServer,
  clients: readonly FanOutClient[],
): Promise<number> {
  server.publishSupervisorEvent(contentDelta(PROBE_THREAD, "amp-probe-item", "v"));
  await waitFor(() => clients.every((client) => client.frames.length >= 2), 10_000);
  for (const client of clients) {
    const probe = client.frames[client.frames.length - 1];
    if (
      probe === undefined ||
      probe.kind !== "event" ||
      probe.threadId !== PROBE_THREAD ||
      !probe.emptyEnvelope
    ) {
      throw new Error(
        `Client ${client.threadId} received probe content: item-interest scoping did not collapse an undeclared thread.`,
      );
    }
  }
  return 1;
}

/**
 * One matrix cell: N clients each interested in one visible thread, H hidden
 * threads streaming one tiny `content.delta` each. Every client must receive
 * every publication (continuity), hidden threads only as empty envelopes, and
 * the per-socket serialization fan-out is counted inside the publish window.
 */
export async function runFanOutCell(n: number, h: number): Promise<FanOutCellResult> {
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Fan-out cells need n >= 1; got ${n}.`);
  const interests = interestsBarrier(n);
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "event-amplification-qual",
    identity: { desktopId: "event-amplification-qual", label: "Event amplification qualification" },
    host: "127.0.0.1",
    port: 0,
    ownsSupervisorPersistence: false,
    webSocketHeartbeatIntervalMs: 0,
    onEventInterestsChanged: interests.onEventInterestsChanged,
    callSupervisor: async () => {
      throw new Error("Unexpected supervisor call");
    },
  });
  const sockets: WebSocket[] = [];
  const clients: FanOutClient[] = [];
  const principalTokens = new Map<number, string>();
  try {
    const info = await server.start();
    for (let index = 0; index < n; index += 1) {
      clients.push(await connectFanOutClient(server, info, index, sockets, principalTokens));
    }
    // All n declarations processed before anything is measured.
    await interests.wait();
    const interestProbePublishes = await probeItemInterests(server, clients);

    const visibleEvents = clients.map((client) =>
      contentDelta(client.threadId, `amp-item-${client.threadId}`, "v"),
    );
    const hiddenThreadIds = Array.from(
      { length: h },
      (_, index) => `${HIDDEN_THREAD_PREFIX}${index}`,
    );
    const hiddenEvents = hiddenThreadIds.map((threadId) =>
      contentDelta(
        threadId,
        `amp-item-${threadId}`,
        `H${threadId.slice(HIDDEN_THREAD_PREFIX.length)}`,
      ),
    );

    const serialization = new SerializationCounter();
    const cpuStart = process.cpuUsage();
    const wallStart = performance.now();
    const perPublish: number[] = [];
    serialization.install();
    try {
      for (const event of [...visibleEvents, ...hiddenEvents]) {
        const mark = serialization.current;
        server.publishSupervisorEvent(event);
        perPublish.push(serialization.since(mark));
      }
      const expected = 1 + interestProbePublishes + n + h;
      await waitFor(() => clients.every((client) => client.frames.length >= expected), 10_000);
    } finally {
      serialization.restore();
    }
    const cpu = process.cpuUsage(cpuStart);
    const wallMs = performance.now() - wallStart;

    const first = clientAggregates(clients[0]!.frames, clients[0]!.threadId);
    let sharedProjectionCalls = 0;
    for (let index = 0; index < perPublish.length; index += 1) {
      // Visible publishes leave n-1 clients uninterested; hidden publishes n.
      const uninterested = index < n ? n - 1 : n;
      sharedProjectionCalls += 1 + (uninterested > 0 ? 1 : 0);
    }
    const record: FanOutCellRecord = {
      n,
      h,
      interestProbePublishes,
      publishes: n + h,
      framesPerClient: first.frames,
      emptyEnvelopesPerClient: first.emptyEnvelopes,
      emptyEnvelopeBytesPerClient: first.emptyEnvelopeBytes,
      ownThreadFramesPerClient: first.ownThreadFrames,
      ownThreadBytesPerClient: first.ownThreadBytes,
      bytesPerClient: first.bytes,
      serializationCalls: serialization.current,
      serializationCallsPerPublish: perPublish,
      serializationCallsIfProjectionsShared: sharedProjectionCalls,
      cpuUserUs: cpu.user,
      cpuSystemUs: cpu.system,
      wallMs,
    };
    return {
      record,
      clientThreads: clients.map((client) => client.threadId),
      hiddenThreadIds,
      clientFrames: clients.map((client) => client.frames),
    };
  } finally {
    for (const socket of sockets.splice(0)) socket.terminate();
    await server.dispose();
  }
}

function clientAggregates(
  frames: readonly FanOutFrameObservation[],
  ownThread: string,
): {
  frames: number;
  emptyEnvelopes: number;
  emptyEnvelopeBytes: number;
  ownThreadFrames: number;
  ownThreadBytes: number;
  bytes: number;
} {
  let emptyEnvelopes = 0;
  let emptyEnvelopeBytes = 0;
  let ownThreadFrames = 0;
  let ownThreadBytes = 0;
  let bytes = 0;
  for (const frame of frames) {
    bytes += frame.bytes;
    if (frame.emptyEnvelope) {
      emptyEnvelopes += 1;
      emptyEnvelopeBytes += frame.bytes;
    } else if (frame.kind === "event" && frame.threadId === ownThread) {
      ownThreadFrames += 1;
      ownThreadBytes += frame.bytes;
    }
  }
  return {
    frames: frames.length,
    emptyEnvelopes,
    emptyEnvelopeBytes,
    ownThreadFrames,
    ownThreadBytes,
    bytes,
  };
}

// ---------------------------------------------------------------------------
// Tiny-delta write amplification runner (real SQLite)
// ---------------------------------------------------------------------------

const TINY_DELTA_THREAD = "amp-tiny-delta-thread";
const TINY_DELTA_ITEM = "amp-tiny-delta-item";
const TINY_DELTA_STREAM = "assistant_text";
const WAVE_SIZE = 500; // equals DEFAULT_RUNTIME_FLUSH_CHUNK.maxEvents

function fileBytes(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function tinyDeltaThread(): Thread {
  return {
    id: TINY_DELTA_THREAD,
    projectId: "amp-project-1",
    title: "Event amplification tiny delta",
    agentKind: "claude:work",
    config: { model: "claude-sonnet-4" },
    status: "working",
    attention: "working",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function tinyDeltaWaveEvents(
  sent: number,
  count: number,
  expectedChunks: string[],
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    const delta = String.fromCharCode(48 + ((sent + index) % 10));
    expectedChunks.push(delta);
    events.push({
      type: "content.delta",
      threadId: TINY_DELTA_THREAD,
      itemId: TINY_DELTA_ITEM,
      stream: TINY_DELTA_STREAM,
      delta,
    });
  }
  return events;
}

/**
 * Drives K one-character `content.delta` events through the production
 * persistence path on a throwaway database: `RuntimeWriteQueue` admission →
 * `flushThread` chunking/coalescing → `applyThreadRuntimeEventsNow` →
 * `runtimeStreamStore` head/chunk layout. Autocheckpoint is disabled so WAL
 * growth per wave is the exact physical byte cost of that wave.
 */
export function runTinyDeltaAmplification(
  k: number,
  waveSize: number = WAVE_SIZE,
): TinyDeltaRunRecord {
  if (!Number.isSafeInteger(k) || k <= 0 || k % waveSize !== 0) {
    throw new Error(`Tiny-delta run needs k > 0 divisible by waveSize (${waveSize}); got ${k}.`);
  }
  const dir = mkdtempSync(join(tmpdir(), "poracode-event-amplification-"));
  const dbPath = join(dir, "state.sqlite");
  try {
    return measureTinyDeltaAmplification(dbPath, k, waveSize);
  } finally {
    resetRuntimeItemsWriterCache();
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  }
}

function measureTinyDeltaAmplification(
  dbPath: string,
  k: number,
  waveSize: number,
): TinyDeltaRunRecord {
  if (
    process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING === undefined &&
    sqliteDriver.nativeBindingEnv
  ) {
    process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = sqliteDriver.nativeBindingEnv;
  }
  initDatabase(dbPath);
  const sqlite = getSqlite();
  sqlite.pragma("wal_autocheckpoint = 0");
  sqlite.pragma("wal_checkpoint(TRUNCATE)");

  dbUpsertProject(
    {
      id: "amp-project-1",
      name: "Event amplification",
      location: { kind: "posix", path: "/tmp/poracode-event-amplification" },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    0,
  );
  dbUpsertThread(tinyDeltaThread(), 0);

  const expectedChunks: string[] = [];
  let writeCalls = 0;
  let coalescedEventsTotal = 0;
  const queue = new RuntimeWriteQueue((threadId, events) => {
    writeCalls += 1;
    coalescedEventsTotal += events.length;
    applyThreadRuntimeEventsNow(threadId, events);
  });

  // Seed the transcript item in its own flush (outside the measured window)
  // so every measured wave carries exactly `waveSize` deltas and coalesces
  // to exactly one canonical event, and so the writer's prepared-statement
  // cache is warm before counting starts.
  const seeded = queue.enqueue(TINY_DELTA_THREAD, [
    {
      type: "item.started",
      threadId: TINY_DELTA_THREAD,
      itemId: TINY_DELTA_ITEM,
      itemType: "assistant_message",
    },
  ]);
  if (seeded.kind !== "accepted") throw new Error("item.started admission refused.");
  for (;;) {
    const outcome = queue.flushThread(TINY_DELTA_THREAD);
    if (outcome.kind === "empty") break;
    if (outcome.kind === "failed") {
      throw new Error(`Seed flush failed: ${String(outcome.error)}`);
    }
  }

  let waves = 0;
  let physicalWriteBytes = 0;
  let rowsChanged = 0;
  const statementsPerWave: number[] = [];
  const physicalBytesPerWave: number[] = [];
  const walPath = `${dbPath}-wal`;

  // Drop the writer's prepared-statement cache so the first measured flush
  // re-prepares through the counting wrapper — otherwise statements cached
  // by the seed flush would bypass the counter.
  resetRuntimeItemsWriterCache();
  countSqliteStatements((counters) => {
    const rowsStart = counters.rowsChanged();
    let statementsMark = counters.statements();
    let walMark = fileBytes(walPath);
    for (let sent = 0; sent < k; sent += waveSize) {
      const wave = tinyDeltaWaveEvents(sent, Math.min(waveSize, k - sent), expectedChunks);
      const admitted = queue.enqueue(TINY_DELTA_THREAD, wave);
      if (admitted.kind !== "accepted" || admitted.refusedEvents !== 0) {
        throw new Error(
          `Wave ${waves} admission refused (${admitted.refusedEvents} events): ${admitted.reason ?? "unknown"}`,
        );
      }
      for (;;) {
        const outcome = queue.flushThread(TINY_DELTA_THREAD);
        if (outcome.kind === "empty") break;
        if (outcome.kind === "failed") {
          throw new Error(`Wave ${waves} flush failed: ${String(outcome.error)}`);
        }
      }
      waves += 1;
      const statementsNow = counters.statements();
      statementsPerWave.push(statementsNow - statementsMark);
      statementsMark = statementsNow;
      // WAL is monotonic with autocheckpoint off, so the growth per wave is
      // that wave's exact physical write cost and the final size is the run
      // total.
      const walNow = fileBytes(walPath);
      physicalBytesPerWave.push(walNow - walMark);
      walMark = walNow;
    }
    rowsChanged = counters.rowsChanged() - rowsStart;
    physicalWriteBytes = walMark;
  });

  const stats = queue.stats();
  if (stats.pendingEvents !== 0) {
    throw new Error(`Queue retained ${stats.pendingEvents} events after the tiny-delta run.`);
  }

  const itemRow = sqlite
    .prepare("SELECT streams FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?")
    .get(TINY_DELTA_THREAD, TINY_DELTA_ITEM) as { streams: string } | undefined;
  if (!itemRow) throw new Error("Item row missing after the tiny-delta run.");
  const head = JSON.parse(itemRow.streams) as Record<string, string>;
  const headChars = (head[TINY_DELTA_STREAM] ?? "").length;
  const tails = readStreamTails(sqlite, TINY_DELTA_THREAD, [TINY_DELTA_ITEM]).get(TINY_DELTA_ITEM);
  const assembled = assembleItemStreams(head, tails)[TINY_DELTA_STREAM] ?? "";
  const exactTextMatch = assembled === expectedChunks.join("");

  const tailChunkRows = (
    sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM thread_runtime_item_stream_chunks WHERE thread_id = ? AND item_id = ?",
      )
      .get(TINY_DELTA_THREAD, TINY_DELTA_ITEM) as { n: number }
  ).n;

  sqlite.pragma("wal_checkpoint(TRUNCATE)");
  const dbBytesAtEnd = fileBytes(dbPath);

  return {
    k,
    waveSize,
    waves,
    writeCalls,
    coalescedEventsTotal,
    admittedEvents: stats.admittedEvents,
    admittedBytes: stats.admittedBytes,
    coalescedInputBytes: stats.coalescedInputBytes,
    coalescedOutputBytes: stats.coalescedOutputBytes,
    sqliteStatements: statementsPerWave.reduce((total, wave) => total + wave, 0),
    sqliteStatementsPerWave: statementsPerWave,
    rowsChanged,
    physicalWriteBytes,
    physicalBytesPerWave,
    dbBytesAtEnd,
    headChars,
    tailChunkRows,
    exactTextMatch,
  };
}
