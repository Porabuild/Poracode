import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual, X509Certificate } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { connect } from "node:tls";
import {
  formatCertFingerprint,
  isCleartextLanUrl,
  normalizePairingEndpoint,
  PAIRING_CERT_FINGERPRINT_PREFIX,
  parsePairingCertFingerprint,
  parsePairingUrlParts,
} from "@/shared/remote/pairingUrl";
import { REMOTE_OPERATOR_SCOPES } from "@/shared/remote/protocol/core";
import {
  RemoteDesktopClient,
  type RemoteFetch,
  type RemoteTokenSnapshot,
} from "@/shared/remote/client";
import {
  REMOTE_SOCKET_POLICY,
  RemoteSocketHealthMonitor,
  RemoteSocketReconnectPolicy,
} from "@/shared/remote/socketPolicy";
import { logAdapterDebug } from "./diagnostics";
import { record, stringValue } from "./toolMapping";
import {
  parseTuiSession,
  TUI_SESSION_FILE_NAME,
  TUI_SESSION_LOCK_NAME,
  TUI_SESSION_VERSION,
  tuiSessionSchema,
  type TuiSession,
} from "@/shared/tuiSession";

export type RemoteSocketFrame = {
  type: string;
  eventType?: string;
  space?: string;
  hasSequence: boolean;
  omittedRuntimeThreadCount: number;
};

export class RemoteTlsPinError extends Error {}

export type PinnedTlsCertificate = {
  fingerprint: string;
  pem: string;
};

export function verifyCertificateSan(certificate: X509Certificate, hostname: string): void {
  if (!certificate.subjectAltName)
    throw new RemoteTlsPinError("The paired TLS certificate has no subject alternative name.");
  const hostMatches = isIP(hostname)
    ? certificate.checkIP(hostname)
    : certificate.checkHost(hostname, { subject: "never" });
  if (!hostMatches)
    throw new RemoteTlsPinError(
      `The paired TLS certificate has no subject alternative name matching ${hostname}.`,
    );
}

export function verifyPinnedCertificate(
  der: Uint8Array,
  hostname: string,
  expectedFingerprint: string,
): PinnedTlsCertificate {
  const certificate = new X509Certificate(der);
  verifyCertificateSan(certificate, hostname);
  const fingerprint = formatCertFingerprint(createHash("sha256").update(der).digest("hex")).slice(
    PAIRING_CERT_FINGERPRINT_PREFIX.length,
  );
  const expected = formatCertFingerprint(expectedFingerprint).slice(
    PAIRING_CERT_FINGERPRINT_PREFIX.length,
  );
  const actualBytes = Buffer.from(fingerprint, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  if (!timingSafeEqual(actualBytes, expectedBytes))
    throw new RemoteTlsPinError(
      "The server TLS certificate does not match the fingerprint in the pairing link. Re-pair from the desktop after validating the endpoint.",
    );
  const base64 =
    Buffer.from(der)
      .toString("base64")
      .match(/.{1,64}/gu)
      ?.join("\n") ?? "";
  return {
    fingerprint,
    pem: `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----\n`,
  };
}

export async function probePinnedCertificate(
  endpoint: string,
  expectedFingerprint: string,
): Promise<PinnedTlsCertificate> {
  const url = new URL(endpoint);
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");
  return new Promise((resolve, reject) => {
    const socket = connect({
      host: hostname,
      port: url.port ? Number(url.port) : 443,
      rejectUnauthorized: false,
      ...(!isIP(hostname) ? { servername: hostname } : {}),
    });
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error, certificate?: PinnedTlsCertificate) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else if (certificate) resolve(certificate);
      else reject(new RemoteTlsPinError("The TLS endpoint did not provide a leaf certificate."));
    };
    timer = setTimeout(() => {
      finish(new RemoteTlsPinError("Timed out while checking the paired TLS certificate."));
    }, 10_000);
    socket.setTimeout(10_000, () =>
      finish(new RemoteTlsPinError("Timed out while checking the paired TLS certificate.")),
    );
    socket.once("error", (error) => finish(error));
    socket.once("secureConnect", () => {
      try {
        const raw = socket.getPeerCertificate(true).raw;
        if (!raw)
          throw new RemoteTlsPinError("The TLS endpoint did not provide a leaf certificate.");
        finish(undefined, verifyPinnedCertificate(raw, hostname, expectedFingerprint));
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

export function pairingEndpoint(pairingUrl: string): {
  endpoint: string;
  credential: string;
  certFingerprint?: string;
} {
  const pairing = parsePairingUrlParts(pairingUrl);
  if (!pairing) throw new Error("The Poracode pairing URL is invalid or has expired");
  const endpoint = normalizePairingEndpoint(pairingUrl);
  const url = new URL(endpoint);
  const rawFingerprint = new URLSearchParams(pairing.url.hash.slice(1)).get("fp");
  const certFingerprint = parsePairingCertFingerprint(pairingUrl);
  if (rawFingerprint && !certFingerprint)
    throw new Error("The pairing URL contains an invalid TLS certificate fingerprint.");
  if (url.protocol === "http:" && isCleartextLanUrl(endpoint)) {
    throw new Error("Unencrypted Poracode connections are allowed only on loopback");
  }
  if (url.protocol === "http:") {
    if (certFingerprint) throw new Error("A TLS fingerprint was supplied for a non-TLS endpoint.");
    return { endpoint, credential: pairing.token };
  }
  if (url.protocol !== "https:") throw new Error("Poracode pairing requires HTTP or HTTPS.");
  if (!certFingerprint)
    throw new Error("The HTTPS pairing URL is missing its certificate fingerprint.");
  return { endpoint, credential: pairing.token, certFingerprint };
}

// The verified leaf PEM is stable while the endpoint holds its cert, so
// probing once per endpoint+fingerprint avoids a TLS handshake per request.
// A fetch failure drops the cache so the next request re-probes.
const verifiedPins = new Map<string, PinnedTlsCertificate>();

export function pinnedFetch(endpoint: string, certFingerprint: string | undefined): RemoteFetch {
  const cacheKey = certFingerprint ? `${endpoint}\0${certFingerprint}` : undefined;
  const certificate = async () => {
    if (!certFingerprint || !cacheKey) return undefined;
    const cached = verifiedPins.get(cacheKey);
    if (cached) return cached;
    const probed = await probePinnedCertificate(endpoint, certFingerprint);
    verifiedPins.set(cacheKey, probed);
    return probed;
  };
  return async (url, init) => {
    if (
      certFingerprint &&
      init?.certFingerprint &&
      init.certFingerprint.toLowerCase() !== certFingerprint
    )
      throw new RemoteTlsPinError("The request certificate pin does not match the pairing link.");
    const body =
      init?.body === undefined
        ? undefined
        : typeof init.body === "string"
          ? init.body
          : new Uint8Array(init.body).buffer;
    const send = (resolved: PinnedTlsCertificate | undefined) =>
      globalThis.fetch(url, {
        ...(init?.method ? { method: init.method } : {}),
        ...(init?.headers ? { headers: init.headers } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(init?.signal ? { signal: init.signal } : {}),
        ...(resolved ? { tls: { ca: resolved.pem } } : {}),
      } as RequestInit & { tls?: { ca: string } });
    try {
      return await send(await certificate());
    } catch (error) {
      // Never resend: the request may have reached the server (non-idempotent
      // POSTs), and a rotated cert changes the fingerprint so a re-probe
      // cannot help — drop the cached pin for the next attempt and rethrow.
      if (cacheKey) verifiedPins.delete(cacheKey);
      throw error;
    }
  };
}

function pinnedOptions(endpoint: string, certFingerprint: string | undefined) {
  return certFingerprint
    ? {
        certFingerprint,
        certFingerprintProbe: async () =>
          (await probePinnedCertificate(endpoint, certFingerprint)).fingerprint,
      }
    : {};
}

/** The saved session was rejected (or is unreadable): exit 77 so the CLI
 * re-pairs once and relaunches with a fresh pairing URL. */
export class TuiReauthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TuiReauthRequiredError";
  }
}

function sessionFilePath(home: string): string {
  return join(home, TUI_SESSION_FILE_NAME);
}

function readSessionFile(home: string): TuiSession | undefined {
  try {
    return parseTuiSession(JSON.parse(readFileSync(sessionFilePath(home), "utf8")));
  } catch {
    return undefined;
  }
}

function writeSessionFile(home: string, session: TuiSession): void {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const temporary = `${sessionFilePath(home)}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, sessionFilePath(home));
}

/**
 * Serializes refresh-token rotation across concurrent TUIs sharing one
 * session entry: the whole read-refresh-persist sequence runs under the lock,
 * so a rotation written by the winner is what the loser presents — not a
 * stale hash that would revoke the family. The lock file carries { pid, at };
 * a lock is broken when its holder process is gone or it outlives 90 s (a
 * refresh POST can take the 60 s request timeout plus the TLS probe).
 */
const SESSION_LOCK_STALE_MS = 90_000;
const SESSION_LOCK_WAIT_MS = 95_000;
// Between the holder's openSync("wx") and its writeFileSync the file is
// briefly empty or unparsable — that alone is not staleness.
const SESSION_LOCK_EMPTY_STALE_MS = 5_000;

function lockIsStale(lock: string): boolean {
  try {
    const holder = JSON.parse(readFileSync(lock, "utf8")) as { pid?: unknown; at?: unknown };
    if (typeof holder.pid === "number") {
      try {
        process.kill(holder.pid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
      }
    }
    if (typeof holder.at === "number" && Date.now() - holder.at > SESSION_LOCK_STALE_MS)
      return true;
    return false;
  } catch {
    // Unreadable or empty — normal while the holder is between open("wx") and
    // its write; stale only if it has stayed that way for ~5 s.
    try {
      return Date.now() - statSync(lock).mtimeMs > SESSION_LOCK_EMPTY_STALE_MS;
    } catch {
      // Gone between the failed read and stat — already released.
      return true;
    }
  }
}

async function withSessionLock<T>(home: string, run: () => Promise<T>): Promise<T> {
  const lock = join(home, TUI_SESSION_LOCK_NAME);
  const deadline = Date.now() + SESSION_LOCK_WAIT_MS;
  for (;;) {
    try {
      const handle = openSync(lock, "wx");
      try {
        writeFileSync(handle, JSON.stringify({ pid: process.pid, at: Date.now() }));
        return await run();
      } finally {
        closeSync(handle);
        rmSync(lock, { force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (lockIsStale(lock)) rmSync(lock, { force: true });
      else if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

function sessionTokens(session: TuiSession): RemoteTokenSnapshot {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: new Date(session.refreshExpiresAtMs).toISOString(),
  };
}

function persistedFrom(
  endpoint: string,
  certFingerprint: string | undefined,
  tokens: RemoteTokenSnapshot,
  sessionId: string | undefined,
): TuiSession {
  if (!tokens.refreshToken || !tokens.refreshTokenExpiresAt)
    throw new TuiReauthRequiredError("This host does not issue refreshable TUI sessions.");
  return tuiSessionSchema.parse({
    version: TUI_SESSION_VERSION,
    endpoint,
    ...(certFingerprint ? { certFingerprint } : {}),
    ...(sessionId ? { sessionId } : {}),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    refreshExpiresAtMs: Date.parse(tokens.refreshTokenExpiresAt),
  });
}

/** Session mode: connect with the saved session, validating it up front. */
export async function connectRemoteSession(home: string) {
  const session = readSessionFile(home);
  if (!session) throw new TuiReauthRequiredError("The saved TUI session is missing or expired.");
  const endpoint = session.endpoint;
  const certFingerprint = session.certFingerprint;
  const fetch = pinnedFetch(endpoint, certFingerprint);
  let tokens = sessionTokens(session);
  const persist = (next: RemoteTokenSnapshot) => {
    tokens = next;
    // Already inside runExclusive during refresh — write session.json
    // synchronously (temp + rename) without taking the lock again. A persist
    // failure must not fault the refresh itself.
    try {
      writeSessionFile(home, persistedFrom(endpoint, certFingerprint, next, session.sessionId));
    } catch (error) {
      void logAdapterDebug(home, {
        source: "session.persist",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const client = new RemoteDesktopClient(endpoint, tokens.accessToken, fetch, {
    ...pinnedOptions(endpoint, certFingerprint),
    tokenLifecycle: {
      runExclusive: (run) => withSessionLock(home, run),
      // Always reload under the lock: a concurrent TUI's rotation wins.
      refreshToken: () => readSessionFile(home)?.refreshToken,
      onTokensRefreshed: persist,
    },
  });
  try {
    await client.refreshTokens();
  } catch (error) {
    throw new TuiReauthRequiredError(
      `The saved TUI session was rejected (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
  return {
    client,
    ...(certFingerprint ? { socketTls: { endpoint, fingerprint: certFingerprint } } : {}),
    dispose: () => client.setTokenLifecycle(undefined),
  };
}

export async function createRemoteClient(pairingUrl: string, home?: string) {
  const pairing = pairingEndpoint(pairingUrl);
  const certFingerprint = pairing.certFingerprint;
  const fetch = pinnedFetch(pairing.endpoint, certFingerprint);
  const pinOptions = pinnedOptions(pairing.endpoint, certFingerprint);
  const pairingClient = new RemoteDesktopClient(pairing.endpoint, undefined, fetch, pinOptions);
  const result = await pairingClient.exchangePairingCredential({
    credential: pairing.credential,
    scopes: REMOTE_OPERATOR_SCOPES,
    client: { label: "Poracode TUI", deviceType: "desktop" },
    ...(certFingerprint ? { certFingerprint } : {}),
  });
  let tokens: RemoteTokenSnapshot = {
    accessToken: result.accessToken,
    ...(result.refreshToken ? { refreshToken: result.refreshToken } : {}),
    ...(result.refreshTokenExpiresAt
      ? { refreshTokenExpiresAt: result.refreshTokenExpiresAt }
      : {}),
  };
  const client = new RemoteDesktopClient(pairing.endpoint, tokens.accessToken, fetch, {
    ...pinOptions,
    tokenLifecycle: {
      ...(home ? { runExclusive: (run) => withSessionLock(home, run) } : {}),
      refreshToken: () => (home ? readSessionFile(home)?.refreshToken : tokens.refreshToken),
      onTokensRefreshed: (next) => {
        tokens = next;
        if (home)
          try {
            writeSessionFile(
              home,
              persistedFrom(pairing.endpoint, certFingerprint, next, result.sessionId),
            );
          } catch (error) {
            void logAdapterDebug(home, {
              source: "session.persist",
              error: error instanceof Error ? error.message : String(error),
            });
          }
      },
    },
  });
  if (home && tokens.refreshToken && tokens.refreshTokenExpiresAt)
    writeSessionFile(
      home,
      persistedFrom(pairing.endpoint, certFingerprint, tokens, result.sessionId),
    );
  return {
    client,
    ...(certFingerprint
      ? { socketTls: { endpoint: pairing.endpoint, fingerprint: certFingerprint } }
      : {}),
    dispose: () => client.setTokenLifecycle(undefined),
  };
}

export function connectRemoteSocket(
  client: RemoteDesktopClient,
  onEvent: (event: unknown) => void,
  onResync: () => void,
  onFrame?: (frame: RemoteSocketFrame) => void,
  tlsPin?: { endpoint: string; fingerprint: string },
  onTransportError?: (error: Error) => void,
) {
  const reconnect = new RemoteSocketReconnectPolicy();
  const seen = new Map<string, number>();
  let socket: WebSocket | undefined;
  let interests: string[] = [];
  let interestWaiters: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  let stopped = false;

  // `!command` dev shells opt into live PTY bytes per shell — high-volume
  // frames only stream to clients that sent `terminal-watch`. Re-sent after
  // every (re)connect the same way thread interests are.
  const watchedTerminals = new Set<string>();
  const terminalListeners = new Map<string, (data: string) => void>();
  const publishWatches = (current: WebSocket) => {
    for (const id of watchedTerminals) current.send(JSON.stringify({ type: "terminal-watch", id }));
  };
  const watchTerminal = (id: string, onOutput: (data: string) => void) => {
    watchedTerminals.add(id);
    terminalListeners.set(id, onOutput);
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type: "terminal-watch", id }));
  };
  const unwatchTerminal = (id: string) => {
    watchedTerminals.delete(id);
    terminalListeners.delete(id);
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type: "terminal-unwatch", id }));
  };
  const publishInterests = (current: WebSocket) => {
    current.send(JSON.stringify({ type: "thread-item-interests", threadIds: interests }));
    publishWatches(current);
    interestWaiters.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.resolve();
    });
    interestWaiters = [];
  };
  const setThreadInterests = (threadIds: readonly string[]): Promise<void> => {
    interests = [...new Set(threadIds)].slice(0, 20);
    if (stopped) return Promise.reject(new Error("Poracode event socket is stopped"));
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        publishInterests(socket);
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          interestWaiters = interestWaiters.filter((value) => value !== waiter);
          reject(new Error("Timed out waiting to publish thread-item interests"));
        }, 15_000),
      };
      interestWaiters.push(waiter);
    });
  };

  const run = async () => {
    for (;;) {
      if (stopped) break;
      try {
        const ticket = await client.websocketTicket();
        if (stopped) break;
        const url = client.websocketUrl(ticket, seen.get("loopback") ?? null, {
          threadItemInterests: interests,
        });
        const websocket = tlsPin
          ? createPinnedWebSocket(
              url,
              await probePinnedCertificate(tlsPin.endpoint, tlsPin.fingerprint),
            )
          : new WebSocket(url);
        socket = websocket;
        await new Promise<void>((resolve) => {
          websocket.onopen = () => resolve();
          websocket.onerror = () => resolve();
        });
        if (websocket.readyState !== WebSocket.OPEN) {
          websocket.close();
          throw new Error("Poracode event socket failed to open");
        }
        reconnect.reset();
        publishInterests(websocket);
        const health = new RemoteSocketHealthMonitor<WebSocket>({
          isCurrent: (candidate) => socket === candidate,
          isOpen: (candidate) => candidate.readyState === WebSocket.OPEN,
          send: (candidate, payload) => candidate.send(payload),
          onDead: (candidate) => candidate.close(),
          timeoutMs: REMOTE_SOCKET_POLICY.healthPingTimeoutMs,
        });
        const heartbeat = setInterval(
          () => health.probe(websocket),
          REMOTE_SOCKET_POLICY.healthPingIntervalMs,
        );
        let resyncIssued = false;
        await new Promise<void>((resolve) => {
          websocket.onmessage = (message) => {
            const parsed = client.tryParseSocketMessage(String(message.data));
            if (!parsed) {
              onFrame?.({ type: "invalid", hasSequence: false, omittedRuntimeThreadCount: 0 });
              seen.clear();
              onResync();
              websocket.close();
              return;
            }
            const eventType =
              parsed.type === "event" ? stringValue(record(parsed.event).type) : undefined;
            onFrame?.({
              type: parsed.type,
              ...(eventType ? { eventType } : {}),
              ...(parsed.type === "event" && parsed.space ? { space: parsed.space } : {}),
              hasSequence: "seq" in parsed,
              omittedRuntimeThreadCount:
                parsed.type === "event" ? (parsed.omittedRuntimeThreadIds?.length ?? 0) : 0,
            });
            if (parsed.type === "terminal-output") {
              terminalListeners.get(parsed.id)?.(parsed.data);
              return;
            }
            if (parsed.type === "pong") {
              health.acceptPong(parsed.id);
              return;
            }
            if (parsed.type === "ready") {
              if (!seen.has("loopback")) seen.set("loopback", parsed.seq);
              return;
            }
            if (parsed.type === "resync-required") {
              seen.clear();
              resyncIssued = true;
              onResync();
              websocket.close();
              return;
            }
            if (parsed.type === "event") {
              const space = parsed.space ?? "loopback";
              const previous = seen.get(space);
              if (previous !== undefined && parsed.seq <= previous) return;
              if (previous !== undefined && parsed.seq !== previous + 1) {
                seen.clear();
                resyncIssued = true;
                onResync();
                websocket.close();
                return;
              }
              seen.set(space, parsed.seq);
              onEvent(parsed.event);
            }
          };
          websocket.onclose = () => resolve();
          websocket.onerror = () => resolve();
        });
        clearInterval(heartbeat);
        health.reset();
        if (!stopped && !resyncIssued) onResync();
      } catch (error) {
        socket = undefined;
        if (error instanceof RemoteTlsPinError) {
          stopped = true;
          onTransportError?.(error);
        }
      }
      if (stopped) break;
      await new Promise((resolve) => setTimeout(resolve, reconnect.nextDelay()));
    }
  };

  void run();
  return {
    setThreadInterests,
    watchTerminal,
    unwatchTerminal,
    dispose() {
      stopped = true;
      interestWaiters.forEach((waiter) => {
        clearTimeout(waiter.timer);
        waiter.reject(
          new Error("Poracode event socket stopped before publishing thread interests"),
        );
      });
      interestWaiters = [];
      socket?.close();
      socket = undefined;
    },
  };
}

function createPinnedWebSocket(url: string, certificate: PinnedTlsCertificate) {
  const BunWebSocket = WebSocket as unknown as new (
    url: string,
    options: { tls: { ca: string } },
  ) => WebSocket;
  return new BunWebSocket(url, { tls: { ca: certificate.pem } });
}
