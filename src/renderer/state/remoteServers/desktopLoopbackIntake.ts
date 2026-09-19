import type { SupervisorEvent } from "@/shared/ipc";

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
 * PTY bytes never ride either stream: `thread-output` stays on the
 * desktop-IPC relay for the desktop terminal UI until the terminal surface
 * migrates to `terminal-watch` (the server side already admits desktop
 * sessions to terminal watches).
 *
 * Fallback contract: while the loopback socket is down, the desktop-IPC relay
 * remains the delivery path (the transport stops dropping it), and every
 * activation re-baselines subscribed threads through the transport's rebuild
 * dispatch — the same recovery primitive the relay's shed/gap signals use.
 * Discovery is opportunistic: remote access can be disabled or still starting,
 * so the coordinator polls `getRemoteAccessPairing` and only attaches when the
 * local endpoint is a loopback origin. Every failure stays non-fatal: the
 * intake retries in the background and the desktop keeps working over IPC.
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
  readonly dispatch: (event: SupervisorEvent) => void;
  /** Asks the transport to rebuild subscribed threads (leg handoff/loss). */
  readonly requestRebuild: () => void;
  /** Notified when the loopback leg becomes (in)active for event delivery. */
  readonly onActiveChanged: (active: boolean) => void;
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

  dispose(): void {
    this.disposed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.setActive(false);
  }

  /** One activation attempt: pair, mint a ticket, open the desktop-internal
   * socket. Resolves true only once the socket is OPEN and serving. */
  async activate(): Promise<boolean> {
    if (this.disposed || this.active || this.connecting) return this.active;
    this.connecting = true;
    try {
      const base = this.deps.endpoint.endsWith("/") ? this.deps.endpoint : `${this.deps.endpoint}/`;
      const token = await this.exchangePairingToken(base);
      if (!this.canContinue()) return false;
      const ticket = await this.mintTicket(base, token);
      if (!this.canContinue()) return false;
      return await this.openSocket(base, ticket);
    } catch {
      this.scheduleRetry();
      return false;
    } finally {
      this.connecting = false;
    }
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
        scopes: ["session:read", "terminal:read"],
        client: { label: "Poracode desktop", deviceType: "desktop" },
      }),
    });
    if (!response.ok) throw new Error(`Pairing exchange failed (${response.status}).`);
    const payload = (await response.json()) as { accessToken?: unknown };
    if (typeof payload.accessToken !== "string" || payload.accessToken === "") {
      throw new Error("Pairing exchange returned no access token.");
    }
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
      this.setActive(false);
      this.deps.requestRebuild();
      this.scheduleRetry();
    };
    return opened;
  }

  private handleMessage(data: unknown): void {
    let frame: { type?: unknown; seq?: unknown; event?: unknown };
    try {
      frame = JSON.parse(String(data)) as typeof frame;
    } catch {
      return;
    }
    if (frame.type === "event" || frame.type === "desktop-event") {
      const event = frame.event;
      if (!event || typeof event !== "object") return;
      // Wire frames validated by shape here; the desktop reducer owns the
      // SupervisorEvent contract and tolerates the shared union.
      this.deps.dispatch(event as SupervisorEvent);
      return;
    }
    // `ready`, `pong`, `resync-required`, terminal and mirror frames are
    // handled by their owners; a resync on this leg means the server's stream
    // reset — rebuild once.
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
