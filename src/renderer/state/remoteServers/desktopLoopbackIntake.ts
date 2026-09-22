import type { SupervisorEvent } from "@/shared/ipc";
import type { EventSequenceSpace } from "@/shared/eventSequenceSpace";
import {
  isUnauthorizedRemoteSocketClose,
  REMOTE_LOCAL_SOCKET_POLICY,
} from "@/shared/remote/socketPolicy";
import {
  exchangePairingCredential,
  isLoopbackCredentialExhaustedError,
  isLoopbackTicketUnauthorizedError,
  mintLoopbackTicket,
  type LoopbackRequestContext,
} from "./desktopLoopbackAuth";
import {
  DesktopLoopbackFrameDrain,
  type DesktopLoopbackDecodePort,
  type DesktopLoopbackDrainUnavailableReason,
} from "./desktopLoopbackFrameDrain";
import { routeDesktopLoopbackFrame, type DesktopLoopbackFramePorts } from "./desktopLoopbackFrames";
import { createManagedItemInterestTracker, sameItemInterests } from "./desktopLoopbackInterests";
import { DesktopLoopbackLiveness } from "./desktopLoopbackLiveness";
import {
  createDomDesktopLoopbackSocket,
  type DesktopLoopbackSocket,
} from "./desktopLoopbackSocket";
import { getManagedLoopbackEngine } from "@/renderer/state/remote/engine";
import { withRuntimeHistoryNoticesDeclaration } from "@/renderer/state/remote/historyNoticeCapability";
import { withBoundedCatalogChangesDeclaration } from "@/renderer/state/remote/boundedCatalogChangesCapability";

export type { DesktopLoopbackSocket } from "./desktopLoopbackSocket";

/**
 * Desktop loopback event intake (V5 plan 2.5): the managed desktop renderer's
 * SECOND, preferred event leg. It connects to the co-located
 * `RemoteAccessServer` as a DESKTOP-INTERNAL loopback session (loopback-gated
 * `desktopInternal=1` upgrade opt-in) and consumes:
 *
 * - the shared replayable `event` stream (transcript + thread lifecycle — the
 *   same families any authenticated client gets), and
 * - the desktop-internal `desktop-event` stream (the desktop-only supervisor
 *   families — provider usage, LSP, OSC, crossagent, experiment judging — that
 *   external clients must never observe).
 *
 * A1: the socket declares this window's retained runtime item interests
 * (`threadItemInterests` query parameter plus `thread-item-interests` frames on
 * change), so the server scopes bulk transcript content to what this window
 * actually shows. Terminal watches stay distinct: they ride `terminal-watch`
 * frames, never item interests.
 *
 * A4: the leg shares the generic socket policy through
 * `DesktopLoopbackLiveness` for open deadlines, correlated pings, half-open
 * detection and jittered quick local retries. Bootstrap, credential rotation,
 * port rediscovery and the loopback authorization gate stay injected: this
 * class owns only the managed socket and reports when their inputs must be
 * re-resolved.
 *
 * PTY bytes never ride either event stream: the terminal surface consumes them
 * through the `terminal-watch` machinery ON THIS SOCKET. V6 B.6 deleted the IPC
 * `thread-output` fallback; while this leg is down the window has no live PTY
 * until reconnect. Activation re-baselines subscribed threads through the
 * transport's rebuild dispatch.
 */

export interface DesktopLoopbackIntakeDeps {
  /** Loopback HTTP endpoint of the co-located remote server (trailing slash). */
  readonly endpoint: string;
  /** Pairing credential for this launch (the `pairingUrl` fragment token). */
  readonly pairingToken: string;
  /** Delivers one supervisor event to the desktop UI's listener surface. */
  /** Dispatches one supervisor event; `seq` is the shared event stream's
   * per-session cursor when the frame carried one (runtime deltas ride that
   * stream, so the reducer's sequenced arbitration stays armed on this leg).
   */
  readonly dispatch: (event: SupervisorEvent, seq?: number, space?: EventSequenceSpace) => void;
  /** Asks the transport to rebuild subscribed threads (leg handoff/loss).
   * Passing ids (A1 coverage restoration) rebuilds only those threads. */
  readonly requestRebuild: (threadIds?: ReadonlySet<string>) => void;
  /** Notified when the loopback leg becomes (in)active for event delivery. */
  readonly onActiveChanged: (active: boolean) => void;
  /** Terminal-watch activation (V5 plan 2.5 completion): called once the
   * socket is OPEN with a sender for `terminal-watch` client frames. The
   * owner installs the shared terminal feed's sender here. */
  readonly onTerminalReady?: (send: (message: unknown) => boolean) => void;
  /** Terminal-watch teardown: closes the feed's watches (leg down). */
  readonly onTerminalLost?: () => void;
  /** Routes one non-event server frame; returns true when consumed (terminal
   * `terminal-output` / cursor-sync machinery frames). */
  readonly onServerFrame?: (message: unknown) => boolean;
  /**
   * A1: the retained runtime thread ids this window needs live content for,
   * most recently retained first. Called at socket open and on every
   * subscription notification. Omitted means "no declared interests" → the
   * socket declares an explicit empty array.
   */
  readonly readItemInterests?: () => readonly string[];
  /** A1: subscribes to interest changes; returns the unsubscribe. */
  readonly subscribeItemInterests?: (listener: () => void) => () => void;
  /**
   * A1: bounded diagnostic for the wire bound; `droppedCount` is 0 when every
   * retained thread is carried again, so the visible capacity state clears.
   */
  readonly onItemInterestsTruncated?: (droppedCount: number) => void;
  /**
   * A1: the runtime ids this socket currently carries (the applied bounded
   * selection), or `null` when the leg carries nothing. Read by the interest
   * registry so a lease's `continuous` never claims coverage the wire cap
   * dropped.
   */
  readonly onItemInterestsApplied?: (threadIds: readonly string[] | null) => void;
  /**
   * A4: the pairing credential no longer authorizes a loopback session. The
   * owner must re-acquire a bootstrap (fresh credential) instead of retrying
   * the spent exchange. Called at most once per intake.
   */
  readonly onCredentialExhausted?: () => void;
  /**
   * A4: the bounded quick-local-retry budget is exhausted without a serving
   * socket (for example the server moved its port). The owner must re-resolve
   * the bootstrap; without this port the intake keeps retrying at the capped
   * local cadence so the leg never strands silently.
   */
  readonly onRecoveryExhausted?: () => void;
  /**
   * boundedCatalogChanges v1 declaration input for the upgrade: true only when
   * the bounded catalog consumer for this endpoint is installed and the live
   * host was verified (by its own descriptor) to advertise the capability. The
   * declaration is asserted at socket open, before any read; the verdict is
   * recorded by {@link preflightBoundedCatalogChanges}, which runs before the
   * ticket mint, so the FIRST upgrade of an activation already sees it.
   */
  readonly declaresBoundedCatalogChanges?: (endpoint: string) => boolean;
  /**
   * Capability preflight on the authenticated loopback HTTP leg: called after
   * the pairing exchange (or the retained-bearer reuse) and BEFORE the ticket
   * is minted and the socket's upgrade is built, so the owner can resolve the
   * endpoint's descriptor and record its capability verdict while
   * {@link declaresBoundedCatalogChanges} can still affect THIS upgrade. A
   * failure is classified by the owner; the intake only awaits the call and
   * still opens the socket, because the activation's own descriptor resolution
   * remains the endpoint authority and the live leg must not depend on it.
   */
  readonly preflightBoundedCatalogChanges?: (context: {
    readonly base: string;
    readonly accessToken: string;
    /** Deadline the owner's descriptor request should honor. */
    readonly timeoutMs: number;
    /** Intake-lifecycle abort (dispose); the owner checks it after its await. */
    readonly signal: AbortSignal;
  }) => Promise<void> | void;
  /**
   * The private loopback stream asked for a resync (shared stream restart, or
   * a catalog change the host could not deliver on this socket). Called after
   * the subscribed-thread rebuild is requested; the managed root restarts its
   * bounded catalog passes here instead of waiting for the next membership
   * event or the reconcile ticker.
   */
  readonly onResyncRequired?: () => void;
  /** Test seams. */
  readonly fetchImpl?: typeof fetch;
  readonly socketFactory?: (url: string) => DesktopLoopbackSocket;
  /** Test seam: fixed local retry cadence (base and max) instead of jittered backoff. */
  readonly retryDelayMs?: number;
  /** Test seam: deadline for one socket reaching OPEN. */
  readonly connectTimeoutMs?: number;
  /** Test seam: deadline for one pairing-exchange/ticket request. */
  readonly requestTimeoutMs?: number;
  /** Test seam: deadline for the upgrade-capability preflight request. */
  readonly preflightTimeoutMs?: number;
  /** Test seam: local attempts before reporting recovery exhaustion. */
  readonly localRecoveryMaxAttempts?: number;
  /**
   * A3 test seam: the private frame decode port. Production creates a lane on
   * the managed loopback engine; tests inject fakes to exercise reduced-state
   * recovery without a real Worker.
   */
  readonly frameDecodePort?: DesktopLoopbackDecodePort;
  /** A3 test seam: fixed reduced-state reconnect cadence. */
  readonly decodeRetryDelayMs?: number;
}

/**
 * Quick local attempts before escalation: with the local policy's base/cap
 * this is roughly 2–8 s of jittered retries. A transient local restart
 * recovers in place; a moved port or consumed credential escalates to a fresh
 * bootstrap through the owner instead of retrying a stale endpoint forever.
 */
const LOCAL_RECOVERY_MAX_ATTEMPTS = 5;

/**
 * A3 reduced-state cadence: after the engine reports it cannot decode bulk
 * frames, the leg is re-established on a bounded exponential cadence instead
 * of spending the transport retry/escalation budget. A worker outage is not
 * something a fresh bootstrap can fix, and retrying it tightly would turn the
 * recovery itself into an overload loop.
 */
const DECODE_RETRY_BASE_MS = 5_000;
const DECODE_RETRY_MAX_MS = 30_000;

/** Lane keys are unique per intake: one managed leg per window in the real app,
 * but tests (and any future multi-leg composition) may run two intakes against
 * the same engine in one process. A fixed key would let the second intake
 * dispose the first one's lane. */
let nextManagedLoopbackLaneId = 1;

export function parsePairingCredential(pairingUrl: string): string | null {
  try {
    const url = new URL(pairingUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
  } catch {
    return null;
  }
}

/** The only endpoints the intake may attach to: loopback origins. This is the
 * renderer-side half of the desktop-internal gate — a non-loopback
 * `localHttpBaseUrl` is refused before any credential is spent. */
export function isLoopbackEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "::1" || hostname === "[::1]") return true;
    if (hostname.endsWith(".localhost") || hostname === "localhost") return true;
    return hostname.startsWith("127.");
  } catch {
    return false;
  }
}

export class DesktopLoopbackIntake {
  private readonly fetchImpl: typeof fetch;
  private readonly socketFactory: (url: string) => DesktopLoopbackSocket;
  /** A4: one counter fenced over every socket callback; dispose advances it so
   * a late `onopen`/`onmessage`/`onclose` is inert. */
  private generation = 0;
  private socket: DesktopLoopbackSocket | null = null;
  private open = false;
  private disposed = false;
  private connecting = false;
  private active = false;
  private readonly liveness: DesktopLoopbackLiveness;
  private readonly requestTimeoutMs: number;
  private readonly framePorts: DesktopLoopbackFramePorts;
  private credentialExhaustionNotified = false;
  /** In-flight activation's request abort (dispose joins by aborting). */
  private requestAbort: AbortController | null = null;
  /** Settles the pending `openSocket` promise on dispose, so an activation
   * that is awaiting OPEN cannot outlive the intake. */
  private pendingOpenSettle: ((opened: boolean) => void) | null = null;
  private unsubscribeItemInterests: (() => void) | null = null;
  private sentItemInterests: string[] | null = null;
  private lastReportedItemInterestOverflow = 0;
  /** A1: remembers the previous declared/admitted sets so a thread re-admitted
   * after the wire cap dropped it is rebuilt, not silently resumed. */
  private readonly interestTracker = createManagedItemInterestTracker();
  /** A3: the private loopback decode seam (off-thread when the platform has a
   * Worker) plus its ordered bounded drain. */
  private readonly decodePort: DesktopLoopbackDecodePort;
  private readonly drain: DesktopLoopbackFrameDrain;
  private readonly decodeRetryBaseMs: number;
  /** Bounded reduced-state reconnect cadence (no transport escalation). */
  private decodeRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private decodeRetryAttempts = 0;
  /** Live bearer token for the loopback HTTP leg, retained from the pairing
   * exchange so managed `call-*` requests can ride the same leg. */
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  /** Whether the CURRENT socket's upgrade carried the bounded-catalog-changes
   * declaration (read by the wiring to re-open on a capability change). */
  private declaredBoundedCatalogChanges = false;

  constructor(private readonly deps: DesktopLoopbackIntakeDeps) {
    this.requestTimeoutMs = deps.requestTimeoutMs ?? REMOTE_LOCAL_SOCKET_POLICY.requestTimeoutMs;
    this.fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init));
    this.socketFactory = deps.socketFactory ?? createDomDesktopLoopbackSocket;
    this.liveness = new DesktopLoopbackLiveness({
      ...(deps.retryDelayMs !== undefined ? { retryDelayMs: deps.retryDelayMs } : {}),
      ...(deps.connectTimeoutMs !== undefined ? { connectTimeoutMs: deps.connectTimeoutMs } : {}),
      maxLocalAttempts: deps.localRecoveryMaxAttempts ?? LOCAL_RECOVERY_MAX_ATTEMPTS,
      onRetry: () => void this.activate(),
      ...(deps.onRecoveryExhausted ? { onEscalate: deps.onRecoveryExhausted } : {}),
      onDead: (socket) => this.forceReconnect(socket),
    });
    this.framePorts = {
      dispatch: (event, seq, space) => this.deps.dispatch(event, seq, space),
      requestRebuild: () => this.deps.requestRebuild(),
      onServerFrame: (message) => this.deps.onServerFrame?.(message) ?? false,
      onPong: (id) => {
        this.liveness.acceptPong(id);
      },
      onResyncRequired: () => this.deps.onResyncRequired?.(),
    };
    this.decodePort =
      deps.frameDecodePort ??
      getManagedLoopbackEngine().createLane({
        key: `managed-loopback:${nextManagedLoopbackLaneId++}`,
      });
    this.decodeRetryBaseMs = deps.decodeRetryDelayMs ?? DECODE_RETRY_BASE_MS;
    this.drain = new DesktopLoopbackFrameDrain({
      decode: this.decodePort,
      onFrame: (frame) => {
        // A routed frame proves the decode lane works: the reduced-state
        // backoff starts over only then, never merely because a socket opened.
        this.noteDecodeHealthy();
        routeDesktopLoopbackFrame(frame, this.framePorts);
      },
      onUnavailable: (reason) => this.noteDecodeUnavailable(reason),
    });
    this.unsubscribeItemInterests =
      deps.subscribeItemInterests?.(() => {
        if (this.disposed) return;
        const socket = this.socket;
        if (!socket || !this.open) return;
        this.sendItemInterestsIfChanged(socket);
      }) ?? null;
  }

  /** True while the loopback socket is open and serving events. */
  isActive(): boolean {
    return this.active;
  }

  /** The retained loopback bearer token, once the pairing exchange ran. */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /** True while the OPEN socket's upgrade declared `catalogChanges=bounded-v1`. */
  boundedCatalogChangesDeclared(): boolean {
    return this.open && this.declaredBoundedCatalogChanges;
  }

  /**
   * Re-open the current socket so its upgrade re-evaluates the declaration
   * inputs (a descriptor verdict arrived or changed for this endpoint). The
   * owner calls this only to DROP a declaration a fresh post-open descriptor
   * contradicts: adoption itself happens on the preflight before the upgrade is
   * built, so a healthy authority is never bounced for a capability change. The
   * close rides the normal liveness reconnect, so the leg re-baselines exactly
   * as on any other transport hiccup; a no-op while no socket is open.
   */
  refreshCapabilityDeclaration(): void {
    const socket = this.socket;
    if (!socket || this.disposed) return;
    this.closeSocket(socket);
    try {
      socket.close();
    } catch {
      // already closed
    }
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  /** Installs a token refresh rotation result (the loopback HTTP client's
   * lifecycle reports rotations back into this intake). */
  applyTokens(tokens: {
    readonly accessToken: string;
    readonly refreshToken?: string | null;
  }): void {
    this.accessToken = tokens.accessToken;
    if (tokens.refreshToken === undefined) return;
    this.refreshToken = tokens.refreshToken;
  }

  /** Tears down the leg: aborts in-flight credential work, stops every timer,
   * fences late callbacks, settles a pending activation and unsubscribes from
   * the interest source. */
  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.requestAbort?.abort();
    this.requestAbort = null;
    this.unsubscribeItemInterests?.();
    this.unsubscribeItemInterests = null;
    this.clearDecodeRetry();
    this.drain.dispose();
    this.liveness.dispose();
    const socket = this.socket;
    this.socket = null;
    this.open = false;
    this.interestTracker.reset();
    this.deps.onItemInterestsApplied?.(null);
    // A disposed intake reports no capacity state: a replacement intake (or a
    // reconnect) re-reports from the real selection, so the visible overload
    // never outlives the wire that produced it.
    this.reportItemInterestOverflow(0);
    this.pendingOpenSettle?.(false);
    this.pendingOpenSettle = null;
    try {
      socket?.close();
    } catch {
      // already closed
    }
    this.deps.onTerminalLost?.();
    this.setActive(false);
  }

  /** One activation attempt: pair (or reuse the retained bearer), mint a
   * ticket, open the desktop-internal socket. Resolves true only once the
   * socket is OPEN and serving. Transport-class failures schedule a bounded
   * local retry; a consumed credential or an exhausted local budget is
   * reported to the injected owner ports, which re-resolve the bootstrap.
   */
  async activate(): Promise<boolean> {
    if (this.disposed || this.active || this.connecting) return this.active;
    this.connecting = true;
    try {
      const base = this.deps.endpoint.endsWith("/") ? this.deps.endpoint : `${this.deps.endpoint}/`;
      const opened = await this.attemptActivation(base);
      if (opened) return true;
      if (this.canContinue()) this.liveness.noteTransportFailure();
      return false;
    } catch (error) {
      if (isLoopbackCredentialExhaustedError(error)) {
        this.noteCredentialExhausted();
        return false;
      }
      if (this.canContinue()) this.liveness.noteTransportFailure();
      return false;
    } finally {
      this.connecting = false;
    }
  }

  private async attemptActivation(base: string): Promise<boolean> {
    const controller = new AbortController();
    this.requestAbort = controller;
    try {
      const retained = this.accessToken;
      if (retained) {
        try {
          return await this.openWithTicket(base, retained, controller);
        } catch (error) {
          if (isLoopbackCredentialExhaustedError(error)) throw error;
          if (!isLoopbackTicketUnauthorizedError(error)) throw error;
          // The retained bearer was refused (expired/rotated): fall through to
          // a fresh pairing exchange, exactly as the pre-A4 path did.
        }
      }
      const tokens = await exchangePairingCredential(
        this.requestContext(base, controller),
        this.deps.pairingToken,
      );
      this.applyTokens(tokens);
      if (!this.canContinue()) return false;
      return await this.openWithTicket(base, tokens.accessToken, controller);
    } finally {
      if (this.requestAbort === controller) this.requestAbort = null;
    }
  }

  private async openWithTicket(
    base: string,
    token: string,
    controller: AbortController,
  ): Promise<boolean> {
    // Capability preflight (F1): the descriptor read runs on the authenticated
    // HTTP leg BEFORE the one-use ticket is minted, so the endpoint verdict is
    // recorded while the upgrade can still consult it. The preflight is
    // bounded by its request deadline; failure still allows the leg to open.
    // The activation's descriptor resolution remains the endpoint authority.
    await this.preflightCapabilityFacts(base, token, controller);
    if (!this.canContinue()) return false;
    const ticket = await mintLoopbackTicket(this.requestContext(base, controller), token);
    if (!this.canContinue()) return false;
    return await this.openSocket(base, ticket);
  }

  /**
   * Run the injected capability preflight (if any) against the authenticated
   * loopback HTTP leg. The request deadline bounds the added startup wait.
   * Failure allows the event leg to open without a fresh capability verdict.
   */
  private async preflightCapabilityFacts(
    base: string,
    token: string,
    controller: AbortController,
  ): Promise<void> {
    const preflight = this.deps.preflightBoundedCatalogChanges;
    if (!preflight || this.disposed) return;
    try {
      await preflight({
        base,
        accessToken: token,
        timeoutMs: this.deps.preflightTimeoutMs ?? this.requestTimeoutMs,
        signal: controller.signal,
      });
    } catch {
      // The recorded facts (if any) stay; the owner re-resolves after open.
    }
  }

  private requestContext(base: string, controller: AbortController): LoopbackRequestContext {
    return {
      fetchImpl: this.fetchImpl,
      base,
      timeoutMs: this.requestTimeoutMs,
      signal: controller.signal,
    };
  }

  private canContinue(): boolean {
    return !this.disposed && !this.active;
  }

  private openSocket(base: string, ticket: string): Promise<boolean> {
    const generation = this.generation;
    // Live-only join: no replay cursors. Recovery rebuilds subscribed threads
    // through the transport (the proven relay semantics) instead of replaying
    // into the desktop reducer.
    const wsUrl = new URL("/ws", base.replace(/^http/, "ws"));
    wsUrl.searchParams.set("ticket", ticket);
    wsUrl.searchParams.set("desktopInternal", "1");
    // B1: the managed root's transcript reads now ride the bounded HTTP
    // history/items/turns routes and can carry/render the durable notice
    // (B4 F6), so this leg declares `notices=v1` on the FIRST upgrade. The
    // declaration is asserted at socket open, before any read: a capable
    // connection is what keeps live post-gap content flowing instead of being
    // emptied by the host's notice gate.
    // boundedCatalogChanges follows its authenticated descriptor preflight:
    // the declaration is asserted only for an endpoint whose descriptor was
    // read on this leg before the ticket mint (the preflight above), so a host
    // that predates the signal form never receives it and the FIRST upgrade of
    // a capable host already carries it.
    const declaredUrl = new URL(
      withBoundedCatalogChangesDeclaration(
        withRuntimeHistoryNoticesDeclaration(wsUrl.toString()),
        this.deps.declaresBoundedCatalogChanges?.(this.deps.endpoint) === true,
      ),
    );
    this.declaredBoundedCatalogChanges = declaredUrl.searchParams.has("catalogChanges");
    this.open = false;
    // A1: an explicit (possibly empty) interest array on the initial upgrade.
    // Absence means "older client, send everything"; a malformed array also
    // parses as absent server-side, so the bound is enforced before writing.
    const initialItemInterests = this.snapshotItemInterests();
    declaredUrl.searchParams.set("threadItemInterests", JSON.stringify(initialItemInterests));
    const socket = this.socketFactory(declaredUrl.toString());
    this.socket = socket;
    this.sentItemInterests = initialItemInterests;
    // A3: a fresh socket generation; the old socket's queued/in-flight decodes
    // are fenced and the reduced state clears as soon as frames decode again.
    this.drain.reset();
    this.clearDecodeRetryTimer();
    let settleOpen: ((opened: boolean) => void) | null = null;
    const opened = new Promise<boolean>((resolve) => {
      settleOpen = resolve;
    });
    this.pendingOpenSettle = (value) => {
      this.pendingOpenSettle = null;
      settleOpen?.(value);
    };
    const isCurrent = () => this.socket === socket && this.generation === generation;
    this.liveness.beginConnect(socket);
    socket.onopen = () => {
      if (!isCurrent()) return;
      this.open = true;
      this.liveness.markOpen();
      this.setActive(true);
      // Terminal-watch activation (2.5 completion): the feed's watches arm on
      // this socket; the wiring installs the cursor-sync sender.
      this.deps.onTerminalReady?.((message) => {
        if (this.socket !== socket || !this.open) return false;
        try {
          socket.send(JSON.stringify(message));
          return true;
        } catch {
          return false;
        }
      });
      // Interests may have moved while the socket was opening: the upgrade
      // parameter carries the open-time set, so only a diff needs a frame.
      this.sendItemInterestsIfChanged(socket);
      // Every leg activation re-baselines: events between the IPC handoff
      // and this open are covered by the rebuild.
      this.deps.requestRebuild();
      this.pendingOpenSettle?.(true);
      this.pendingOpenSettle = null;
    };
    socket.onmessage = (event) => {
      if (!isCurrent()) return;
      this.drain.push(String(event.data));
    };
    socket.onclose = (event) => {
      if (!isCurrent()) return;
      this.closeSocket(socket, event);
    };
    return opened;
  }

  private closeSocket(
    socket: DesktopLoopbackSocket,
    event?: { readonly code?: number; readonly reason?: string },
  ): void {
    if (this.socket !== socket) return;
    this.teardownSocket(socket);
    if (isUnauthorizedRemoteSocketClose(event?.code ?? 0, event?.reason ?? "")) {
      this.noteCredentialExhausted();
      return;
    }
    this.liveness.noteTransportFailure();
  }

  /** Common close work, without classifying the failure. Used by the normal
   * close path and by the A3 reduced-state path (a decode-worker outage must
   * not spend the transport retry/escalation budget). */
  private teardownSocket(socket: DesktopLoopbackSocket): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.open = false;
    // A1: the wire carries nothing while the leg is down; coverage and the
    // previous admitted sets are re-established on the next open (which runs a
    // full activation rebuild), so no restoration is inferred across the gap.
    this.interestTracker.reset();
    this.deps.onItemInterestsApplied?.(null);
    this.reportItemInterestOverflow(0);
    this.liveness.endSocket();
    this.pendingOpenSettle?.(false);
    this.pendingOpenSettle = null;
    // Terminal watches close with the leg; the rebuild below drives the
    // existing scrollback-recovery semantics.
    this.deps.onTerminalLost?.();
    this.setActive(false);
    this.deps.requestRebuild();
  }

  /**
   * A3 reduced state: the private decode lane cannot serve bulk frames. The
   * leg is torn down (the window truthfully reports it inactive) and retried
   * on a bounded exponential cadence — never a synchronous bulk parse, never
   * an immediate close/reconnect loop, and never a bootstrap escalation that
   * cannot repair a worker outage.
   */
  private noteDecodeUnavailable(_reason: DesktopLoopbackDrainUnavailableReason): void {
    if (this.disposed) return;
    const socket = this.socket;
    if (socket) this.teardownSocket(socket);
    this.scheduleDecodeRetry();
  }

  private scheduleDecodeRetry(): void {
    if (this.disposed || this.decodeRetryTimer) return;
    const delay = Math.min(
      this.decodeRetryBaseMs * 2 ** this.decodeRetryAttempts,
      DECODE_RETRY_MAX_MS,
    );
    this.decodeRetryAttempts += 1;
    this.decodeRetryTimer = setTimeout(() => {
      this.decodeRetryTimer = null;
      if (this.disposed || this.active) return;
      void this.activate();
    }, delay);
    this.decodeRetryTimer.unref?.();
  }

  private noteDecodeHealthy(): void {
    this.decodeRetryAttempts = 0;
    this.clearDecodeRetryTimer();
  }

  private clearDecodeRetryTimer(): void {
    if (!this.decodeRetryTimer) return;
    clearTimeout(this.decodeRetryTimer);
    this.decodeRetryTimer = null;
  }

  private clearDecodeRetry(): void {
    this.clearDecodeRetryTimer();
    this.decodeRetryAttempts = 0;
  }

  private forceReconnect(socket: DesktopLoopbackSocket): void {
    if (this.socket !== socket) return;
    // Tear down first: a never-open socket may not emit `onclose` at all, and
    // the deadline must still settle the pending activation.
    this.closeSocket(socket);
    try {
      socket.close();
    } catch {
      // already closed
    }
  }

  private reportItemInterestOverflow(droppedCount: number): void {
    if (droppedCount === this.lastReportedItemInterestOverflow) return;
    this.lastReportedItemInterestOverflow = droppedCount;
    this.deps.onItemInterestsTruncated?.(droppedCount);
  }

  private snapshotItemInterests(): string[] {
    const selection = this.interestTracker.select(this.deps.readItemInterests?.() ?? []);
    this.reportItemInterestOverflow(selection.droppedCount);
    if (this.open && selection.restoredThreadIds.length > 0) {
      // A retained thread re-entered the bounded wire selection after a
      // coverage gap: its mounted view missed content while the cap excluded
      // it. Ask the transport for an authoritative rebuild of exactly those
      // threads instead of resuming deltas into stale state.
      this.deps.requestRebuild(new Set(selection.restoredThreadIds));
    }
    return selection.threadIds;
  }

  private sendItemInterestsIfChanged(socket: DesktopLoopbackSocket): void {
    const next = this.snapshotItemInterests();
    if (!sameItemInterests(next, this.sentItemInterests)) {
      try {
        socket.send(JSON.stringify({ type: "thread-item-interests", threadIds: next }));
        this.sentItemInterests = next;
      } catch {
        // The socket's own error path closes it; leave the applied snapshot
        // unchanged so the next open resends the current set.
        return;
      }
    }
    // This socket now carries `next` (initial upgrade or just-sent frame).
    this.deps.onItemInterestsApplied?.(next);
  }

  private setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.deps.onActiveChanged(active);
  }

  private noteCredentialExhausted(): void {
    if (this.credentialExhaustionNotified) return;
    this.credentialExhaustionNotified = true;
    if (this.deps.onCredentialExhausted) {
      this.deps.onCredentialExhausted();
      return;
    }
    console.warn("[loopback] pairing credential exhausted with no recovery port installed");
  }
}

export interface DesktopPairingEndpointInfo {
  readonly status: string;
  readonly localHttpBaseUrl?: string;
  readonly pairingUrl?: string;
}

/** Resolves the intake's attachment target from a `getRemoteAccessPairing`
 * result: a loopback local endpoint plus this launch's pairing credential.
 * `null` when remote access is disabled, starting, or not loopback-local. */
export function resolveLoopbackTarget(info: DesktopPairingEndpointInfo): {
  readonly endpoint: string;
  readonly pairingToken: string;
} | null {
  if (info.status !== "ready") return null;
  if (!info.localHttpBaseUrl || !isLoopbackEndpoint(info.localHttpBaseUrl)) return null;
  if (!info.pairingUrl) return null;
  const pairingToken = parsePairingCredential(info.pairingUrl);
  if (!pairingToken) return null;
  return { endpoint: info.localHttpBaseUrl, pairingToken };
}
