import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { HttpServerConnections } from "@/shared/httpServerConnections";
import { toWebSocketUrl } from "@/shared/remote";
import { remoteAccessBindRefusal } from "./config";
import { normalizeHostForUrl } from "./server/security";
import {
  DEFAULT_LISTEN_RETRY_ATTEMPTS,
  DEFAULT_LISTEN_RETRY_DELAY_MS,
  type RemoteAccessServerHost,
  type RemoteAccessServerInfo,
} from "./remoteAccessServerTypes";
import { mintPairingUrl, recordAudit } from "./remoteAccessServerPairing";
import { announceRemoteServerShutdown } from "./remoteAccessServerShutdown";

export function createRemoteAccessHttpServer(
  tls: RemoteAccessServerHost["tls"],
  requestHandler: (req: IncomingMessage, res: ServerResponse) => void,
  onUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void,
): { server: Server; connections: HttpServerConnections } {
  const server = tls
    ? createHttpsServer({ cert: tls.cert, key: tls.key }, requestHandler)
    : createServer(requestHandler);
  const connections = new HttpServerConnections(server);
  server.on("upgrade", onUpgrade);
  return { server, connections };
}

export async function startListening(
  host: RemoteAccessServerHost,
): Promise<RemoteAccessServerInfo> {
  // Gate 6 items 4.1/4.2: a plaintext all-interfaces bind starts only with
  // the explicit acknowledgement — OR with configured TLS material, which
  // makes the wide bind encrypted. Enforced here (not just at config
  // resolution) so a programmatically supplied host cannot bypass it.
  const bindRefusal = remoteAccessBindRefusal(host.options.host, {
    tlsConfigured: host.tls !== null,
  });
  if (bindRefusal) throw new Error(`[poracode] ${bindRefusal}`);
  const maxAttempts = host.options.listenRetryAttempts ?? DEFAULT_LISTEN_RETRY_ATTEMPTS;
  for (let attempt = 1; ; attempt += 1) {
    if (host.stopping) throw new Error("Remote access server is stopping.");
    try {
      await listenOnce(host);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE" || attempt >= maxAttempts || host.stopping) throw error;
      try {
        await delay(host.options.listenRetryDelayMs ?? DEFAULT_LISTEN_RETRY_DELAY_MS, undefined, {
          signal: host.listenCancellation.signal,
        });
      } catch {
        throw new Error("Remote access server is stopping.");
      }
    }
  }

  if (host.stopping) throw new Error("Remote access server is stopping.");

  const address = host.server.address() as AddressInfo;
  const localHttpBaseUrl = resolveLocalHttpBaseUrl(host, address.port);
  const httpBaseUrl = resolveHttpBaseUrl(host, address.port);
  const pairingCredential = host.auth.issuePairingCredential({
    label: "Startup pairing",
  });
  host.activePairingCredential = pairingCredential.credential;
  recordAudit(host, "pair", {
    detail: { label: "Startup pairing", scopes: pairingCredential.scopes.join(" ") },
  });

  host.info = {
    httpBaseUrl,
    localHttpBaseUrl,
    ...(host.options.tailscaleHttpBaseUrl
      ? { tailscaleHttpBaseUrl: new URL(host.options.tailscaleHttpBaseUrl).origin }
      : {}),
    wsBaseUrl: toWebSocketUrl(httpBaseUrl).toString(),
    pairingUrl: mintPairingUrl(host, httpBaseUrl, pairingCredential.credential),
    pairingExpiresAt: pairingCredential.expiresAt,
  };
  host.heartbeat.start();
  return host.info;
}

function listenOnce(host: RemoteAccessServerHost): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      host.server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      host.server.off("error", onError);
      resolve();
    };
    host.server.once("error", onError);
    host.server.once("listening", onListening);
    try {
      host.server.listen(host.options.port, host.options.host);
    } catch (error) {
      host.server.off("error", onError);
      host.server.off("listening", onListening);
      reject(error);
    }
  });
}

/**
 * Closes admission, then joins listener startup, transports and actual owned
 * continuations. A disconnected client or a transport deadline is never
 * evidence that a handler can no longer write to the database.
 *
 * Connected clients first get one standards-based going-away close frame
 * (RFC 6455 1001, no new protocol event) through
 * {@link announceRemoteServerShutdown}. The announcement is queued, not
 * awaited: a cooperating client closes at once, and one that ignores the frame
 * is destroyed by the same `connections.close(grace)` deadline that bounded
 * shutdown before the announcement existed, so the overall transport budget is
 * unchanged. Terminating every socket first (the old behavior) reached the
 * same bound but never told the client the server was going down.
 */
export async function finishDispose(host: RemoteAccessServerHost): Promise<void> {
  host.heartbeat.stop();
  announceRemoteServerShutdown(host);
  host.clients.clear();
  host.replayingClients.clear();
  host.clientLiveness.clear();
  host.terminalWatches.clear();
  host.terminalCursorSync.clearAll();
  host.terminalBaselineStreams.clearAll();
  host.desktopInternalClients.clear();
  host.desktopReplayingClients.clear();
  host.desktopEventBuffer.length = 0;
  host.gitStateInterests.clear();
  host.itemInterests.clear();
  void Promise.resolve(host.notifyEventInterestsChanged()).catch(() => {});
  // Abort host-side gateway requests before waiting for handlers. A public
  // key fetch can otherwise hold the handler until its transport timeout.
  await host.options.pushRegistrations?.dispose?.();
  const webSocketsClosed = new Promise<void>((resolve) => host.wss.close(() => resolve()));
  await host.starting?.catch(() => undefined);
  await Promise.all([
    host.connections.close(host.options.shutdownConnectionGraceMs ?? 5_000),
    webSocketsClosed,
  ]);
  await host.work.drain();
  await host.options.audit?.flush?.();
  host.supervisorEventListeners.clear();
  host.info = null;
  host.activePairingCredential = null;
}

/**
 * Advertised HTTP base URL (trailing slash). A full `advertisedBaseUrl`
 * (Tailscale HTTPS / custom public origin) wins over the bind host+port; its
 * origin is used verbatim so the reverse proxy's own port (443) is advertised
 * rather than the local listen port.
 */
function resolveHttpBaseUrl(host: RemoteAccessServerHost, listenPort: number): string {
  const advertisedBaseUrl = host.options.advertisedBaseUrl?.trim();
  if (advertisedBaseUrl) {
    try {
      return `${new URL(advertisedBaseUrl).origin}/`;
    } catch {
      // Fall through to the host/port form on a malformed advertised URL.
    }
  }
  return `${resolveLocalHttpBaseUrl(host, listenPort)}/`;
}

function resolveLocalHttpBaseUrl(host: RemoteAccessServerHost, listenPort: number): string {
  const bindHost = host.options.host;
  const advertised =
    host.options.advertisedHost?.trim() ||
    (bindHost === "0.0.0.0" || bindHost === "::" ? "127.0.0.1" : bindHost);
  const scheme = host.tls ? "https" : "http";
  return `${scheme}://${normalizeHostForUrl(advertised)}:${listenPort}`;
}
