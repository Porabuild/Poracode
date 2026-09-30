import {
  ENVIRONMENT_AUTH_AUTHORITY_HEADER,
  ENVIRONMENT_AUTH_AUTHORITY_PARENT,
  ENVIRONMENT_AUTHORIZATION_HEADER,
  ENVIRONMENT_PARENT_TICKET_PARAM,
} from "@/shared/environments";
import { readBoundedResponseBody } from "@/shared/http";
import { RemoteClientError } from "./clientErrors";
import { RemoteDesktopClient } from "./client";
import {
  DEFAULT_REMOTE_RESPONSE_MAX_BYTES,
  endpointUrl,
  type RemoteDesktopClientOptions,
  type RemoteFetch,
  type RemoteJsonRefreshState,
  type RemoteJsonRequestInit,
  type RemoteTokenSnapshot,
} from "./clientTypes";
import type { RemoteImageRefValue } from "./imageRef";
import type { RemoteWebSocketTicketResult } from "./protocol/core";
import {
  ENVIRONMENT_IMAGE_MAX_CONCURRENT_FETCHES,
  RemoteEnvironmentImageCache,
  environmentImageRefKey,
  environmentLocalImageKey,
  type RemoteEnvironmentImageBytes,
  type RemoteEnvironmentImageResolution,
} from "./clientEnvironmentImages";

/** Typed repair outcomes; renderers localize by code, never by message. */
export const REMOTE_ENVIRONMENT_PARENT_NEEDS_REPAIR = "environment_parent_needs_repair";
export const REMOTE_ENVIRONMENT_CHILD_NEEDS_REPAIR = "environment_child_needs_repair";

/** Bounded parent-ticket pairing cache: one entry per minted child ticket. */
export const ENVIRONMENT_PARENT_TICKET_CACHE_MAX_ENTRIES = 32;

/** Image fetches without a progress deadline are aborted after this long. */
export const ENVIRONMENT_IMAGE_FETCH_DEADLINE_MS = 30_000;

export function isRemoteEnvironmentNeedsRepairError(error: unknown): boolean {
  return (
    error instanceof RemoteClientError &&
    (error.code === REMOTE_ENVIRONMENT_PARENT_NEEDS_REPAIR ||
      error.code === REMOTE_ENVIRONMENT_CHILD_NEEDS_REPAIR)
  );
}

/**
 * OAuth grant rejections a token endpoint returns for an unknown, expired, or
 * revoked grant. Only these (plus a bare 401 from a directly dialed authority)
 * are definite evidence; a proxy's markerless 401 uses `invalid_access_token`
 * or `missing_environment_authorization` and is never in this set.
 */
const DEFINITIVE_GRANT_REJECTION_CODES: ReadonlySet<string> = new Set([
  "invalid_grant",
  "invalid_refresh_token",
  "refresh_token_reused",
]);

/**
 * True only for definite evidence that the PARENT authority rejected its own
 * credential: a 401 from the parent's directly dialed endpoint, or an OAuth 400
 * grant-rejection code. Everything else — status 0 network/timeout, 499 caller
 * cancellation, 5xx, 409 uncertainty, and scope 403s — is not proof that the
 * parent grant was revoked and must be preserved with its evidence.
 */
function isDefinitiveParentAuthorityRejection(error: unknown): boolean {
  if (!(error instanceof RemoteClientError)) return false;
  if (error.status === 401) return true;
  return error.status === 400 && DEFINITIVE_GRANT_REJECTION_CODES.has(error.code);
}

/**
 * True only for definite evidence that the CHILD grant was rejected: the
 * child's own token endpoint emitted a grant-rejection code through the proxy.
 * A markerless 401 carrying a parent/proxy code (for example an old parent's
 * `invalid_access_token`) is deliberately excluded, so absent a parent marker
 * the child is never asserted from the proxy's rejection.
 */
function isDefinitiveChildGrantRejection(error: unknown): error is RemoteClientError {
  return (
    error instanceof RemoteClientError &&
    (error.status === 400 || error.status === 401) &&
    DEFINITIVE_GRANT_REJECTION_CODES.has(error.code)
  );
}

/**
 * The parent authority of one environment connection (R1). The renderer
 * (C1.3b) implements this over the parent record's long-lived client; the
 * shared client never constructs a parent client itself, so the two grants stay
 * independently owned and revocable.
 */
export interface RemoteEnvironmentParentAuthority {
  /** Live parent access token, captured from the parent client's rotations. */
  accessToken(): string | undefined;
  /**
   * Single-flight parent grant refresh, coalesced per parent connection so N
   * environments share one refresh. Rejects when the parent grant cannot be
   * renewed; the caller attributes `needs-repair(parent)` only from definite
   * rejection evidence and otherwise preserves the failure.
   */
  ensureLive(): Promise<void>;
  /** Mints the one-use parent environment-bound WS upgrade ticket. */
  mintWebSocketTicket(): Promise<RemoteWebSocketTicketResult>;
}

export interface RemoteEnvironmentClientOptions extends RemoteDesktopClientOptions {
  /** Host-minted environment id; display and ticket binding only, never a key. */
  readonly environmentId: string;
  /** Verified child desktop id; identity/display only, never a dial target. */
  readonly childDesktopId?: string;
  readonly parentAuthority: RemoteEnvironmentParentAuthority;
  /** Test seams; default to the global `URL.createObjectURL`/`revokeObjectURL`. */
  readonly createObjectUrl?: (blob: Blob) => string;
  readonly revokeObjectUrl?: (url: string) => void;
  readonly maxImageCacheEntries?: number;
  readonly maxImageCacheBytes?: number;
  readonly maxImageFetchBytes?: number;
  readonly imageRetryWindowMs?: number;
  /** Concurrent authenticated image fetches; the rest wait FIFO. */
  readonly maxConcurrentImageFetches?: number;
  /** Per-fetch deadline; aborting latches the key until the retry window. */
  readonly imageFetchDeadlineMs?: number;
}

const ENVIRONMENT_PARENT_RECOVERED = Symbol("environmentParentRecovered");

type EnvironmentRecoveredInit = RemoteJsonRequestInit & {
  readonly [ENVIRONMENT_PARENT_RECOVERED]?: true;
};

interface ParentTicketEntry {
  readonly ticket: string;
  readonly expiresAtMs: number;
}

/**
 * Environment-bound client (C1.3a, R1–R4).
 *
 * The endpoint is the parent proxy prefix and the `Authorization` bearer is
 * the CHILD token, exactly as a direct client sends it; the parent token is
 * attached by this subclass in `x-poracode-environment-authorization` before
 * every proxied dispatch — including the nested child `/oauth/token` refresh —
 * and never reaches the child (the parent strips it). The TLS pin is the
 * parent record's (`certFingerprint`/`certFingerprintProbe` options).
 *
 * Recovery is the bounded R1 state machine: only a 401 carrying the trusted
 * parent marker is recoverable, and only once per top-level call, by refreshing
 * the parent single-flight and replaying the original request exactly once.
 * Every other failure (missing marker, 0/5xx/timeout/cancelled, 409
 * `command_outcome_uncertain`) propagates unchanged with its B2 mutation
 * evidence — no probe, no parent rotation, no uncertain replay.
 *
 * Management methods are inherited: they dispatch under the bound child
 * authority through the one-hop proxy (R4), and a child without manage scopes
 * answers its own 403. There is no blanket authority throw.
 */
export class RemoteEnvironmentClient extends RemoteDesktopClient {
  readonly environmentId: string;
  readonly childDesktopId: string | undefined;
  private readonly parentAuthority: RemoteEnvironmentParentAuthority;
  private readonly images: RemoteEnvironmentImageCache;
  private readonly maxImageFetchBytes: number;
  private readonly imageFetchDeadlineMs: number;
  private readonly parentTickets = new Map<string, ParentTicketEntry>();
  private disposed = false;

  constructor(
    endpoint: string,
    accessToken: string | undefined,
    fetchImpl: RemoteFetch | undefined,
    options: RemoteEnvironmentClientOptions,
  ) {
    super(endpoint, accessToken, fetchImpl, {
      ...options,
      responseEvidenceHeaders: [
        ...new Set([ENVIRONMENT_AUTH_AUTHORITY_HEADER, ...(options.responseEvidenceHeaders ?? [])]),
      ],
    });
    this.environmentId = options.environmentId;
    this.childDesktopId = options.childDesktopId;
    this.parentAuthority = options.parentAuthority;
    this.maxImageFetchBytes = options.maxImageFetchBytes ?? DEFAULT_REMOTE_RESPONSE_MAX_BYTES;
    this.imageFetchDeadlineMs = options.imageFetchDeadlineMs ?? ENVIRONMENT_IMAGE_FETCH_DEADLINE_MS;
    this.images = new RemoteEnvironmentImageCache({
      fetchBytes: (requestPath, signal) => this.fetchImageBytes(requestPath, signal),
      createObjectUrl: options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob)),
      revokeObjectUrl: options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url)),
      ...(options.maxImageCacheEntries !== undefined
        ? { maxEntries: options.maxImageCacheEntries }
        : {}),
      ...(options.maxImageCacheBytes !== undefined ? { maxBytes: options.maxImageCacheBytes } : {}),
      ...(options.imageRetryWindowMs !== undefined
        ? { retryWindowMs: options.imageRetryWindowMs }
        : {}),
      maxConcurrentFetches:
        options.maxConcurrentImageFetches ?? ENVIRONMENT_IMAGE_MAX_CONCURRENT_FETCHES,
    });
  }

  /** Aborts in-flight image fetches and revokes every cached object URL. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.images.dispose();
    this.parentTickets.clear();
  }

  override localImageUrl(absolutePath: string): string {
    return this.images.localImageUrl(absolutePath);
  }

  override imageRefUrl(ref: RemoteImageRefValue): string {
    return this.images.imageRefUrl(ref);
  }

  imageRefResolution(ref: RemoteImageRefValue): RemoteEnvironmentImageResolution {
    return this.images.imageRefResolution(ref);
  }

  localImageResolution(absolutePath: string): RemoteEnvironmentImageResolution {
    return this.images.localImageResolution(absolutePath);
  }

  imageResolutionFor(key: string): RemoteEnvironmentImageResolution {
    return this.images.resolutionForImageKey(key);
  }

  imageKeyForRef(ref: RemoteImageRefValue): string {
    return environmentImageRefKey(ref);
  }

  imageKeyForLocalPath(absolutePath: string): string {
    return environmentLocalImageKey(absolutePath);
  }

  /** Explicit keyed subscription for `useSyncExternalStore` consumers. */
  subscribeImageKey(key: string, listener: () => void): () => void {
    return this.images.subscribeImageKey(key, listener);
  }

  /**
   * Child ticket through the proxy, then the parent ticket minted by the
   * parent authority and cached against the exact child ticket. Production
   * call order (ticket first, URL second) is unchanged, so `websocketUrl`
   * pairs the two without any global "last ticket" state: concurrent terminal
   * and event ticket mints cannot overwrite each other's pairing.
   */
  override async websocketTicket(timeoutMs?: number): Promise<string> {
    const childTicket = await super.websocketTicket(timeoutMs);
    let parentTicket: RemoteWebSocketTicketResult;
    try {
      parentTicket = await this.parentAuthority.mintWebSocketTicket();
    } catch (error) {
      // A parent ticket mint can fail for a dead network as easily as for a
      // revoked grant: attribute repair only on definite rejection evidence.
      this.rethrowParentAuthorityFailure(error);
    }
    this.rememberParentTicket(childTicket, parentTicket);
    return childTicket;
  }

  override websocketUrl(
    ticket: string,
    lastSeenSeq: number | null | undefined,
    options: { readonly threadItemInterests?: readonly string[] } = {},
  ): string {
    const url = new URL(super.websocketUrl(ticket, lastSeenSeq, options));
    this.pruneParentTickets();
    const parent = this.parentTickets.get(ticket);
    if (parent && parent.expiresAtMs > Date.now()) {
      url.searchParams.set(ENVIRONMENT_PARENT_TICKET_PARAM, parent.ticket);
    }
    return url.toString();
  }

  /**
   * R1 bounded recovery. Nested child refreshes and the single replay attach
   * the live parent token and never recover; only a marker-proven parent 401
   * refreshes the parent once and replays the original dispatch once. A
   * residual markerless 401 keeps its original error and unknown authority,
   * and a parent refresh failure is attributed to repair only on definite
   * rejection evidence — transport, cancellation, uncertainty, and scope
   * failures pass through with their evidence.
   */
  protected override async requestJson(
    path: string,
    init: EnvironmentRecoveredInit = {},
    refreshState: RemoteJsonRefreshState = {},
  ): Promise<unknown> {
    if (refreshState.isTokenRefresh === true || init[ENVIRONMENT_PARENT_RECOVERED] === true) {
      return super.requestJson(path, this.withParentHeader(init), refreshState);
    }
    // Built before the try: a missing parent token is a fail-closed refusal of
    // this dispatch, never something the 401 catch below should reinterpret.
    const parentInit = this.withParentHeader(init);
    try {
      return await super.requestJson(path, parentInit, refreshState);
    } catch (error) {
      if (!(error instanceof RemoteClientError) || error.status !== 401) throw error;
      if (
        error.responseEvidence?.[ENVIRONMENT_AUTH_AUTHORITY_HEADER] !==
        ENVIRONMENT_AUTH_AUTHORITY_PARENT
      ) {
        // Missing/foreign marker: not proven parent-origin, so the authority is
        // unknown (a mid-branch or older parent is a supported degraded mode).
        // Fail closed — no parent refresh, no probe, no replay, and no child
        // assertion: surface the original error so the caller offers a repair
        // action without reading provenance into absent evidence.
        throw error;
      }
      try {
        await this.parentAuthority.ensureLive();
      } catch (repairError) {
        this.rethrowParentAuthorityFailure(repairError);
      }
      return super.requestJson(
        path,
        this.withParentHeader({ ...init, [ENVIRONMENT_PARENT_RECOVERED]: true }),
        {},
      );
    }
  }

  private withParentHeader(init: EnvironmentRecoveredInit): EnvironmentRecoveredInit {
    return {
      ...init,
      headers: {
        ...init.headers,
        [ENVIRONMENT_AUTHORIZATION_HEADER]: `Bearer ${this.requireParentToken()}`,
      },
    };
  }

  private requireParentToken(): string {
    const token = this.parentAuthority.accessToken();
    if (!token) {
      throw this.parentNeedsRepair(new Error("The parent access token is unavailable."));
    }
    return token;
  }

  private childNeedsRepair(cause: RemoteClientError): RemoteClientError {
    return new RemoteClientError(
      "The environment's child session was rejected and must be re-paired from the parent.",
      401,
      REMOTE_ENVIRONMENT_CHILD_NEEDS_REPAIR,
      {
        cause,
        requestMayHaveCommitted: false,
        ...(cause.responseEvidence !== undefined
          ? { responseEvidence: cause.responseEvidence }
          : {}),
      },
    );
  }

  private parentNeedsRepair(cause: unknown): RemoteClientError {
    return new RemoteClientError(
      "The paired server that owns this environment must be re-paired from the desktop.",
      401,
      REMOTE_ENVIRONMENT_PARENT_NEEDS_REPAIR,
      {
        cause,
        requestMayHaveCommitted: false,
        ...(cause instanceof RemoteClientError && cause.responseEvidence !== undefined
          ? { responseEvidence: cause.responseEvidence }
          : {}),
      },
    );
  }

  /**
   * Attributes parent repair only on definite evidence (a typed repair error
   * already in hand, or an authoritative rejection) and rethrows everything
   * else unchanged: a transport drop, deadline, caller cancel, ambiguous
   * outcome, or scope 403 keeps its status/phase/uncertainty/response evidence.
   */
  private rethrowParentAuthorityFailure(cause: unknown): never {
    if (isRemoteEnvironmentNeedsRepairError(cause)) throw cause;
    if (isDefinitiveParentAuthorityRejection(cause)) throw this.parentNeedsRepair(cause);
    throw cause;
  }

  private rememberParentTicket(childTicket: string, result: RemoteWebSocketTicketResult): void {
    const expiresAtMs = Date.parse(result.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return;
    this.pruneParentTickets();
    while (this.parentTickets.size >= ENVIRONMENT_PARENT_TICKET_CACHE_MAX_ENTRIES) {
      const oldest = this.parentTickets.keys().next().value;
      if (oldest === undefined) break;
      this.parentTickets.delete(oldest);
    }
    this.parentTickets.set(childTicket, { ticket: result.ticket, expiresAtMs });
  }

  private pruneParentTickets(): void {
    const now = Date.now();
    for (const [childTicket, entry] of this.parentTickets) {
      if (entry.expiresAtMs <= now) this.parentTickets.delete(childTicket);
    }
  }

  /**
   * Authenticated image bytes: the same fetch impl, parent pin, and R1
   * authority rules as every dispatch — child bearer in `Authorization`, the
   * live parent token in the parent header, bounded by a fetch deadline and
   * the host's streaming byte cap. No URL credential is ever built.
   *
   * Recovery uses the same authorities/steps as `requestJson`, not a second
   * transport stack: a marker-proven parent 401 refreshes the parent once and
   * replays once; a markerless 401 takes the inherited single-flight child
   * refresh once and replays once. A replay 401 is attributed from what the
   * recovery proved — child repair when the replay ran behind a verified-live
   * parent, parent repair when the fresh parent token is itself marker-rejected
   * — while a refresh transport failure is preserved untouched. Timeouts and
   * non-401 failures latch the cache's retry window.
   */
  private async fetchImageBytes(
    requestPath: string,
    signal: AbortSignal,
  ): Promise<RemoteEnvironmentImageBytes> {
    const response = await this.dispatchImageFetch(requestPath, signal, false);
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new RemoteClientError(
        `Environment image request failed with status ${response.status}.`,
        response.status,
        "request_failed",
      );
    }
    const bytes = await readBoundedResponseBody(response, this.maxImageFetchBytes);
    return {
      bytes,
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  private async dispatchImageFetch(
    requestPath: string,
    signal: AbortSignal,
    recovered: boolean,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      [ENVIRONMENT_AUTHORIZATION_HEADER]: `Bearer ${this.requireParentToken()}`,
    };
    if (this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;
    const response = await this.fetchImpl(endpointUrl(this.endpoint, requestPath), {
      method: "GET",
      headers,
      signal: imageDeadlineSignal(signal, this.imageFetchDeadlineMs),
      certFingerprint: this.pinnedCertFingerprint ?? null,
    });
    if (response.status !== 401) return response;
    const marker = response.headers.get(ENVIRONMENT_AUTH_AUTHORITY_HEADER);
    await response.body?.cancel().catch(() => undefined);
    if (marker === ENVIRONMENT_AUTH_AUTHORITY_PARENT) {
      if (recovered) {
        // The parent refreshed and its fresh token was marker-rejected again:
        // a definite authority-specific rejection, still bounded to one repair.
        throw this.parentNeedsRepair(imageUnauthorizedError(401, marker));
      }
      try {
        await this.parentAuthority.ensureLive();
      } catch (repairError) {
        this.rethrowParentAuthorityFailure(repairError);
      }
      return this.dispatchImageFetch(requestPath, signal, true);
    }
    if (recovered) {
      // A successful refresh proves only that earlier request. Credentials can
      // change before the replay; absent a trusted marker its origin is unknown.
      throw imageUnauthorizedError(401, marker);
    }
    // Markerless: use the inherited single-flight child refresh (itself a
    // proxied dispatch), then replay exactly once. A refresh rejection is
    // attributed to the child only on definite child-grant evidence; a
    // transport failure is preserved rather than misread as revocation, and a
    // missing grant is explicit local absence.
    let tokens: RemoteTokenSnapshot | null;
    try {
      tokens = await this.refreshTokens();
    } catch (refreshError) {
      if (isDefinitiveChildGrantRejection(refreshError)) throw this.childNeedsRepair(refreshError);
      throw refreshError;
    }
    if (!tokens) throw this.childNeedsRepair(imageUnauthorizedError(401, marker));
    return this.dispatchImageFetch(requestPath, signal, true);
  }
}

/**
 * Bounded per-fetch deadline layered over the cache's abort signal. Falls back
 * to a manual controller when `AbortSignal.any`/`timeout` are unavailable.
 */
function imageDeadlineSignal(signal: AbortSignal, deadlineMs: number): AbortSignal {
  if (deadlineMs <= 0 || deadlineMs === Number.POSITIVE_INFINITY) return signal;
  if (typeof AbortSignal.any === "function" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.any([signal, AbortSignal.timeout(deadlineMs)]);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  if (signal.aborted) onAbort();
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error("Image fetch deadline exceeded.")),
    deadlineMs,
  );
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    },
    { once: true },
  );
  return controller.signal;
}

function imageUnauthorizedError(status: number, marker: string | null): RemoteClientError {
  return new RemoteClientError(
    marker === ENVIRONMENT_AUTH_AUTHORITY_PARENT
      ? "The environment image request was rejected by the parent authority."
      : "The environment image request was rejected without a parent authority marker.",
    status,
    "request_failed",
    {
      requestMayHaveCommitted: false,
      ...(marker !== null
        ? { responseEvidence: { [ENVIRONMENT_AUTH_AUTHORITY_HEADER]: marker } }
        : {}),
    },
  );
}

export {
  ENVIRONMENT_IMAGE_CACHE_MAX_BYTES,
  ENVIRONMENT_IMAGE_CACHE_MAX_ENTRIES,
  ENVIRONMENT_IMAGE_RETRY_WINDOW_MS,
  environmentImageRefKey,
  environmentLocalImageKey,
  type RemoteEnvironmentImageResolution,
} from "./clientEnvironmentImages";
