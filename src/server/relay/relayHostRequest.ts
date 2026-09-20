import { headersToRecord, readBoundedResponseBody } from "@/shared/http";
import { relayDialOriginHeaders } from "./relayDialOrigin";
import { isRelayBoundCredential } from "./relayChannelBinding";
import type { RelayRequestFrame } from "@/shared/remote/relayProtocol";
import type { RelaySocket } from "./relayHost";
import {
  TOKEN_EXCHANGE_PATHNAME,
  TOKEN_EXCHANGE_REWRITE_MAX_BYTES,
  apiDispatchHeaders,
  forwardHeaders,
  type PendingLocalRequest,
  type RelayHostRuntime,
} from "./relayHostTypes";
import { sendOn, waitForControlRoom } from "./relayHostSend";

/** Whether this relayed request is the pairing-credential exchange whose
 * 200 response carries the raw access token. */
function isTokenExchangeRequest(frame: Pick<RelayRequestFrame, "method" | "path">): boolean {
  if (frame.method.toUpperCase() !== "POST") return false;
  try {
    return new URL(frame.path, "http://local").pathname === TOKEN_EXCHANGE_PATHNAME;
  } catch {
    return false;
  }
}

/**
 * Restores raw credentials for the loopback hop. A visitor credential issued
 * through THIS relay enrollment arrives bound (`lcb1_…`); the server only
 * knows raw tokens, so the adapter unwraps the Authorization header and the
 * image-route `access_token` query parameter before the local fetch.
 * Anything that does not unwrap (raw tokens from direct pairing, foreign or
 * malformed values) passes through untouched and the server's own auth path
 * answers it — old clients and direct-paired bearers keep working.
 */
function unwrapBoundCredentials(
  rt: RelayHostRuntime,
  frame: RelayRequestFrame,
): { readonly path: string; readonly headers: Record<string, string> } {
  /** Splits a bearer credential out of an Authorization header value
   * (`Bearer <token>`); returns null for other schemes or bare values. */
  const bearerOf = (value: string): string | null => {
    const match = /^bearer\s+(.+)$/i.exec(value.trim());
    return match ? (match[1]?.trim() ?? null) : null;
  };
  const headers: Record<string, string> = {};
  let path = frame.path;
  for (const [key, value] of Object.entries(frame.headers)) {
    if (key.toLowerCase() === "authorization") {
      const trimmed = value.trim();
      const credential = bearerOf(trimmed) ?? trimmed;
      if (isRelayBoundCredential(credential)) {
        const unwrapped = rt.channelBinding.unbind(credential);
        if (unwrapped !== null) {
          headers[key] = `Bearer ${unwrapped}`;
          continue;
        }
      }
    }
    headers[key] = value;
  }
  if (path.includes("access_token=")) {
    try {
      const url = new URL(path, "http://local");
      const bound = url.searchParams.get("access_token");
      if (bound !== null && isRelayBoundCredential(bound)) {
        const unwrapped = rt.channelBinding.unbind(bound);
        if (unwrapped !== null) {
          url.searchParams.set("access_token", unwrapped);
          path = url.toString().slice("http://local".length);
        }
      }
    } catch {
      // Not a parsable URL: leave it alone, the local fetch will answer.
    }
  }
  return { path, headers };
}

/** Unwraps a bound `refreshToken` field from a token-exchange JSON body.
 * Anything else (raw tokens, malformed JSON, non-object bodies) passes
 * through untouched and the server's own validation answers it. */
function unwrapBoundRefreshToken(rt: RelayHostRuntime, body: Buffer): Buffer {
  const text = body.toString("utf8");
  if (body.byteLength > TOKEN_EXCHANGE_REWRITE_MAX_BYTES) return body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return body;
  }
  if (!parsed || typeof parsed !== "object") return body;
  const record = parsed as Record<string, unknown>;
  if (typeof record.refreshToken !== "string" || !isRelayBoundCredential(record.refreshToken)) {
    return body;
  }
  const unwrapped = rt.channelBinding.unbind(record.refreshToken);
  if (unwrapped === null) return body;
  record.refreshToken = unwrapped;
  return Buffer.from(JSON.stringify(record), "utf8");
}

/**
 * Channel binding at issuance: the exchange response's raw access token is
 * replaced with the relay-bound credential before it crosses the relay, so
 * the raw token never leaves the host. Reads the (small) response body once
 * and rebuilds the response so the buffered and streaming paths below carry
 * the rewritten bytes unchanged. Any response that is not a 200 JSON token
 * result — errors, foreign shapes, oversized bodies — is returned as-is.
 */
async function bindTokenExchangeResponse(
  rt: RelayHostRuntime,
  response: Awaited<ReturnType<RelayHostRuntime["fetchImpl"]>>,
): Promise<Awaited<ReturnType<RelayHostRuntime["fetchImpl"]>>> {
  if (response.status !== 200) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return response;
  // Bounded by TOKEN_EXCHANGE_REWRITE_MAX_BYTES; a stalled body read unwinds
  // through the request's own AbortController (entry timeout / req-cancel).
  const buffer = await readBoundedResponseBody(response, TOKEN_EXCHANGE_REWRITE_MAX_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(buffer).toString("utf8"));
  } catch {
    throw new Error("token exchange response was not valid JSON");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { accessToken?: unknown }).accessToken !== "string" ||
    (parsed as { accessToken: string }).accessToken.length === 0
  ) {
    throw new Error("token exchange response did not carry an access token");
  }
  const result = parsed as Record<string, unknown>;
  result.accessToken = rt.channelBinding.bind(result.accessToken as string);
  // Deep-review fix: the rotating refresh token is a 30-day credential —
  // binding only the access half left a relay-log capture replayable
  // OFF-relay via the refresh grant. Bind it symmetrically when present.
  if (
    typeof result.refreshToken === "string" &&
    result.refreshToken.length > 0 &&
    !isRelayBoundCredential(result.refreshToken)
  ) {
    result.refreshToken = rt.channelBinding.bind(result.refreshToken);
  }
  // The exchange response is a plain JSON document (no cookies, no content
  // encoding — the fetch layer already decoded it), so rebuilding it from
  // the same status/headers preserves everything the visitor expects.
  const rewritten = new Response(JSON.stringify(result), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  return rewritten as Awaited<ReturnType<RelayHostRuntime["fetchImpl"]>>;
}

export async function handleRelayHostRequest(
  rt: RelayHostRuntime,
  frame: RelayRequestFrame,
  sourceControl: RelaySocket,
): Promise<void> {
  const controller = new AbortController();
  const timeoutError = new Error(`local request timed out after ${rt.requestTimeoutMs}ms`);
  let rejectTimedOut: (error: Error) => void = () => {};
  const timedOut = new Promise<never>((_, reject) => {
    rejectTimedOut = reject;
  });
  const entry: PendingLocalRequest = {
    controller,
    // Only the timeout path leaves the entry registered — the catch below
    // owns deleting it and answering `req-error`. A canceled request's entry
    // is already gone, so its timer (if not yet cleared) finds nothing to do.
    timeout: setTimeout(() => {
      if (rt.pendingRequests.get(frame.id) === entry) {
        controller.abort();
        rejectTimedOut(timeoutError);
      }
    }, rt.requestTimeoutMs),
  };
  rt.pendingRequests.set(frame.id, entry);
  entry.timeout.unref?.();
  // Streaming idle semantics: once headers are out, every sent chunk re-arms
  // the local deadline so a slow-but-progressing response is never retired
  // mid-stream while a stalled one still unwinds within requestTimeoutMs.
  const rearmLocalIdle = (): void => {
    clearTimeout(entry.timeout);
    entry.timeout = setTimeout(() => {
      if (rt.pendingRequests.get(frame.id) === entry) {
        controller.abort();
        rejectTimedOut(timeoutError);
      }
    }, rt.requestTimeoutMs);
    entry.timeout.unref?.();
  };
  try {
    // Refresh-grant requests carry the (bound) refresh token in the JSON
    // body, not the Authorization header; unwrap it for the loopback hop
    // exactly like the header credential (deep-review fix — the response
    // side binds it symmetrically).
    const body =
      frame.body === undefined
        ? undefined
        : isTokenExchangeRequest(frame)
          ? unwrapBoundRefreshToken(rt, Buffer.from(frame.body, "base64"))
          : Buffer.from(frame.body, "base64");
    // Channel binding first: unwrap relay-bound visitor credentials for the
    // loopback hop (see `unwrapBoundCredentials`), THEN strip hop-by-hop /
    // relay-specific headers; the local fetch sets its own host and
    // content-length for the (re-encoded) body. Any client-supplied
    // x-forwarded-for is dropped so a visitor can't spoof its own bucket.
    const { path: localPath, headers: visitorHeaders } = unwrapBoundCredentials(rt, frame);
    const requestHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(visitorHeaders)) {
      const lower = key.toLowerCase();
      if (
        lower === "host" ||
        lower === "content-length" ||
        lower === "connection" ||
        lower === "x-forwarded-for" ||
        lower.startsWith("x-poracode-forward-") ||
        lower === "accept-encoding"
      )
        continue;
      requestHeaders[key] = value;
    }
    // Fetch adds gzip/deflate when this header is absent, then immediately
    // decodes the response. Explicit identity avoids that loopback work.
    requestHeaders["accept-encoding"] = "identity";
    Object.assign(
      requestHeaders,
      relayDialOriginHeaders("http", frame.clientId),
      frame.forward ? forwardHeaders(rt, frame.forward) : apiDispatchHeaders(rt),
    );
    let response = await Promise.race([
      rt.fetchImpl(`${rt.localHttpBase}${localPath}`, {
        method: frame.method,
        headers: requestHeaders,
        signal: controller.signal,
        // The local server may reply with a 3xx (e.g. the port-forward
        // `/forward/<id>/enter` route redirecting to `/` after minting its
        // session cookie). Node's fetch (undici) only opaque-redirect-filters
        // "manual" responses when the request came from a Window/Document
        // context — a plain server-side fetch like this one gets the real
        // status/Location/Set-Cookie back, which is exactly what needs to
        // tunnel to the visitor unfollowed.
        redirect: "manual",
        ...(body !== undefined ? { body: body as BodyInit } : {}),
      }),
      timedOut,
    ]);
    // Channel binding at issuance: a token exchange response has its raw
    // access token replaced with the relay-bound credential before any byte
    // of it is framed back to the relay (see `bindTokenExchangeResponse`).
    if (isTokenExchangeRequest(frame)) {
      response = await bindTokenExchangeResponse(rt, response);
    }
    // `headersToRecord` iterates the fetch `Headers` API generically, which
    // collapses/loses repeated `set-cookie` entries (the Headers API has no
    // reliable generic multi-value read for it) — so `set-cookie` is dropped
    // from the plain header record and sent separately via `getSetCookie()`,
    // the one API that returns every value intact.
    const responseHeaders = headersToRecord(response.headers);
    delete responseHeaders["set-cookie"];
    // The body is read DECODED (`fetch` undoes any `content-encoding`
    // transparently), so echoing the origin's `content-encoding` would label
    // plaintext bytes as gzip and the visitor would fail to parse them.
    // `content-length` describes the encoded body and is equally stale. Both
    // must go now that the origin can compress.
    delete responseHeaders["content-encoding"];
    delete responseHeaders["content-length"];
    const setCookies = response.headers.getSetCookie();
    // The entry check suppresses a late response for a canceled request:
    // once `req-cancel`/control loss removed it, neither the visitor nor
    // the relay's pending entry exists anymore.
    if (rt.pendingRequests.get(frame.id) === entry) {
      if (!rt.httpStreamingEnabled) {
        const buffer = await Promise.race([
          readBoundedResponseBody(response, rt.maxBodyBytes),
          timedOut,
        ]);
        if (rt.pendingRequests.get(frame.id) !== entry) return;
        rt.pendingRequests.delete(frame.id);
        if (rt.control === sourceControl) {
          // P1-7: pre-measure the exact frame. The body is bounded by
          // maxBodyBytes, but base64 expansion, JSON escaping, and headers can
          // push the frame past the relay's receive limit — which would kill
          // the shared control socket for every channel and request. Fail this
          // one request instead.
          const resFrame = {
            t: "res" as const,
            id: frame.id,
            status: response.status,
            headers: responseHeaders,
            ...(setCookies.length > 0 ? { setCookies } : {}),
            body: Buffer.from(buffer).toString("base64"),
          };
          if (Buffer.byteLength(JSON.stringify(resFrame)) > rt.controlFrameLimit) {
            sendOn(rt, sourceControl, {
              t: "req-error",
              id: frame.id,
              message: "response too large for the relay link",
            });
            return;
          }
          sendOn(rt, sourceControl, resFrame);
        }
        return;
      }
      // Streaming path (relay advertised httpStreaming): headers go out
      // immediately, the body follows as bounded `res-chunk` slices, and
      // both the local timeout and the relay's deadline become idle-based
      // (rearmed by every chunk, so a slow-but-progressing response is
      // never retired mid-stream).
      let opened = false;
      try {
        if (
          !sendOn(rt, sourceControl, {
            t: "res-open",
            id: frame.id,
            status: response.status,
            headers: responseHeaders,
            ...(setCookies.length > 0 ? { setCookies } : {}),
          })
        ) {
          rt.pendingRequests.delete(frame.id);
          controller.abort();
          return;
        }
        opened = true;
        rearmLocalIdle();
        let totalBytes = 0;
        if (response.body) {
          for await (const raw of response.body) {
            if (rt.pendingRequests.get(frame.id) !== entry) return;
            const piece = Buffer.from(raw);
            totalBytes += piece.length;
            if (totalBytes > rt.maxBodyBytes) {
              throw new Error("response too large for the relay link");
            }
            for (let offset = 0; offset < piece.length; offset += rt.resChunkBytes) {
              const slice = piece.subarray(
                offset,
                Math.min(offset + rt.resChunkBytes, piece.length),
              );
              // P1-7 discipline applies per chunk: pre-measure so a single
              // slice can never exceed the shared control frame limit.
              const chunkFrame = {
                t: "res-chunk" as const,
                id: frame.id,
                body: slice.toString("base64"),
              };
              if (Buffer.byteLength(JSON.stringify(chunkFrame)) > rt.controlFrameLimit) {
                throw new Error("response too large for the relay link");
              }
              // Backpressure pacing: when the control socket's outbound
              // buffer is congested, stop reading upstream until it drains
              // (bounded wait; a dead or aborted exchange stops instead).
              await waitForControlRoom(rt, sourceControl, controller.signal);
              if (rt.pendingRequests.get(frame.id) !== entry) return;
              if (!sendOn(rt, sourceControl, chunkFrame)) {
                rt.pendingRequests.delete(frame.id);
                controller.abort();
                return;
              }
              rearmLocalIdle();
            }
          }
        }
        if (rt.pendingRequests.get(frame.id) !== entry) return;
        rt.pendingRequests.delete(frame.id);
        if (rt.control === sourceControl) {
          sendOn(rt, sourceControl, { t: "res-end", id: frame.id });
        }
      } catch (streamError) {
        if (rt.pendingRequests.get(frame.id) !== entry) return;
        rt.pendingRequests.delete(frame.id);
        if (rt.control === sourceControl) {
          const abortedLocally = controller.signal.aborted && streamError !== timeoutError;
          const streamMessage = abortedLocally
            ? `local request timed out after ${rt.requestTimeoutMs}ms`
            : streamError instanceof Error
              ? streamError.message
              : String(streamError);
          if (opened) {
            // Headers already went out: the only honest report is a
            // mid-stream failure the relay turns into a connection reset.
            sendOn(rt, sourceControl, { t: "res-end", id: frame.id, error: streamMessage });
          } else {
            sendOn(rt, sourceControl, { t: "req-error", id: frame.id, message: streamMessage });
          }
        }
        return;
      }
    }
  } catch (error) {
    // A canceled request (or one whose control was lost, or the host
    // disposed, or a streaming response that already answered through its
    // own res-end/req-error) has no one left to answer: stay quiet instead
    // of reporting the abort as if it were a local failure.
    if (rt.pendingRequests.get(frame.id) !== entry) return;
    rt.pendingRequests.delete(frame.id);
    const message =
      controller.signal.aborted && error !== timeoutError
        ? `local request timed out after ${rt.requestTimeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    if (rt.control === sourceControl) {
      sendOn(rt, sourceControl, {
        t: "req-error",
        id: frame.id,
        message,
      });
    }
  } finally {
    clearTimeout(entry.timeout);
  }
}
