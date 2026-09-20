import type { SupervisorEvent } from "@/shared/ipc";
import { REMOTE_OPERATOR_SCOPES } from "@/shared/remote";
import type { EventSequenceSpace } from "@/shared/eventSequenceSpace";

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
 * PTY bytes never ride either stream: since the 2.5 completion the terminal
 * surface consumes them through the `terminal-watch` machinery ON THIS SOCKET
 * (the server already admits desktop sessions to terminal watches, v1/v2
 * cursor sync included). V6 B.6 deleted the IPC `thread-output` fallback;
 * while this leg is down the window has no live PTY until reconnect.
 *
 * Activation re-baselines subscribed threads through the transport's rebuild
 * dispatch. Discovery is driven by main's always-on guarantee: the managed
 * bootstrap payload (`getManagedLoopbackBootstrap`) resolves the loopback
 * endpoint and this launch's single-use credential once the server is serving.
 * Failures retry in the background.
 */

export interface DesktopLoopbackSocket {
  close(): void;
  send(data: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onclose: (() => void) | null;
}

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
  /** Asks the transport to rebuild subscribed threads (leg handoff/loss). */
  readonly requestRebuild: () => void;
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
  /** Test seams. */
  readonly fetchImpl?: typeof fetch;
  readonly socketFactory?: (url: string) => DesktopLoopbackSocket;
  readonly retryDelayMs?: number;
}

/** Minimum retry cadence; production uses the default. */
const DEFAULT_RETRY_DELAY_MS = 30_000;

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
  private readonly retryDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly socketFactory: (url: string) => DesktopLoopbackSocket;
  private socket: DesktopLoopbackSocket | null = null;
  private disposed = false;
  private connecting = false;
  private active = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Live bearer token for the loopback HTTP leg, retained from the pairing
   * exchange so managed `call-*` requests can ride the same leg. */
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(private readonly deps: DesktopLoopbackIntakeDeps) {
    this.retryDelayMs = deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init));
    this.socketFactory =
      deps.socketFactory ??
      ((url) => {
        const socket = new WebSocket(url);
        // Delegate through locals: DOM handler signatures carry `this`/event
        // parameters this module's narrow socket shape does not model.
        let onopen: (() => void) | null = null;
        let onmessage: ((event: { readonly data: unknown }) => void) | null = null;
        let onclose: (() => void) | null = null;
        socket.addEventListener("open", () => onopen?.());
        socket.addEventListener("message", (event) =>
          onmessage?.({ data: (event as MessageEvent).data }),
        );
        socket.addEventListener("close", () => onclose?.());
        return {
          close: () => socket.close(),
          send: (data) => socket.send(data),
          get onopen() {
            return onopen;
          },
          set onopen(handler) {
            onopen = handler;
          },
          get onmessage() {
            return onmessage;
          },
          set onmessage(handler) {
            onmessage = handler;
          },
          get onclose() {
            return onclose;
          },
          set onclose(handler) {
            onclose = handler;
          },
        };
      });
  }

  /** True while the loopback socket is open and serving events. */
  isActive(): boolean {
    return this.active;
  }

  /** The retained loopback bearer token, once the pairing exchange ran. */
  getAccessToken(): string | null {
    return this.accessToken;
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

  dispose(): void {
    this.disposed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.deps.onTerminalLost?.();
    this.setActive(false);
  }

  /** One activation attempt: pair (or reuse the retained bearer), mint a
   * ticket, open the desktop-internal socket. Resolves true only once the
   * socket is OPEN and serving. Retries reuse the retained access token —
   * the pairing credential is single-use, so re-exchanging it would fail
   * forever even when only the socket dropped. */
  async activate(): Promise<boolean> {
    if (this.disposed || this.active || this.connecting) return this.active;
    this.connecting = true;
    try {
      const base = this.deps.endpoint.endsWith("/") ? this.deps.endpoint : `${this.deps.endpoint}/`;
      let token = this.accessToken;
      if (token) {
        try {
          return await this.openWithTicket(base, token);
        } catch {
          // Ticket mint refused the retained bearer (expired/rotated): fall
          // through to a fresh exchange.
          token = null;
        }
      }
      token = await this.exchangePairingToken(base);
      if (!this.canContinue()) return false;
      return await this.openWithTicket(base, token);
    } catch {
      this.scheduleRetry();
      return false;
    } finally {
      this.connecting = false;
    }
  }

  private async openWithTicket(base: string, token: string): Promise<boolean> {
    const ticket = await this.mintTicket(base, token);
    if (!this.canContinue()) return false;
    return await this.openSocket(base, ticket);
  }

  private canContinue(): boolean {
    return !this.disposed && !this.active;
  }

  private async exchangePairingToken(base: string): Promise<string> {
    const response = await this.fetchImpl(new URL("/oauth/token", base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential: this.deps.pairingToken,
        // The desktop's own renderer is the loopback OWNER: it takes the full
        // operator scope set so managed `call-*` requests can ride this leg
        // (session:operate, projects:manage, …) — not the viewer set an
        // external phone pairs down to.
        scopes: [...REMOTE_OPERATOR_SCOPES],
        client: { label: "Poracode desktop", deviceType: "desktop" },
      }),
    });
    if (!response.ok) throw new Error(`Pairing exchange failed (${response.status}).`);
    const payload = (await response.json()) as {
      accessToken?: unknown;
      refreshToken?: unknown;
    };
    if (typeof payload.accessToken !== "string" || payload.accessToken === "") {
      throw new Error("Pairing exchange returned no access token.");
    }
    this.accessToken = payload.accessToken;
    this.refreshToken = typeof payload.refreshToken === "string" ? payload.refreshToken : null;
    return payload.accessToken;
  }

  private async mintTicket(base: string, accessToken: string): Promise<string> {
    const response = await this.fetchImpl(new URL("/api/auth/websocket-ticket", base), {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(`Ticket mint failed (${response.status}).`);
    const payload = (await response.json()) as { ticket?: unknown };
    if (typeof payload.ticket !== "string" || payload.ticket === "") {
      throw new Error("Ticket mint returned no ticket.");
    }
    return payload.ticket;
  }

  private openSocket(base: string, ticket: string): Promise<boolean> {
    // Live-only join: no replay cursors. Recovery rebuilds subscribed threads
    // through the transport (the proven relay semantics) instead of replaying
    // into the desktop reducer.
    const wsUrl = new URL("/ws", base.replace(/^http/, "ws"));
    wsUrl.searchParams.set("ticket", ticket);
    wsUrl.searchParams.set("desktopInternal", "1");
    const socket = this.socketFactory(wsUrl.toString());
    this.socket = socket;
    let settleOpen: ((opened: boolean) => void) | null = null;
    const opened = new Promise<boolean>((resolve) => {
      settleOpen = resolve;
    });
    socket.onopen = () => {
      if (this.socket !== socket) {
        settleOpen?.(false);
        return;
      }
      this.setActive(true);
      // Terminal-watch activation (2.5 completion): the feed's watches arm on
      // this socket; the wiring installs the cursor-sync sender.
      this.deps.onTerminalReady?.((message) => {
        if (this.socket !== socket) return false;
        try {
          socket.send(JSON.stringify(message));
          return true;
        } catch {
          return false;
        }
      });
      // Every leg activation re-baselines: events between the IPC handoff
      // and this open are covered by the rebuild.
      this.deps.requestRebuild();
      settleOpen?.(true);
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      this.handleMessage(event.data);
    };
    socket.onclose = () => {
      if (this.socket !== socket) {
        settleOpen?.(false);
        return;
      }
      this.socket = null;
      settleOpen?.(false);
      // Terminal watches close with the leg; the fallback feed resumes (the
      // rebuild below drives the existing scrollback-recovery semantics).
      this.deps.onTerminalLost?.();
      this.setActive(false);
      this.deps.requestRebuild();
      this.scheduleRetry();
    };
    return opened;
  }

  private handleMessage(data: unknown): void {
    let frame: { type?: unknown; seq?: unknown; event?: unknown; space?: unknown };
    try {
      frame = JSON.parse(String(data)) as typeof frame;
    } catch {
      return;
    }
    if (frame.type === "event" || frame.type === "desktop-event") {
      const event = frame.event;
      if (!event || typeof event !== "object") return;
      const space: EventSequenceSpace =
        frame.space === "ipc" || frame.space === "loopback"
          ? frame.space
          : frame.type === "desktop-event"
            ? "ipc"
            : "loopback";
      const seq = typeof frame.seq === "number" ? frame.seq : undefined;
      this.deps.dispatch(event as SupervisorEvent, seq, space);
      return;
    }
    // Terminal frames (2.5 completion): `terminal-output`,
    // `terminal-watch-result`, and `terminal-watch-baseline-chunk` route to
    // the shared terminal feed through the wiring.
    if (
      frame.type === "terminal-output" ||
      frame.type === "terminal-watch-result" ||
      frame.type === "terminal-watch-baseline-chunk"
    ) {
      this.deps.onServerFrame?.(frame);
      return;
    }
    // `ready` and `pong` carry no state; a resync on this leg means the
    // server's stream reset — rebuild once.
    if (frame.type === "resync-required") this.deps.requestRebuild();
  }

  private setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.deps.onActiveChanged(active);
  }

  private scheduleRetry(): void {
    if (this.disposed || this.retryTimer || this.active) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.activate();
    }, this.retryDelayMs);
    this.retryTimer.unref?.();
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
