import { remoteHttpErrorSchema } from "@/shared/remote";
import { remoteImageRefPath, type RemoteImageRefValue } from "./imageRef";
import { readBoundedResponseBody } from "@/shared/http";
import { RemoteClientError } from "./clientErrors";
import { parseJsonResponse, parseResponse } from "./clientParse";
import { RemoteClientPinCore, remoteCertificateMismatchError } from "./clientPin";
import {
  DEFAULT_REMOTE_REQUEST_TIMEOUT_MS,
  DEFAULT_REMOTE_RESPONSE_MAX_BYTES,
  ETAG_CACHE_MAX_ENTRIES,
  LOCAL_IMAGE_TICKET_CACHE_MAX_ENTRIES,
  LOCAL_IMAGE_TICKET_REUSE_MARGIN_MS,
  LOCAL_IMAGE_TICKET_TTL_MS,
  endpointUrl,
  type RemoteDesktopClientOptions,
  type RemoteFetch,
  type RemoteJsonRefreshState,
  type RemoteJsonRequestInit,
  type RemoteTokenLifecycle,
  type RemoteTokenSnapshot,
} from "./clientTypes";
import { z } from "zod";

/** Mint result of `POST /api/files/image-ticket` (B5b ticket flow). */
const remoteImageTicketResultSchema = z.object({
  ticket: z.string().min(1),
  expiresAt: z.string().min(1),
});

export abstract class RemoteClientTransport extends RemoteClientPinCore {
  protected readonly fetchImpl: RemoteFetch;
  protected readonly requestTimeoutMs: number;
  protected readonly maxResponseBodyBytes: number;
  protected readonly onRequestSuccess: (() => void) | undefined;
  protected readonly onRequestError: ((error: unknown) => void) | undefined;
  protected tokenLifecycle: RemoteTokenLifecycle | undefined;
  protected accessToken: string | undefined;

  /**
   * Revalidating GET cache for the large read endpoints (shell snapshot,
   * agent statuses, thread history). The server answers conditional requests
   * with `304` and no body, so a cache hit skips the full payload download —
   * the single largest cold-start and refresh cost on weak links. Bounded to
   * `ETAG_CACHE_MAX_ENTRIES` with insertion-order eviction, and inherently
   * credential-scoped: `accessToken` is fixed per client instance, so the
   * cache dies with the credential that authorized its bodies.
   */
  private readonly etagCache = new Map<
    string,
    { readonly etag: string; readonly parsed: unknown }
  >();

  /** Minted one-time image tickets per absolute path, newest reuse first. */
  private readonly localImageTickets = new Map<
    string,
    { readonly ticket: string; readonly expiresAtMs: number }
  >();
  /** In-flight mints, so concurrent render passes share one request per path. */
  private readonly localImageTicketMints = new Map<string, Promise<void>>();
  /** Latched when the host answers the mint route with 404 (older deploy). */
  private localImageTicketsUnsupported = false;

  constructor(
    endpoint: string,
    accessToken?: string,
    fetchImpl?: RemoteFetch,
    options: RemoteDesktopClientOptions = {},
  ) {
    super(endpoint, {
      ...(options.certFingerprint !== undefined
        ? { certFingerprint: options.certFingerprint }
        : {}),
      ...(options.certFingerprintProbe !== undefined
        ? { certFingerprintProbe: options.certFingerprintProbe }
        : {}),
      ...(options.onCertFingerprintValidated !== undefined
        ? { onCertFingerprintValidated: options.onCertFingerprintValidated }
        : {}),
    });
    this.accessToken = accessToken;
    this.fetchImpl =
      fetchImpl ??
      ((url, init) =>
        fetch(url, {
          ...(init?.method ? { method: init.method } : {}),
          ...(init?.headers ? { headers: init.headers } : {}),
          ...(init?.body !== undefined ? { body: init.body as BodyInit } : {}),
          ...(init?.signal ? { signal: init.signal } : {}),
        }));
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REMOTE_REQUEST_TIMEOUT_MS;
    this.maxResponseBodyBytes = options.maxResponseBodyBytes ?? DEFAULT_REMOTE_RESPONSE_MAX_BYTES;
    this.onRequestSuccess = options.onRequestSuccess;
    this.onRequestError = options.onRequestError;
    this.tokenLifecycle = options.tokenLifecycle;
  }

  /**
   * Attaches (or replaces) the caller-owned refresh lifecycle after
   * construction — for callers that build clients through an injected
   * factory and can only bind persistence once the server record is known.
   */
  setTokenLifecycle(lifecycle: RemoteTokenLifecycle | undefined): void {
    this.tokenLifecycle = lifecycle;
  }

  protected abstract refreshTokens(): Promise<RemoteTokenSnapshot | null>;

  /**
   * Absolute URL of the authenticated image endpoint used for poracode-local
   * sources. <img> tags can't send Authorization headers, so the URL carries
   * the one-time `lc_img_` ticket minted from `POST /api/files/image-ticket`.
   * Gate 6 item 4.6 (S6): the former `access_token` query-param fallback is
   * GONE — a long-lived bearer in the URL leaks into proxy/relay access logs,
   * and no URL in this client carries a bearer token anymore. Minting is
   * asynchronous while every render-path consumer of this method is
   * synchronous, so the FIRST resolution of a path returns "" (callers fall
   * back to the original, unrenderable-in-a-browser URL) and the ticketed URL
   * is served from cache on the next resolution. A 404 from the mint (older
   * host without the route) latches off ticket use for this client instance.
   */
  localImageUrl(absolutePath: string): string {
    if (!this.accessToken) return "";
    const url = endpointUrl(this.endpoint, "/api/files/image");
    url.searchParams.set("path", absolutePath);
    const cached = this.localImageTickets.get(absolutePath);
    if (cached && cached.expiresAtMs > Date.now() + LOCAL_IMAGE_TICKET_REUSE_MARGIN_MS) {
      url.searchParams.set("ticket", cached.ticket);
      return url.toString();
    }
    this.queueImageTicketMint(absolutePath, absolutePath);
    return "";
  }

  /**
   * One shared mint: `key` dedupes concurrent resolutions, `pathValue` is the
   * exact server-side path the ticket is bound to (the filesystem path for
   * {@link localImageUrl}, the JSON reference path for {@link imageRefUrl}).
   */
  private queueImageTicketMint(key: string, pathValue: string): void {
    if (this.localImageTicketsUnsupported) return;
    // Deduped per key: markdown and gallery rendering can resolve the same
    // image several times while one mint is in flight.
    let mint = this.localImageTicketMints.get(key);
    if (!mint) {
      mint = this.mintImageTicket(key, pathValue);
      this.localImageTicketMints.set(key, mint);
      void mint.finally(() => {
        this.localImageTicketMints.delete(key);
      });
    }
  }

  private async mintImageTicket(key: string, pathValue: string): Promise<void> {
    try {
      const result = parseResponse(
        remoteImageTicketResultSchema,
        await this.requestJson("/api/files/image-ticket", {
          method: "POST",
          body: { path: pathValue },
        }),
        "image ticket",
      );
      while (this.localImageTickets.size >= LOCAL_IMAGE_TICKET_CACHE_MAX_ENTRIES) {
        const oldest = this.localImageTickets.keys().next().value;
        if (oldest === undefined) break;
        this.localImageTickets.delete(oldest);
      }
      this.localImageTickets.set(key, {
        ticket: result.ticket,
        expiresAtMs: Date.now() + LOCAL_IMAGE_TICKET_TTL_MS,
      });
    } catch (error) {
      if (error instanceof RemoteClientError && error.status === 404) {
        // Older host without the ticket route: stop re-requesting the route
        // for this client's lifetime. There is no credential left that an
        // <img> tag could legally carry on such a host.
        this.localImageTicketsUnsupported = true;
      }
    }
  }

  /**
   * Absolute URL for a host-minted image reference. Like {@link localImageUrl}
   * the URL authenticates with a one-time ticket minted for the exact JSON
   * reference path — never a bearer token — because <img> tags can't send an
   * Authorization header; and unlike a filesystem path, the location is
   * addressed inside the host's own stored payload, so nothing the agent
   * wrote can influence what gets served. Returns "" without a token or while
   * the mint is in flight.
   */
  imageRefUrl(ref: RemoteImageRefValue): string {
    if (!this.accessToken) return "";
    const pathValue = JSON.stringify(ref.path);
    const mintKey = `${ref.threadId}/${ref.itemId}/${pathValue}`;
    const url = endpointUrl(this.endpoint, remoteImageRefPath(ref));
    const cached = this.localImageTickets.get(mintKey);
    if (cached && cached.expiresAtMs > Date.now() + LOCAL_IMAGE_TICKET_REUSE_MARGIN_MS) {
      url.searchParams.set("ticket", cached.ticket);
      return url.toString();
    }
    this.queueImageTicketMint(mintKey, pathValue);
    return "";
  }

  protected async requestJson(
    path: string,
    init: RemoteJsonRequestInit = {},
    // Internal refresh-loop state: the token-refresh call never refreshes
    // (that would loop), and a post-refresh retry never retries again.
    refreshState: RemoteJsonRefreshState = {},
  ): Promise<unknown> {
    // Gate 6 item 4.2: with a pinned fingerprint and a TLS-observable
    // transport, refuse BEFORE credentials leave the client.
    if (this.pinnedCertFingerprint && this.certFingerprintProbe) {
      const actual = await this.probeCertFingerprint();
      if (actual && actual.toLowerCase() !== this.pinnedCertFingerprint) {
        throw remoteCertificateMismatchError();
      }
    }

    const headers: Record<string, string> = { ...init.headers };
    if (init.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (this.accessToken) {
      headers.authorization = `Bearer ${this.accessToken}`;
    }
    const method = init.method ?? "GET";
    const cached = method === "GET" ? this.etagCache.get(path) : undefined;
    if (cached) {
      headers["if-none-match"] = cached.etag;
    }
    const effectiveTimeoutMs = init.timeoutMs ?? this.requestTimeoutMs;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutError = new RemoteClientError(
      `Remote request timed out after ${effectiveTimeoutMs}ms.`,
      0,
      "timeout",
    );
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(timeoutError);
      }, effectiveTimeoutMs);
    });

    try {
      const response = await Promise.race([
        this.fetchImpl(endpointUrl(this.endpoint, path), {
          method: init.method ?? "GET",
          headers,
          signal: controller.signal,
          certFingerprint: this.pinnedCertFingerprint ?? null,
          ...(init.body !== undefined
            ? { body: JSON.stringify(init.body) }
            : init.rawBody
              ? { body: init.rawBody }
              : {}),
        }),
        timeoutPromise,
      ]);
      // The large read endpoints send a revalidating `ETag`. Browser clients
      // (PWA, Electron renderer) resolve `304` against their own HTTP cache and
      // surface it as a `200` with the stored body, so this is unreachable
      // there. A non-browser `fetchImpl` — or an intermediary that revalidates
      // on its own — could still surface a bare `304`, whose empty body would
      // otherwise parse to `{}` and fail schema validation with a confusing
      // error. Fail loudly instead.
      if (response.status === 304) {
        // Conditional GET revalidated clean: the cached body is the answer.
        // Without a cache entry this is a protocol error (a bare 304 carries
        // no body and would parse to `{}`), so fail loudly.
        if (!cached) {
          throw new RemoteClientError(
            "Remote request returned 304 without a cached body.",
            304,
            "not_modified",
          );
        }
        this.onRequestSuccess?.();
        return cached.parsed;
      }
      const body = await Promise.race([
        readBoundedResponseBody(response, this.maxResponseBodyBytes),
        timeoutPromise,
      ]);
      const text = new TextDecoder().decode(body);
      const parsed = parseJsonResponse(text, response);
      if (!response.ok) {
        // Gate 6 item 4.6 (S6): a 401 from an expired 24-hour access token
        // transparently refreshes once and retries the request. Any refresh
        // failure surfaces the ORIGINAL authorization error, so callers keep
        // seeing a clean 401 instead of a grant-endpoint failure.
        if (
          response.status === 401 &&
          !refreshState.isTokenRefresh &&
          !refreshState.isRefreshRetry &&
          this.tokenLifecycle?.refreshToken()
        ) {
          try {
            // Another request may have rotated while this old-token response was in flight.
            const alreadyRotated = headers.authorization !== `Bearer ${this.accessToken}`;
            if (alreadyRotated || (await this.refreshTokens())) {
              return await this.requestJson(path, init, { isRefreshRetry: true });
            }
          } catch {
            // fall through to the original error below
          }
        }
        const error = remoteHttpErrorSchema.safeParse(parsed);
        throw new RemoteClientError(
          error.success ? error.data.error.message : "Remote request failed.",
          response.status,
          error.success ? error.data.error.code : "request_failed",
        );
      }
      if (method === "GET") {
        const etag = response.headers.get("etag");
        if (etag) {
          this.etagCache.delete(path);
          this.etagCache.set(path, { etag, parsed });
          while (this.etagCache.size > ETAG_CACHE_MAX_ENTRIES) {
            const oldest = this.etagCache.keys().next().value;
            if (oldest === undefined) break;
            this.etagCache.delete(oldest);
          }
        }
      }
      this.onRequestSuccess?.();
      return parsed;
    } catch (error) {
      const requestError =
        controller.signal.aborted && error !== timeoutError
          ? new RemoteClientError(
              `Remote request timed out after ${effectiveTimeoutMs}ms.`,
              0,
              "timeout",
              { cause: error },
            )
          : error;
      this.onRequestError?.(requestError);
      throw requestError;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
