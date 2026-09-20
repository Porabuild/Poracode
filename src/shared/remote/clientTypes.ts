import type {
  ProjectLocation,
  PromptSegment,
  StartThreadPayload,
  TerminalSize,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import type { RemoteClientMetadata } from "@/shared/remote";

export interface ThreadHistoryOptions {
  readonly targetTimelineEntryCount?: number;
  /**
   * WS3 #2: skip the inlined `terminalScrollback` — cursor-sync clients
   * render the terminal from the watch baseline instead, so inlining the
   * tail transfers the same bytes twice.
   */
  readonly omitScrollback?: boolean;
}

interface StartRemoteThreadCommon {
  readonly threadId?: StartThreadPayload["threadId"] | undefined;
  readonly agentKind: StartThreadPayload["agentKind"];
  readonly agentInstanceId?: StartThreadPayload["agentInstanceId"] | undefined;
  readonly config: ThreadConfig;
  readonly prompt: string;
  readonly segments?: readonly PromptSegment[] | undefined;
  readonly presentationMode?: ThreadPresentationMode | undefined;
  readonly userMessageItemId?: StartThreadPayload["userMessageItemId"] | undefined;
  readonly providerSwitch?: StartThreadPayload["providerSwitch"] | undefined;
}

export interface StartRemoteThreadInput extends StartRemoteThreadCommon {
  /** Reopen from host-owned state without replacing another client's live runtime. */
  readonly ensureRunning?: true;
  readonly projectLocation: ProjectLocation;
  readonly initialSize?: TerminalSize | undefined;
  readonly sessionRef?: StartThreadPayload["sessionRef"] | undefined;
}

export interface StartRemoteNewThreadInput extends StartRemoteThreadCommon {
  readonly projectId: string;
  readonly worktreePath?: string | undefined;
  readonly worktreeBranch?: string | undefined;
  readonly isNewWorktree?: boolean | undefined;
  /** Explicit title (a remote fork inherits its source's). */
  readonly title?: string | undefined;
  readonly groupId?: string | undefined;
  readonly groupName?: string | undefined;
}

/**
 * Minimal fetch shape the client needs. The PWA passes the browser `fetch`
 * (its origin — a native webview or the hosted app — is in the server's CORS
 * allowlist). The desktop renderer's origin is NOT, so it injects a transport
 * that performs the request in the Electron main process (no CORS). Returning a
 * real {@link Response} keeps `requestJson` unchanged.
 */
export type RemoteFetch = (
  url: string | URL,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Uint8Array;
    signal?: AbortSignal;
    /** Exact TLS leaf digest; native transports bind it to the actual connection. */
    certFingerprint?: string | null;
  },
) => Promise<Response>;

export interface RemoteDesktopClientOptions {
  readonly requestTimeoutMs?: number;
  readonly maxResponseBodyBytes?: number;
  readonly onRequestSuccess?: () => void;
  readonly onRequestError?: (error: unknown) => void;
  /**
   * Gate 6 item 4.6 (S6): refresh-token plumbing. When present, a 401 from an
   * expired 24-hour access token transparently refreshes (once) and retries
   * the request; rotated tokens are handed back for persistence. Absent — the
   * historical shape — the client simply fails authorization like before.
   */
  readonly tokenLifecycle?: RemoteTokenLifecycle;
  /**
   * Gate 6 item 4.2 (TLS): the pinned leaf-certificate fingerprint (lowercase
   * hex). When set together with `certFingerprintProbe`, every request
   * refuses (before sending credentials) when the probed server certificate
   * does not match. The pin is typically adopted at first pairing from the
   * QR's `#fp=…` fragment (see {@link exchangePairingCredential}) and
   * persisted beside the server record.
   */
  readonly certFingerprint?: string | null;
  /**
   * Transport hook that observes the server's actual TLS certificate
   * fingerprint (`sha256` over DER, lowercase hex). Only transports that can
   * legitimately see the TLS layer (a Node/main-process fetch, tests) supply
   * it; plain browser fetches rely on the platform chain validation and leave
   * this unset.
   */
  readonly certFingerprintProbe?: RemoteCertFingerprintProbe;
  /** Notified once when a first-pair probe validated the server certificate
   * and the fingerprint was adopted as this client's pin. */
  readonly onCertFingerprintValidated?: (fingerprint: string) => void;
}

/** Tokens of one session after a (re)issue; persisted by the caller. */
export interface RemoteTokenSnapshot {
  readonly accessToken: string;
  readonly refreshToken?: string | undefined;
  readonly refreshTokenExpiresAt?: string | undefined;
}

/** The caller-owned refresh-token store behind {@link RemoteDesktopClientOptions.tokenLifecycle}. */
export interface RemoteTokenLifecycle {
  /** The persisted refresh token for this server record, if any. */
  refreshToken(): string | undefined;
  /** Called after every successful refresh with the NEW token pair. */
  onTokensRefreshed(tokens: RemoteTokenSnapshot): void;
}

export type RemoteCertFingerprintProbe = (url: URL) => Promise<string | null>;

export const DEFAULT_REMOTE_REQUEST_TIMEOUT_MS = 60_000;
export const DEFAULT_REMOTE_RESPONSE_MAX_BYTES = 64 * 1024 * 1024;
/** Bounded revalidating-GET cache: shell snapshot, agent statuses, and one
 * thread history per open thread fit far below this; eviction is oldest-first. */
export const ETAG_CACHE_MAX_ENTRIES = 32;

/**
 * Image-ticket cache for {@link RemoteDesktopClient.localImageUrl}. The TTL
 * mirrors the host's mint window (`ImageTicketStore`, 30 s); a cached URL is
 * reused only while more than the reuse margin remains so an `<img>` load
 * starts with real validity left. The bound mirrors the host's live-ticket
 * cap in spirit; eviction is oldest-first.
 */
export const LOCAL_IMAGE_TICKET_TTL_MS = 30_000;
export const LOCAL_IMAGE_TICKET_REUSE_MARGIN_MS = 5_000;
export const LOCAL_IMAGE_TICKET_CACHE_MAX_ENTRIES = 64;

/**
 * Long-running server operations (clone, push, PR creation, commit, sync,
 * merge) routinely exceed the 60s default while succeeding server-side; a
 * short deadline reports a false failure while the op keeps running. These get
 * a generous deadline instead.
 */
export const LONG_REMOTE_REQUEST_TIMEOUT_MS = 5 * 60_000;

export function defaultClientMetadata(): RemoteClientMetadata {
  const userAgent = globalThis.navigator?.userAgent;
  const isMobile = userAgent ? /\bMobile\b/i.test(userAgent) : false;
  return {
    label: isMobile ? "Poracode mobile web" : "Poracode web app",
    deviceType: isMobile ? "mobile" : "browser",
    ...(userAgent ? { os: userAgent } : {}),
  };
}

export function endpointUrl(endpoint: string, path: string): URL {
  const base = new URL(endpoint);
  base.search = "";
  base.hash = "";
  if (!base.pathname.endsWith("/")) {
    base.pathname = `${base.pathname}/`;
  }
  return new URL(path.replace(/^\/+/, ""), base);
}

export type RemoteJsonRequestInit = {
  readonly method?: "GET" | "POST" | "DELETE";
  readonly body?: unknown;
  readonly rawBody?: Uint8Array;
  readonly headers?: Readonly<Record<string, string>>;
  /** Per-call deadline override; defaults to the client's requestTimeoutMs.
   * Long-running ops (clone, push, PR creation) pass a larger value. */
  readonly timeoutMs?: number;
};

export type RemoteJsonRefreshState = {
  readonly isTokenRefresh?: boolean;
  readonly isRefreshRetry?: boolean;
};
