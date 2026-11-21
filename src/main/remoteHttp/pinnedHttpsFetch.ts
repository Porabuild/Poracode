import { Agent, request } from "node:https";
import { connect, type ConnectionOptions } from "node:tls";
import { createHash } from "node:crypto";
import { Readable, type Transform } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import {
  destroyIdleAgentSockets,
  isSafeRetryableHttpMethod,
  isStaleKeepAliveSocketError,
} from "@/shared/http";

const PINNED_AGENT_POOL_MAX = 32;
const PINNED_AGENT_MAX_SOCKETS = 32;
const PINNED_AGENT_MAX_FREE_SOCKETS = 16;
const PINNED_AGENT_KEEP_ALIVE_MS = 30_000;
/**
 * Idle free-socket TTL strictly shorter than Node's default 5s server
 * `keepAliveTimeout`, so pooled sockets retire cleanly on the client side
 * before an older remote host or intermediary drops them. Active requests are
 * never timed out because `ClientRequest` does not attach a `timeout` listener.
 */
const PINNED_AGENT_FREE_SOCKET_IDLE_MS = 4_000;
const PINNED_AGENT_IDLE_SWEEP_MS = 120_000;

interface PooledPinnedAgent {
  readonly agent: Agent;
  lastUsedAt: number;
}

const agentPool = new Map<string, PooledPinnedAgent>();
let idleSweepTimer: ReturnType<typeof setInterval> | null = null;

function unrefTimer(timer: ReturnType<typeof setInterval>): void {
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    (timer as { unref?: () => void }).unref?.();
  }
}

function hasActiveSockets(agent: Agent): boolean {
  return (
    Object.values(agent.sockets).some((sockets) => (sockets?.length ?? 0) > 0) ||
    Object.values(agent.requests).some((requests) => (requests?.length ?? 0) > 0)
  );
}

function evictAgent(key: string): void {
  const entry = agentPool.get(key);
  if (!entry) return;
  agentPool.delete(key);
  entry.agent.destroy();
  if (agentPool.size === 0 && idleSweepTimer !== null) {
    clearInterval(idleSweepTimer);
    idleSweepTimer = null;
  }
}

function ensureIdleSweep(): void {
  if (idleSweepTimer !== null) return;
  idleSweepTimer = setInterval(() => {
    const cutoff = Date.now() - PINNED_AGENT_IDLE_SWEEP_MS;
    for (const [key, entry] of [...agentPool]) {
      if (entry.lastUsedAt < cutoff && !hasActiveSockets(entry.agent)) {
        evictAgent(key);
      }
    }
  }, PINNED_AGENT_IDLE_SWEEP_MS);
  unrefTimer(idleSweepTimer);
}

function getOrCreatePinnedAgent(
  origin: string,
  fingerprint: string,
): {
  readonly key: string;
  readonly agent: Agent;
} {
  const key = `${origin}\0${fingerprint}`;
  const existing = agentPool.get(key);
  if (existing) {
    existing.lastUsedAt = Date.now();
    // Refresh insertion order for LRU eviction.
    agentPool.delete(key);
    agentPool.set(key, existing);
    return { key, agent: existing.agent };
  }

  while (agentPool.size >= PINNED_AGENT_POOL_MAX) {
    const oldest = agentPool.keys().next().value;
    if (oldest === undefined) break;
    evictAgent(oldest);
  }

  const agent = new Agent({
    keepAlive: true,
    keepAliveMsecs: PINNED_AGENT_KEEP_ALIVE_MS,
    scheduling: "lifo",
    timeout: PINNED_AGENT_FREE_SOCKET_IDLE_MS,
    maxSockets: PINNED_AGENT_MAX_SOCKETS,
    maxFreeSockets: PINNED_AGENT_MAX_FREE_SOCKETS,
  });
  agent.createConnection = (options, callback) => {
    const socket = connect({
      ...options,
      rejectUnauthorized: false,
    } as ConnectionOptions);
    let settled = false;
    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
      socket.removeListener("secureConnect", onSecureConnect);
      if (error) {
        // Keep an error sink attached while tearing down the failed socket so
        // `destroy()` cannot emit an unhandled `'error'` event.
        socket.on("error", () => {});
        if (!socket.destroyed) {
          socket.destroy(error);
        }
        callback?.(error, socket);
        return;
      }
      callback?.(null, socket);
    };
    const onError = (error: Error) => finish(error);
    const onClose = () => finish(new Error("TLS socket closed before handshake completed."));
    const onSecureConnect = () => {
      const raw = socket.getPeerCertificate().raw;
      if (!raw || createHash("sha256").update(raw).digest("hex") !== fingerprint) {
        evictAgent(key);
        finish(new Error("certificate_fingerprint_mismatch"));
        return;
      }
      finish(null);
    };
    socket.once("error", onError);
    socket.once("close", onClose);
    socket.once("secureConnect", onSecureConnect);
    // Deliberately do not return the socket: Agent must wait for validation.
    return undefined;
  };

  agentPool.set(key, { agent, lastUsedAt: Date.now() });
  ensureIdleSweep();
  return { key, agent };
}

/** Destroy every pooled pinned-TLS agent (utility shutdown / test cleanup). */
export function closePinnedHttpsAgents(): void {
  for (const key of [...agentPool.keys()]) {
    evictAgent(key);
  }
}

function decoderForContentEncoding(encoding: string | undefined): Transform | null {
  if (!encoding) return null;
  const normalized = encoding.trim().toLowerCase();
  if (normalized === "gzip" || normalized === "x-gzip") return createGunzip();
  if (normalized === "br") return createBrotliDecompress();
  if (normalized === "deflate") return createInflate();
  return null;
}

type PinnedHttpsAttemptOutcome =
  | { readonly kind: "ok"; readonly response: Response }
  | { readonly kind: "stale-reused-socket"; readonly error: unknown }
  | { readonly kind: "error"; readonly error: unknown };

function executePinnedHttpsRequest(
  parsedUrl: URL,
  method: string,
  outgoingHeaders: Headers,
  init: RequestInit,
  key: string,
  agent: Agent,
): Promise<PinnedHttpsAttemptOutcome> {
  return new Promise<PinnedHttpsAttemptOutcome>((resolve) => {
    let settled = false;
    let responseReceived = false;
    const req = request(
      parsedUrl,
      {
        agent,
        method,
        headers: Object.fromEntries(outgoingHeaders),
        ...(init.signal ? { signal: init.signal } : {}),
      },
      (res) => {
        responseReceived = true;
        const entry = agentPool.get(key);
        if (entry) entry.lastUsedAt = Date.now();
        const headers = new Headers();
        for (let i = 0; i < res.rawHeaders.length; i += 2) {
          headers.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
        }
        const status = res.statusCode ?? 502;
        const noBody = method === "HEAD" || [204, 205, 304].includes(status);
        if (noBody) {
          res.resume();
          if (settled) return;
          settled = true;
          resolve({
            kind: "ok",
            response: new Response(null, {
              status,
              statusText: res.statusMessage ?? "",
              headers,
            }),
          });
          return;
        }
        const contentEncoding = headers.get("content-encoding") ?? undefined;
        const decoder = decoderForContentEncoding(contentEncoding);
        let bodyStream: Readable = res;
        if (decoder) {
          headers.delete("content-encoding");
          headers.delete("content-length");
          res.on("error", (error) => decoder.destroy(error));
          decoder.once("close", () => {
            if (!res.complete) res.destroy();
          });
          res.pipe(decoder);
          bodyStream = decoder;
        }
        if (settled) return;
        settled = true;
        resolve({
          kind: "ok",
          response: new Response(Readable.toWeb(bodyStream) as ReadableStream<Uint8Array>, {
            status,
            statusText: res.statusMessage ?? "",
            headers,
          }),
        });
      },
    );
    // Keep listening after settlement so a late secondary error (e.g. abort +
    // mid-body reset) cannot surface as an uncaught exception and crash the
    // remote HTTP bridge utility process.
    req.on("error", (error) => {
      if (error instanceof Error && error.message === "certificate_fingerprint_mismatch") {
        evictAgent(key);
      }
      if (settled) return;
      settled = true;
      if (!responseReceived && req.reusedSocket && isStaleKeepAliveSocketError(error)) {
        resolve({ kind: "stale-reused-socket", error });
        return;
      }
      resolve({ kind: "error", error });
    });
    if (init.body != null) {
      req.end(init.body);
    } else {
      req.end();
    }
  });
}

/**
 * Pooled keep-alive TLS transport pinned to one exact peer leaf SHA-256
 * fingerprint per `(origin, fingerprint)`. No HTTP byte is ever sent on a new
 * TLS socket until its leaf matches; redirects are returned, never followed.
 * Negotiates gzip/br/deflate compression and transparently decompresses like
 * standard Fetch. Safe bodyless requests (`GET`, `HEAD`, `OPTIONS`) retry once
 * on a fresh verified TLS connection if a pooled keep-alive socket resets
 * before response headers arrive.
 */
export async function pinnedHttpsFetch(
  url: string,
  init: RequestInit,
  fingerprint: string,
): Promise<Response> {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("A certificate pin requires HTTPS.");
  }
  const method = (init.method ?? "GET").toUpperCase();
  const outgoingHeaders = new Headers(init.headers);
  if (!outgoingHeaders.has("accept-encoding") && method !== "HEAD") {
    outgoingHeaders.set("accept-encoding", "gzip, deflate, br");
  }
  const canRetryStaleSocket = isSafeRetryableHttpMethod(method) && init.body == null;
  const run = async (allowStaleRetry: boolean): Promise<Response> => {
    const { key, agent } = getOrCreatePinnedAgent(parsedUrl.origin, fingerprint);
    const outcome = await executePinnedHttpsRequest(
      parsedUrl,
      method,
      outgoingHeaders,
      init,
      key,
      agent,
    );
    if (outcome.kind === "ok") return outcome.response;
    if (
      outcome.kind === "stale-reused-socket" &&
      allowStaleRetry &&
      canRetryStaleSocket &&
      !init.signal?.aborted
    ) {
      destroyIdleAgentSockets(agent);
      return run(false);
    }
    throw outcome.error;
  };
  return run(true);
}
