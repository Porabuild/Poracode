import { spawn as spawnChild, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  RequestError,
  type AnyMessage,
  type Client,
  type CompleteElicitationNotification,
  type CreateElicitationRequest,
  type CreateElicitationResponse,
  type InitializeRequest,
  type InitializeResponse,
  type RequestPermissionRequest,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import { awaitProcessTermination } from "@/shared/awaitProcessTermination";
import { toErrorMessage } from "@/shared/errorMessage";
import type { CommandSpec } from "../base";
import { ACP_STDOUT_QUEUED_BYTES, createAcpInboundStream } from "./sessionInboundStream";

/**
 * Shared ACP agent processes.
 *
 * One spawned agent process can host several ACP sessions: a single
 * `initialize` handshake serves every member, and each member lease owns one
 * ACP session (`session/new`, `session/load`, `session/resume`) on top of the
 * shared transport. The router below is the single agent→client `Client` the
 * process's `ClientSideConnection` sees; it attributes every inbound message
 * to the member that owns the addressed `sessionId` (or, for unaddressed
 * extension traffic, per the configured policy) and fans process-wide signals
 * (stderr, transport close, outbound writes) out to every attached member.
 *
 * Pool membership is keyed by scope plus the full launch identity — command,
 * normalized env, platform, the initialize request, and the prepare key — so
 * two threads only share a process when everything that shapes the agent's
 * behavior is identical. `command.cwd` is deliberately excluded: the process
 * always spawns in a private empty directory because members' project paths
 * differ and agents may derive per-process state (for example stdio MCP
 * servers) from their working directory. A member cap
 * (`maxSessionsPerProcess`) bounds how many threads one process — and one
 * crash — can carry; identical specs simply span several entries.
 *
 * Member retirement prefers graceful `session/cancel` + `session/close`.
 * When close fails for a member whose turn already settled, the entry
 * quarantines instead of killing the process: the member's session ids are
 * abandoned (late notifications drop, requests get an immediate refusal),
 * the entry drains so nothing new joins, and surviving members keep working.
 * The process is terminated only when the failing member still has agent
 * work in flight, when its last member leaves, or on shutdown.
 */

/** Default cap on leased members per shared process; bounds one crash's blast radius. */
export const DEFAULT_MAX_SESSIONS_PER_PROCESS = 8;

/** Options controlling how a shared ACP process is pooled and attributed. */
export interface AcpSharedProcessOptions {
  /** Pool namespace (the adapter kind); shutdownSharedAcpProcesses(scope) releases it. */
  readonly scope: string;
  /** Process-scoped setup created once per shared process before spawn, removed after it exits. */
  readonly prepare?: AcpSharedProcessPrepare;
  /**
   * Attribution of agent→client requests WITHOUT a sessionId. "reject"
   * (default) answers methodNotFound; "single-active-session" routes to the
   * only member whose session has agent work in flight — or, when several
   * members are working, to the first when they all report the same defined
   * `unaddressedRouteKey` (members with equal keys answer identically) —
   * methodNotFound otherwise.
   */
  readonly unaddressedRequests?: "reject" | "single-active-session";
  /**
   * Maximum leased members (reserved records count) one process serves;
   * further acquirers spawn an additional process under the same key.
   * Defaults to DEFAULT_MAX_SESSIONS_PER_PROCESS. Not part of the pool key.
   */
  readonly maxSessionsPerProcess?: number;
}

/** Process-scoped setup materialized once per shared process. */
export interface AcpSharedProcessPrepare {
  /** Identifies everything materialize() produces; only equal keys share a process. */
  readonly key: string;
  materialize(): Promise<{
    readonly env?: Readonly<Record<string, string>>;
    cleanup(): Promise<void>;
  }>;
}

/** Per-session callbacks the shared transport delivers to one lease holder. */
export interface AcpSharedProcessMember {
  readonly client: Client;
  onTransportClosed(exitCode: number | null): void;
  onStderr(text: string): void;
  onBeforeWrite(message: AnyMessage): void;
  hasAgentWork(): boolean;
  /**
   * Optional affinity key for unaddressed-request routing under
   * "single-active-session": members with equal keys answer unaddressed
   * requests identically, so several working members sharing a key can
   * safely receive the request. `undefined` never matches.
   */
  unaddressedRouteKey?(): string | undefined;
}

/** One member's hold on a shared ACP process: one connection view, one session. */
export interface AcpSharedProcessLease {
  readonly connection: ClientSideConnection;
  readonly initialized: Promise<InitializeResponse>;
  /** Register this lease's session callbacks. Exactly once, before any open. */
  attach(member: AcpSharedProcessMember): void;
  /** Open a known session id (load/resume); the id routes to this member during the RPC. */
  openKnown<T>(sessionId: string, open: () => Promise<T>): Promise<T>;
  /** Open a new session; its id registers and flushes buffered notifications on success. */
  openNew<T extends { sessionId: string }>(open: () => Promise<T>): Promise<T>;
  /** Idempotent; resolves only when this member's retirement is confirmed. */
  release(): Promise<void>;
}

/** Everything needed to acquire (or join) a shared ACP process. */
export interface AcpSharedProcessSpec {
  readonly options: AcpSharedProcessOptions;
  readonly command: CommandSpec;
  readonly initializeRequest: InitializeRequest;
  readonly suppressStderrLogging?: boolean;
}

const OPEN_REGISTRATION_TIMEOUT_MS = 10_000;
const CLOSE_RETRY_DEADLINE_MS = 5_000;
const CLOSE_RETRY_INTERVAL_MS = 250;
const OPEN_WAIT_POLL_MS = 25;
const MAX_BUFFERED_NOTIFICATIONS = 512;
const MAX_TRACKED_REQUESTS = 1024;

/**
 * Returned by a dispatch `invoke` when the owning member does not implement
 * the requested client method. Distinct from a `void` result, which several
 * SDK client methods (`fs/write_text_file`, `terminal/release`,
 * `terminal/kill`) legitimately return on success.
 */
const METHOD_MISSING: unique symbol = Symbol("acp.shared.methodMissing");

type PendingNotification = () => void;

interface MemberRecord {
  member: AcpSharedProcessMember | undefined;
  readonly sessionIds: Set<string>;
  opensInFlight: number;
  released: boolean;
  releasePromise: Promise<void> | undefined;
}

function createMemberRecord(): MemberRecord {
  return {
    member: undefined,
    sessionIds: new Set(),
    opensInFlight: 0,
    released: false,
    releasePromise: undefined,
  };
}

function sessionIdOf(params: unknown): string | undefined {
  if (typeof params !== "object" || params === null) return undefined;
  const sessionId = (params as { sessionId?: unknown }).sessionId;
  return typeof sessionId === "string" ? sessionId : undefined;
}

function isOutboundRequest(message: AnyMessage): message is AnyMessage & {
  id: string | number;
  method: string;
  params?: unknown;
} {
  return (
    typeof message === "object" &&
    message !== null &&
    "method" in message &&
    "id" in message &&
    (message as { id?: unknown }).id !== undefined &&
    (message as { id?: unknown }).id !== null
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Race a promise against the shared close deadline. The underlying request is
 * left running — its late settlement is absorbed by the race — so a wedged
 * agent can never hold `release()` past the deadline.
 */
function withDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new Error("deadline exceeded"));
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("timed out")), remaining);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

class SharedAcpProcessEntry {
  private readonly spec: AcpSharedProcessSpec;
  private readonly key: string;

  private child: ChildProcess | undefined;
  private privateDir: string | undefined;
  private prepared:
    | { readonly env?: Readonly<Record<string, string>>; cleanup(): Promise<void> }
    | undefined;
  private connection: ClientSideConnection | undefined;
  private initialized: Promise<InitializeResponse> | undefined;
  private readonly router: Client;

  private readonly ready: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (error: unknown) => void;

  private readonly members = new Set<MemberRecord>();
  private readonly sessionOwners = new Map<string, MemberRecord>();
  private readonly pendingNotifications = new Map<string, PendingNotification[]>();
  private readonly registrationWaiters = new Map<string, Set<() => void>>();
  private readonly openNewQueue: MemberRecord[] = [];
  private openNewInFlight = 0;
  private readonly requestSessionById = new Map<string | number, string>();
  private readonly requestMemberById = new Map<string | number, MemberRecord>();

  private closeSupported = false;
  private drained = false;
  private processExited = false;
  private transportNotified = false;
  private exitCode: number | null = null;
  private termination: Promise<void> | undefined;
  private cleanupPromise: Promise<void> | undefined;
  /** Session ids whose member was quarantined: late traffic is answered by the router. */
  private readonly abandonedSessionIds = new Set<string>();

  constructor(key: string, spec: AcpSharedProcessSpec) {
    this.key = key;
    this.spec = spec;
    this.router = this.buildRouter();
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // The ready promise is awaited by every acquirer; attach a no-op handler so
    // a boot failure observed before any acquire cannot surface as unhandled.
    this.ready.catch(() => undefined);
    void this.boot();
  }

  get scope(): string {
    return this.spec.options.scope;
  }

  /** Drained entries take no new members; shutdown still reaches them via the scope set. */
  isDrained(): boolean {
    return this.drained;
  }

  /** Reserved member records count toward the per-process session cap. */
  memberCount(): number {
    return this.members.size;
  }

  private async boot(): Promise<void> {
    try {
      const prepared = this.spec.options.prepare
        ? await this.spec.options.prepare.materialize()
        : undefined;
      this.prepared = prepared;
      this.privateDir = await mkdtemp(join(tmpdir(), "poracode-acp-shared-"));
      const child = spawnChild(this.spec.command.command, this.spec.command.args, {
        cwd: this.privateDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          TERM: "xterm-256color",
          ...(this.spec.command.env ?? {}),
          ...(prepared?.env ?? {}),
        },
        shell: false,
        windowsHide: true,
        detached: process.platform !== "win32",
      });
      this.child = child;
      child.stderr?.on("data", (chunk: Buffer | string) => {
        this.onStderr(String(chunk));
      });
      child.once("exit", (code) => {
        this.onChildExit(code);
      });
      const spawnReady = new Promise<void>((resolve, reject) => {
        child.on("error", (error) => {
          console.log("[acp] spawn error:", error.message);
          reject(new Error(`ACP agent failed to start: ${error.message}`));
        });
        child.on("spawn", () => {
          resolve();
        });
      });
      await spawnReady;
      const toAgent = Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>;
      const fromAgent = Readable.toWeb(child.stdout!, {
        strategy: {
          highWaterMark: ACP_STDOUT_QUEUED_BYTES,
          size: (chunk: Uint8Array) => chunk.byteLength,
        },
      }) as ReadableStream<Uint8Array>;
      const stream = createAcpInboundStream(toAgent, fromAgent, {
        onBeforeWrite: (message) => this.onBeforeWrite(message),
      });
      this.connection = new ClientSideConnection((_agent) => this.router, stream);
      this.initialized = this.connection.initialize(this.spec.initializeRequest);
      void this.initialized.then(
        (result) => {
          this.closeSupported = result.agentCapabilities?.sessionCapabilities?.close !== undefined;
          if (!this.closeSupported) this.drain();
        },
        (error: unknown) => {
          console.log("[acp] shared initialize failed:", toErrorMessage(error));
          this.drain();
        },
      );
      void this.connection.closed.then(() => {
        // Defer one turn so a concurrent child exit can supply the exit code.
        setImmediate(() => this.notifyTransportClosed());
      });
      this.resolveReady();
    } catch (error) {
      this.rejectReady(error);
      this.drain();
      // Terminate rather than only cleaning up: a child that spawned before a
      // later setup step threw must not be left running unsupervised.
      await this.terminate();
    }
  }

  async acquire(): Promise<AcpSharedProcessLease> {
    // Reserve synchronously, before awaiting ready: a concurrent last-member
    // release must see this record and keep the process alive for the joiner.
    const record = createMemberRecord();
    this.members.add(record);
    try {
      await this.ready;
    } catch (error) {
      this.members.delete(record);
      throw error;
    }
    const entry = this;
    return {
      connection: entry.connection!,
      initialized: entry.initialized!,
      attach(member: AcpSharedProcessMember): void {
        entry.attachMember(record, member);
      },
      openKnown<T>(sessionId: string, open: () => Promise<T>): Promise<T> {
        return entry.openKnown(record, sessionId, open);
      },
      openNew<T extends { sessionId: string }>(open: () => Promise<T>): Promise<T> {
        return entry.openNew(record, open);
      },
      release(): Promise<void> {
        return entry.releaseMember(record);
      },
    };
  }

  private attachMember(record: MemberRecord, member: AcpSharedProcessMember): void {
    if (record.member !== undefined || record.released) {
      throw new Error("ACP shared lease member was already attached or released.");
    }
    record.member = member;
    if (this.transportNotified) {
      // The transport closed before this member attached: deliver the close
      // outcome on the next tick, mirroring members that were attached.
      const code = this.exitCode ?? this.child?.exitCode ?? null;
      setImmediate(() => member.onTransportClosed(code));
    }
  }

  private attachedMembers(): AcpSharedProcessMember[] {
    const members: AcpSharedProcessMember[] = [];
    for (const record of this.members) {
      if (record.member !== undefined && !record.released) members.push(record.member);
    }
    return members;
  }

  private assertRecordOpen(record: MemberRecord): void {
    if (record.released) {
      throw new Error("ACP shared lease was released.");
    }
  }

  private async openKnown<T>(
    record: MemberRecord,
    sessionId: string,
    open: () => Promise<T>,
  ): Promise<T> {
    this.assertRecordOpen(record);
    const existing = this.sessionOwners.get(sessionId);
    if (existing !== undefined && existing !== record) {
      throw new Error(`ACP session ${sessionId} is already open on this shared process.`);
    }
    // Register before the RPC so replayed session/update traffic routes here.
    this.sessionOwners.set(sessionId, record);
    // A live owner supersedes any earlier quarantine of the same id.
    this.abandonedSessionIds.delete(sessionId);
    record.sessionIds.add(sessionId);
    record.opensInFlight++;
    this.notifySessionRegistered(sessionId);
    try {
      return await open();
    } catch (error) {
      if (this.sessionOwners.get(sessionId) === record) {
        this.unregisterSession(record, sessionId);
      }
      throw error;
    } finally {
      record.opensInFlight--;
    }
  }

  private async openNew<T extends { sessionId: string }>(
    record: MemberRecord,
    open: () => Promise<T>,
  ): Promise<T> {
    this.assertRecordOpen(record);
    record.opensInFlight++;
    this.openNewInFlight++;
    this.openNewQueue.push(record);
    try {
      const result = await open();
      const sessionId = result.sessionId;
      const existing = this.sessionOwners.get(sessionId);
      if (existing !== undefined && existing !== record) {
        throw new Error(`ACP session ${sessionId} is already open on this shared process.`);
      }
      this.sessionOwners.set(sessionId, record);
      this.abandonedSessionIds.delete(sessionId);
      record.sessionIds.add(sessionId);
      this.notifySessionRegistered(sessionId);
      this.flushNotifications(sessionId);
      return result;
    } finally {
      record.opensInFlight--;
      this.openNewInFlight--;
      const queued = this.openNewQueue.indexOf(record);
      if (queued >= 0) this.openNewQueue.splice(queued, 1);
      if (this.openNewInFlight === 0) this.pendingNotifications.clear();
    }
  }

  private notifySessionRegistered(sessionId: string): void {
    const waiters = this.registrationWaiters.get(sessionId);
    if (waiters === undefined) return;
    this.registrationWaiters.delete(sessionId);
    for (const wake of waiters) wake();
  }

  private flushNotifications(sessionId: string): void {
    const pending = this.pendingNotifications.get(sessionId);
    if (pending === undefined) return;
    this.pendingNotifications.delete(sessionId);
    for (const deliver of pending) deliver();
  }

  private unregisterSession(record: MemberRecord, sessionId: string): void {
    if (this.sessionOwners.get(sessionId) === record) {
      this.sessionOwners.delete(sessionId);
    }
    record.sessionIds.delete(sessionId);
    this.pendingNotifications.delete(sessionId);
  }

  private async resolveSessionMember(sessionId: string): Promise<MemberRecord> {
    const known = this.sessionOwners.get(sessionId);
    if (known !== undefined) return known;
    if (this.abandonedSessionIds.has(sessionId)) {
      throw RequestError.invalidParams({ message: "ACP session was closed" });
    }
    if (this.openNewInFlight > 0) {
      const record = await this.waitForRegistration(sessionId, OPEN_REGISTRATION_TIMEOUT_MS);
      if (record !== undefined) return record;
      if (this.abandonedSessionIds.has(sessionId)) {
        throw RequestError.invalidParams({ message: "ACP session was closed" });
      }
    }
    throw RequestError.invalidParams({
      message: `Unknown ACP session on this shared process: ${sessionId}`,
    });
  }

  private waitForRegistration(
    sessionId: string,
    timeoutMs: number,
  ): Promise<MemberRecord | undefined> {
    return new Promise((resolve) => {
      let waiters = this.registrationWaiters.get(sessionId);
      if (waiters === undefined) {
        waiters = new Set();
        this.registrationWaiters.set(sessionId, waiters);
      }
      const timer = setTimeout(() => {
        waiters.delete(wake);
        if (waiters.size === 0) this.registrationWaiters.delete(sessionId);
        resolve(this.sessionOwners.get(sessionId));
      }, timeoutMs);
      const wake = () => {
        clearTimeout(timer);
        resolve(this.sessionOwners.get(sessionId));
      };
      waiters.add(wake);
      // The id may have registered between the caller's check and this wait.
      if (this.sessionOwners.has(sessionId)) wake();
    });
  }

  private bufferNotification(sessionId: string, deliver: PendingNotification): void {
    let pending = this.pendingNotifications.get(sessionId);
    if (pending === undefined) {
      pending = [];
      this.pendingNotifications.set(sessionId, pending);
    }
    if (pending.length >= MAX_BUFFERED_NOTIFICATIONS) {
      console.warn(
        "[acp] dropping buffered agent notification for unregistered session %s (buffer full)",
        sessionId,
      );
      return;
    }
    pending.push(deliver);
  }

  private dispatchSessionNotification<P extends { sessionId?: unknown }>(
    params: P,
    invoke: (member: AcpSharedProcessMember, params: P) => void | Promise<void>,
  ): void | Promise<void> {
    const sessionId = sessionIdOf(params);
    if (sessionId === undefined) return undefined;
    if (this.abandonedSessionIds.has(sessionId)) return undefined;
    const owner = this.sessionOwners.get(sessionId);
    if (owner?.member !== undefined) {
      return invoke(owner.member, params);
    }
    if (this.openNewInFlight > 0) {
      this.bufferNotification(sessionId, () => {
        const resolved = this.sessionOwners.get(sessionId);
        if (resolved?.member !== undefined) {
          try {
            void Promise.resolve(invoke(resolved.member, params)).catch((error: unknown) => {
              console.warn("[acp] buffered agent notification failed:", toErrorMessage(error));
            });
          } catch (error) {
            console.warn("[acp] buffered agent notification failed:", toErrorMessage(error));
          }
        }
      });
    }
    return undefined;
  }

  private async dispatchSessionRequest<P extends object, R>(
    params: P,
    method: string,
    invoke: (
      member: AcpSharedProcessMember,
      params: P,
    ) => Promise<R | typeof METHOD_MISSING> | R | typeof METHOD_MISSING,
  ): Promise<R> {
    const sessionId = sessionIdOf(params);
    if (sessionId === undefined) {
      throw RequestError.invalidParams({
        message: `ACP ${method} request is missing a sessionId.`,
      });
    }
    if (this.abandonedSessionIds.has(sessionId)) {
      return this.refuseClosedSessionRequest<R>(method);
    }
    const record = await this.resolveSessionMember(sessionId);
    if (record.released) {
      // The member's dispose already ran: its sessions stay registered only
      // until close finishes, and nothing will ever answer a new request.
      return this.refuseClosedSessionRequest<R>(method);
    }
    const member = record.member;
    if (member === undefined) {
      throw RequestError.invalidParams({ message: `Unknown ACP session: ${sessionId}` });
    }
    const result = await invoke(member, params);
    if (result === METHOD_MISSING) {
      throw RequestError.methodNotFound(method);
    }
    return result;
  }

  /**
   * The pool's answer for a session it can no longer route — a quarantined
   * id, or one owned by a member whose release is in progress: a permission
   * request resolves cancelled, everything else is refused as closed.
   */
  private refuseClosedSessionRequest<R>(method: string): R {
    if (method === "session/request_permission") {
      return { outcome: { outcome: "cancelled" } } as unknown as R;
    }
    throw RequestError.invalidParams({ message: "ACP session was closed" });
  }

  private memberForRequestId(requestId: unknown): MemberRecord | undefined {
    if (requestId === undefined || requestId === null) return undefined;
    const sessionId = this.requestSessionById.get(requestId as string | number);
    if (sessionId !== undefined) {
      const owner = this.sessionOwners.get(sessionId);
      if (owner !== undefined && !owner.released) return owner;
    }
    const member = this.requestMemberById.get(requestId as string | number);
    return member !== undefined && !member.released ? member : undefined;
  }

  private unaddressedMember(method: string): AcpSharedProcessMember {
    if (this.spec.options.unaddressedRequests === "single-active-session") {
      const working = this.attachedMembers().filter((member) => member.hasAgentWork());
      if (working.length === 1) return working[0]!;
      if (working.length > 1) {
        // Several sessions are working: the request is only safe to route
        // when every candidate answers it identically — equal defined
        // unaddressedRouteKey values (for example the same project cwd).
        const keys = working.map((member) => member.unaddressedRouteKey?.());
        const first = keys[0];
        if (first !== undefined && keys.every((key) => key === first)) {
          return working[0]!;
        }
      }
    }
    throw RequestError.methodNotFound(method);
  }

  private rememberRequest<T>(map: Map<string | number, T>, id: string | number, value: T): void {
    map.delete(id);
    map.set(id, value);
    if (map.size > MAX_TRACKED_REQUESTS) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
  }

  private onBeforeWrite(message: AnyMessage): void {
    if (isOutboundRequest(message)) {
      const sessionId = sessionIdOf(message.params);
      if (sessionId !== undefined) {
        this.rememberRequest(this.requestSessionById, message.id, sessionId);
      } else if (message.method === "session/new") {
        const record = this.openNewQueue.shift();
        if (record !== undefined) {
          this.rememberRequest(this.requestMemberById, message.id, record);
        }
      }
    }
    for (const member of this.attachedMembers()) {
      member.onBeforeWrite(message);
    }
  }

  private onStderr(text: string): void {
    if (this.spec.suppressStderrLogging !== true) {
      console.log("[acp stderr]", text.trimEnd());
    }
    for (const member of this.attachedMembers()) {
      member.onStderr(text);
    }
  }

  private onChildExit(code: number | null): void {
    this.processExited = true;
    this.exitCode = code;
    this.drain();
    void this.cleanupProcess();
    this.notifyTransportClosed();
  }

  private notifyTransportClosed(): void {
    if (this.transportNotified) return;
    this.transportNotified = true;
    const code = this.exitCode ?? this.child?.exitCode ?? null;
    for (const member of this.attachedMembers()) {
      member.onTransportClosed(code);
    }
  }

  private drain(): void {
    if (this.drained) return;
    this.drained = true;
    const entries = sharedProcesses.get(this.key);
    if (entries !== undefined) {
      const index = entries.indexOf(this);
      if (index >= 0) entries.splice(index, 1);
      if (entries.length === 0) sharedProcesses.delete(this.key);
    }
    // Scope membership is released by cleanupProcess() once the process has
    // exited, so shutdownSharedAcpProcesses still reaches entries that
    // drained while their process stayed alive (missing close capability,
    // initialize failure, escalation, quarantine).
  }

  private cleanupProcess(): Promise<void> {
    this.cleanupPromise ??= (async () => {
      try {
        if (this.prepared !== undefined) {
          try {
            await this.prepared.cleanup();
          } catch (error) {
            console.warn("[acp] shared process prepare cleanup failed:", toErrorMessage(error));
          }
        }
        if (this.privateDir !== undefined) {
          await rm(this.privateDir, { recursive: true, force: true }).catch((error: unknown) => {
            console.warn("[acp] shared process cwd cleanup failed:", toErrorMessage(error));
          });
        }
      } finally {
        const scoped = sharedProcessScopes.get(this.scope);
        scoped?.delete(this);
        if (scoped !== undefined && scoped.size === 0) {
          sharedProcessScopes.delete(this.scope);
        }
      }
    })();
    return this.cleanupPromise;
  }

  terminate(): Promise<void> {
    this.termination ??= (async () => {
      this.drain();
      try {
        if (this.child !== undefined) {
          await awaitProcessTermination(this.child, {
            ownedProcessGroup: process.platform !== "win32",
          });
        }
      } finally {
        await this.cleanupProcess();
      }
    })();
    return this.termination;
  }

  private async closeSessionId(sessionId: string): Promise<boolean> {
    const connection = this.connection;
    if (connection === undefined) return false;
    const deadline = Date.now() + CLOSE_RETRY_DEADLINE_MS;
    for (;;) {
      try {
        await withDeadline(connection.cancel({ sessionId }), deadline);
      } catch {
        // session/cancel is a notification; a dead transport surfaces on close.
      }
      try {
        await withDeadline(connection.closeSession({ sessionId }), deadline);
        return true;
      } catch {
        const remaining = deadline - Date.now();
        if (this.processExited || remaining <= 0) return false;
        await sleep(Math.min(CLOSE_RETRY_INTERVAL_MS, remaining));
      }
    }
  }

  private releaseMember(record: MemberRecord): Promise<void> {
    if (record.releasePromise !== undefined) return record.releasePromise;
    record.released = true;
    record.releasePromise = this.performRelease(record);
    return record.releasePromise;
  }

  private async performRelease(record: MemberRecord): Promise<void> {
    try {
      const opensDeadline = Date.now() + OPEN_REGISTRATION_TIMEOUT_MS;
      while (record.opensInFlight > 0 && Date.now() < opensDeadline) {
        await sleep(OPEN_WAIT_POLL_MS);
      }
      if (record.opensInFlight > 0) {
        // An open that never settled cannot be safely closed; retire the process.
        await this.terminate();
        return;
      }
      if (!this.processExited && this.child !== undefined) {
        if (this.initialized !== undefined) {
          // closeSupported defaults to false until initialize settles, so
          // wait for it (bounded) before deciding; an initialize that
          // rejects or never answers leaves nothing to close — terminate.
          const initializedOk = await withDeadline(
            this.initialized.then(
              () => true,
              () => false,
            ),
            Date.now() + OPEN_REGISTRATION_TIMEOUT_MS,
          ).catch(() => false);
          if (!initializedOk) {
            await this.terminate();
            return;
          }
        }
        if (!this.closeSupported) {
          if (this.members.size === 1) {
            await this.terminate();
            return;
          }
          // The agent has no session/close but siblings remain: cancel each
          // of the member's sessions and give the agent a bounded window to
          // settle its turns, then retire it like a failed close.
          const cancelDeadline = Date.now() + CLOSE_RETRY_DEADLINE_MS;
          for (;;) {
            const connection = this.connection;
            if (connection !== undefined) {
              for (const sessionId of [...record.sessionIds]) {
                try {
                  await withDeadline(connection.cancel({ sessionId }), cancelDeadline);
                } catch {
                  // session/cancel is a notification; a dead transport
                  // surfaces through the close path.
                }
              }
            }
            if (record.member?.hasAgentWork() !== true) break;
            const remaining = cancelDeadline - Date.now();
            if (this.processExited || remaining <= 0) break;
            await sleep(Math.min(CLOSE_RETRY_INTERVAL_MS, remaining));
          }
          if (await this.retireUnclosedMember(record)) return;
        } else {
          let closeFailed = false;
          for (const sessionId of [...record.sessionIds]) {
            if (await this.closeSessionId(sessionId)) {
              this.unregisterSession(record, sessionId);
            } else {
              closeFailed = true;
              break;
            }
          }
          if (closeFailed && (await this.retireUnclosedMember(record))) return;
        }
      } else {
        for (const sessionId of [...record.sessionIds]) {
          this.unregisterSession(record, sessionId);
        }
      }
    } finally {
      this.members.delete(record);
      if (this.members.size === 0) {
        this.drain();
        await this.terminate();
      }
    }
  }

  /**
   * Shared tail of a close the agent could not complete — an advertised
   * session/close that kept failing, or no close support at all. A member
   * whose turn still has agent work can only be stopped by killing the
   * process; a settled member's session ids are quarantined so siblings keep
   * working. Abandoned ids stay routable answers — notifications drop,
   * requests get an immediate refusal — and the drained entry serves only
   * its surviving members until the last one releases. Returns true when the
   * process was terminated.
   */
  private async retireUnclosedMember(record: MemberRecord): Promise<boolean> {
    if (record.member?.hasAgentWork() === true) {
      // The agent ignored cancel and may still be acting on the session;
      // only killing the process stops it.
      await this.terminate();
      return true;
    }
    for (const sessionId of [...record.sessionIds]) {
      this.unregisterSession(record, sessionId);
      this.abandonedSessionIds.add(sessionId);
      this.notifySessionRegistered(sessionId);
    }
    this.drain();
    return false;
  }

  private buildRouter(): Client {
    return {
      requestPermission: (params: RequestPermissionRequest) =>
        this.dispatchSessionRequest(params, "session/request_permission", (member) =>
          member.client.requestPermission(params),
        ),
      sessionUpdate: (params: SessionNotification) =>
        this.dispatchSessionNotification(params, (member) => member.client.sessionUpdate(params)),
      readTextFile: (params) =>
        this.dispatchSessionRequest(params, "fs/read_text_file", (member) =>
          member.client.readTextFile === undefined
            ? METHOD_MISSING
            : member.client.readTextFile(params),
        ),
      writeTextFile: (params) =>
        this.dispatchSessionRequest(params, "fs/write_text_file", (member) =>
          member.client.writeTextFile === undefined
            ? METHOD_MISSING
            : member.client.writeTextFile(params),
        ),
      createTerminal: (params) =>
        this.dispatchSessionRequest(params, "terminal/create", (member) =>
          member.client.createTerminal === undefined
            ? METHOD_MISSING
            : member.client.createTerminal(params),
        ),
      terminalOutput: (params) =>
        this.dispatchSessionRequest(params, "terminal/output", (member) =>
          member.client.terminalOutput === undefined
            ? METHOD_MISSING
            : member.client.terminalOutput(params),
        ),
      releaseTerminal: (params) =>
        this.dispatchSessionRequest(params, "terminal/release", (member) =>
          member.client.releaseTerminal === undefined
            ? METHOD_MISSING
            : member.client.releaseTerminal(params),
        ),
      waitForTerminalExit: (params) =>
        this.dispatchSessionRequest(params, "terminal/wait_for_exit", (member) =>
          member.client.waitForTerminalExit === undefined
            ? METHOD_MISSING
            : member.client.waitForTerminalExit(params),
        ),
      killTerminal: (params) =>
        this.dispatchSessionRequest(params, "terminal/kill", (member) =>
          member.client.killTerminal === undefined
            ? METHOD_MISSING
            : member.client.killTerminal(params),
        ),
      createElicitation: (params: CreateElicitationRequest) => this.dispatchElicitation(params),
      completeElicitation: (params: CompleteElicitationNotification) =>
        this.dispatchElicitationComplete(params),
      extNotification: (method: string, params: Record<string, unknown>) =>
        this.dispatchSessionNotification(params, (member) =>
          member.client.extNotification?.(method, params),
        ),
      extMethod: (method: string, params: Record<string, unknown>) =>
        this.dispatchExtMethod(method, params),
    };
  }

  private async dispatchElicitation(
    params: CreateElicitationRequest,
  ): Promise<CreateElicitationResponse> {
    const sessionId = sessionIdOf(params);
    if (sessionId !== undefined) {
      return this.dispatchSessionRequest(params, "elicitation/create", (member) =>
        member.client.createElicitation === undefined
          ? METHOD_MISSING
          : member.client.createElicitation(params),
      );
    }
    const requestId = (params as { requestId?: unknown }).requestId;
    const member = this.memberForRequestId(requestId)?.member;
    if (member === undefined) {
      // No sessionId and no in-flight request to attribute: guessing a
      // member could show one thread another thread's prompt.
      throw RequestError.invalidParams({
        message: "ACP elicitation request cannot be attributed to a session.",
      });
    }
    const result = await member.client.createElicitation?.(params);
    if (result === undefined) {
      throw RequestError.methodNotFound("elicitation/create");
    }
    return result;
  }

  private async dispatchElicitationComplete(
    params: CompleteElicitationNotification,
  ): Promise<void> {
    // The notification carries only an elicitationId — no sessionId or request
    // correlation — so every attached member sees it and matches the id
    // against the elicitations it owns.
    await Promise.all(
      this.attachedMembers().map((member) =>
        Promise.resolve(member.client.completeElicitation?.(params)).catch((error: unknown) => {
          console.warn("[acp] elicitation completion delivery failed:", toErrorMessage(error));
        }),
      ),
    );
  }

  private async dispatchExtMethod(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (sessionIdOf(params) !== undefined) {
      return this.dispatchSessionRequest(params, method, (member) =>
        member.client.extMethod === undefined
          ? METHOD_MISSING
          : member.client.extMethod(method, params),
      );
    }
    const member = this.unaddressedMember(method);
    const result = await member.client.extMethod?.(method, params);
    if (result === undefined) {
      throw RequestError.methodNotFound(method);
    }
    return result;
  }
}

/** Joinable entries per pool key; identical specs may span several capped processes. */
const sharedProcesses = new Map<string, SharedAcpProcessEntry[]>();
const sharedProcessScopes = new Map<string, Set<SharedAcpProcessEntry>>();

/**
 * Env entries that carry per-shell-instance or per-directory bookkeeping
 * rather than launch identity: every probe of the same project produces
 * different values (session keys, shell instance paths, direnv scratch
 * state, the shell's own PWD/OLDPWD/SHLVL/`_`) without changing what the
 * agent can observe. Every other entry — including every exported variable
 * such as `GH_*` or `JAVA_HOME` — stays in the key, so a process spawned
 * with one project's env can never be joined by a thread from another
 * project. Any per-instance noise this list does not know simply prevents
 * sharing, which is the safe direction.
 */
const POOL_KEY_ENV_DROP = new Set([
  "PWD",
  "OLDPWD",
  "SHLVL",
  "_",
  "DIRENV_DIFF",
  "DIRENV_DIR",
  "DIRENV_FILE",
  "DIRENV_WATCHES",
  "STARSHIP_SESSION_KEY",
  "FNM_MULTISHELL_PATH",
]);

function canonicalizePoolPathEntry(entry: string): string {
  try {
    return realpathSync(entry);
  } catch {
    return entry;
  }
}

/**
 * Reduce `command.env` to its pool identity: drop per-instance bookkeeping
 * and canonicalize PATH entries through
 * `realpathSync` so per-shell symlinked toolchain dirs (for example fnm's
 * multishell bin) resolve to the same real directory across probes while
 * genuinely different pinned versions still split the pool.
 */
function normalizePoolKeyEnv(env: Readonly<Record<string, string>>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (POOL_KEY_ENV_DROP.has(key)) continue;
    normalized[key] =
      key.toLowerCase() === "path"
        ? value.split(delimiter).map(canonicalizePoolPathEntry).join(delimiter)
        : value;
  }
  return normalized;
}

function sharedProcessKey(spec: AcpSharedProcessSpec): string {
  const env = Object.entries(normalizePoolKeyEnv(spec.command.env ?? {})).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const payload = {
    command: spec.command.command,
    args: spec.command.args,
    env,
    platform: process.platform,
    initialize: spec.initializeRequest,
    prepare: spec.options.prepare?.key ?? null,
  };
  const digest = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return `${spec.options.scope}:${digest}`;
}

/**
 * Acquire a lease on a shared ACP process matching this spec, spawning and
 * initializing one on first use. Concurrent acquirers with an identical spec
 * join the first live entry under its member cap; further acquirers spawn
 * additional processes under the same key. The returned lease resolves once
 * the process has spawned (the shared `initialize` may still be in flight —
 * await `lease.initialized` for it).
 */
export async function acquireSharedAcpProcess(
  spec: AcpSharedProcessSpec,
): Promise<AcpSharedProcessLease> {
  const key = sharedProcessKey(spec);
  const maxMembers = spec.options.maxSessionsPerProcess ?? DEFAULT_MAX_SESSIONS_PER_PROCESS;
  let entries = sharedProcesses.get(key);
  let entry = entries?.find(
    (candidate) => !candidate.isDrained() && candidate.memberCount() < maxMembers,
  );
  if (entry === undefined) {
    entry = new SharedAcpProcessEntry(key, spec);
    if (entries === undefined) {
      entries = [];
      sharedProcesses.set(key, entries);
    }
    entries.push(entry);
    let scoped = sharedProcessScopes.get(spec.options.scope);
    if (scoped === undefined) {
      scoped = new Set();
      sharedProcessScopes.set(spec.options.scope, scoped);
    }
    scoped.add(entry);
  }
  return entry.acquire();
}

/** Terminate every shared ACP process pooled under the given scope. */
export async function shutdownSharedAcpProcesses(scope: string): Promise<void> {
  const entries = [...(sharedProcessScopes.get(scope) ?? [])];
  await Promise.all(entries.map((entry) => entry.terminate()));
}
