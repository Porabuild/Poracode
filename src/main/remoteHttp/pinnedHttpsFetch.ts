import { Agent, request } from "node:https";
import { connect, type ConnectionOptions } from "node:tls";
import { createHash } from "node:crypto";
import { Readable, type Transform } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

const PINNED_AGENT_POOL_MAX = 32;
const PINNED_AGENT_MAX_SOCKETS = 32;
const PINNED_AGENT_MAX_FREE_SOCKETS = 16;
const PINNED_AGENT_KEEP_ALIVE_MS = 30_000;
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
      if (entry.lastUsedAt < cutoff && Object.keys(entry.agent.sockets).length === 0) {
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
    maxSockets: PINNED_AGENT_MAX_SOCKETS,
    maxFreeSockets: PINNED_AGENT_MAX_FREE_SOCKETS,
  });
  agent.createConnection = (options, callback) => {
    const socket = connect({
      ...options,
      rejectUnauthorized: false,
    } as ConnectionOptions);
    const failed = (error: Error) => callback?.(error, socket);
    socket.once("error", failed);
    socket.once("secureConnect", () => {
      const raw = socket.getPeerCertificate().raw;
      if (!raw || createHash("sha256").update(raw).digest("hex") !== fingerprint) {
        evictAgent(key);
        socket.destroy(new Error("certificate_fingerprint_mismatch"));
        return;
      }
      socket.removeListener("error", failed);
      callback?.(null, socket);
    });
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

/**
 * Pooled keep-alive TLS transport pinned to one exact peer leaf SHA-256
 * fingerprint per `(origin, fingerprint)`. No HTTP byte is ever sent on a new
 * TLS socket until its leaf matches; redirects are returned, never followed.
 * Negotiates gzip/br/deflate compression and transparently decompresses like
 * standard Fetch.
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
  const { key, agent } = getOrCreatePinnedAgent(parsedUrl.origin, fingerprint);
  const method = (init.method ?? "GET").toUpperCase();
  const outgoingHeaders = new Headers(init.headers);
  if (!outgoingHeaders.has("accept-encoding") && method !== "HEAD") {
    outgoingHeaders.set("accept-encoding", "gzip, deflate, br");
  }
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      parsedUrl,
      {
        agent,
        method,
        headers: Object.fromEntries(outgoingHeaders),
        ...(init.signal ? { signal: init.signal } : {}),
      },
      (res) => {
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
          resolve(
            new Response(null, {
              status,
              statusText: res.statusMessage ?? "",
              headers,
            }),
          );
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
        resolve(
          new Response(Readable.toWeb(bodyStream) as ReadableStream<Uint8Array>, {
            status,
            statusText: res.statusMessage ?? "",
            headers,
          }),
        );
      },
    );
    req.once("error", (error) => {
      if (error instanceof Error && error.message === "certificate_fingerprint_mismatch") {
        evictAgent(key);
      }
      reject(error);
    });
    req.end(init.body);
  });
}
