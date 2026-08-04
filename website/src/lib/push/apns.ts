import http2 from "node:http2";
import type { ApnsConfig } from "./config";
import { buildApnsHeaders, parseApnsReason } from "./headers";
import { getProviderToken } from "./jwt";
import type { IosPushRequest } from "./validate";

const REQUEST_TIMEOUT_MS = 10_000;

export interface ApnsResult {
  status: number;
  apnsId?: string;
  reason?: string;
}

/** Thrown for gateway-side failures (connect/timeout) → surfaced as 502. */
export class ApnsUnreachableError extends Error {}

// One HTTP/2 session per host, reused across requests on a warm instance and
// lazily reconnected when it errors, receives GOAWAY, or closes.
let session: http2.ClientHttp2Session | null = null;
let sessionHost: string | null = null;

function getSession(host: string): http2.ClientHttp2Session {
  if (session && sessionHost === host && !session.closed && !session.destroyed) {
    return session;
  }
  if (session && !session.destroyed) {
    try {
      session.close();
    } catch {
      // ignore: replacing it anyway
    }
  }

  const next = http2.connect(`https://${host}`);
  session = next;
  sessionHost = host;

  const drop = () => {
    if (session === next) {
      session = null;
      sessionHost = null;
    }
  };
  next.on("error", drop);
  next.on("goaway", drop);
  next.on("close", drop);
  // Don't keep the process alive on account of an idle APNs session.
  next.unref?.();

  return next;
}

/**
 * Forward a validated push to APNs over HTTP/2 and relay its result. The
 * `signToken`/`connect` seams are injectable so the pure request-building path
 * can be exercised without a live TLS connection.
 */
export async function sendToApns(
  config: ApnsConfig,
  req: IosPushRequest,
  deps: {
    signToken?: (c: ApnsConfig) => string;
    getSessionFor?: (host: string) => http2.ClientHttp2Session;
  } = {},
): Promise<ApnsResult> {
  const signToken = deps.signToken ?? getProviderToken;
  const getSessionFor = deps.getSessionFor ?? getSession;

  const headers = {
    ...buildApnsHeaders(config, req),
    authorization: `bearer ${signToken(config)}`,
  };

  let client: http2.ClientHttp2Session;
  try {
    client = getSessionFor(config.host);
  } catch {
    throw new ApnsUnreachableError("failed to open APNs session");
  }

  return await new Promise<ApnsResult>((resolve, reject) => {
    let stream: http2.ClientHttp2Stream;
    try {
      stream = client.request({
        ":method": "POST",
        ":path": `/3/device/${req.token}`,
        ...headers,
      });
    } catch {
      reject(new ApnsUnreachableError("failed to open APNs stream"));
      return;
    }

    let status = 0;
    let apnsId: string | undefined;
    const chunks: Buffer[] = [];

    stream.setTimeout(REQUEST_TIMEOUT_MS, () => {
      stream.close(http2.constants.NGHTTP2_CANCEL);
      reject(new ApnsUnreachableError("APNs request timed out"));
    });

    stream.on("response", (h) => {
      status = Number(h[":status"] ?? 0);
      const id = h["apns-id"];
      apnsId = Array.isArray(id) ? id[0] : id;
    });
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("error", () => reject(new ApnsUnreachableError("APNs stream error")));
    stream.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const reason = parseApnsReason(body);
      resolve({ status, ...(apnsId ? { apnsId } : {}), ...(reason ? { reason } : {}) });
    });

    stream.end(JSON.stringify(req.payload));
  });
}
