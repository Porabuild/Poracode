import { z } from "zod";
import { remoteImageRefPath, type RemoteImageRefValue } from "./imageRef";
import { tryParseSocketMessage as tryParseRemoteSocketMessage } from "./parseSocketMessage";
import {
  PORACODE_REMOTE_PROTOCOL_VERSION,
  REMOTE_COMMAND_ID_HEADER,
  REMOTE_PROCEDURE_SPECS,
  REMOTE_STANDARD_SCOPES,
  filterKnownRemoteAccessScopes,
  isRemoteFollowUpQueueProcedure,
  isRemoteProcedure,
  remoteAgentSlashCommandsSchema,
  remoteAgentStatusesSchema,
  remoteAccessTokenResultSchema,
  remoteBrowserStateSchema,
  remoteEnvironmentDescriptorSchema,
  remoteHttpErrorSchema,
  remoteHostUpdateStateSchema,
  remotePortEnterResultSchema,
  remotePortForwardResultSchema,
  remotePortUnforwardResultSchema,
  remotePortsStateSchema,
  remotePushRegistrationResultSchema,
  remoteWebPushConfigResultSchema,
  remoteSettingsSchema,
  remoteSchedulesResponseSchema,
  remoteScheduleRunsResponseSchema,
  remoteProjectCommandResultSchema,
  remoteProjectSettingsSchema,
  remoteRuntimeItemsPageSchema,
  remoteShellSnapshotSchema,
  remoteThreadListPageSchema,
  remoteThreadSnapshotSchema,
  remoteWebSocketServerMessageSchema,
  remoteWebSocketTicketResultSchema,
  toWebSocketUrl,
  type RemoteAccessScope,
  type RemoteAgentSlashCommands,
  type RemoteAgentStatuses,
  type RemoteAccessTokenResult,
  type RemoteBrowserCommand,
  type RemoteBrowserState,
  type RemoteClientMetadata,
  type RemoteEnvironmentDescriptor,
  type RemoteHostUpdateState,
  type RemotePortEnterResult,
  type RemotePortForwardResult,
  type RemotePortsState,
  type RemoteProjectCommand,
  type RemoteProjectCommandResult,
  type RemoteProjectSettings,
  type RemotePushRegistration,
  type RemotePushRegistrationRouting,
  type RemotePushRegistrationResult,
  type RemoteRuntimeItemsPage,
  type RemoteRuntimeItemsPageRequest,
  type RemoteSettings,
  type RemoteSettingsPatch,
  type RemoteScheduleCommand,
  type RemoteShellSnapshot,
  type RemoteThreadListPage,
  type RemoteThreadSnapshot,
  type RemoteWebSocketServerMessage,
} from "@/shared/remote";
import {
  DEFAULT_TERMINAL_SIZE,
  CHECKPOINT_REVERT_COMMAND_ID_PREFIX,
  checkpointRevertPayloadSchema,
  checkpointRevertResultSchema,
  controlThreadGoalPayloadSchema,
  profileCoreStatsSchema,
  profileDevicesResponseSchema,
  profileIdentityResponseSchema,
  profileTokenStatsSchema,
  providerUsageResponseSchema,
  prWatchSchema,
  projectNotesSchema,
  sendThreadInputPayloadSchema,
  type CheckpointRevertResult,
  type ProfileCoreStats,
  type ControlThreadGoalPayload,
  type ProfileDevicesResponse,
  type ProfileIdentity,
  type ProfileIdentityResponse,
  type ProfileStatsRequest,
  type ProfileTokenStats,
  type PrWatch,
  type PrWatchAgentSync,
  type PrWatchInput,
  type PrWatchKey,
  type ProjectNotes,
  type ProjectLocation,
  type PromptSegment,
  type ProviderUsageResponse,
  type RemoteThreadCommand,
  type ResizeTerminalPayload,
  type SendThreadInputPayload,
  type SetPendingSteerPayload,
  type StartShellPayload,
  type StartThreadPayload,
  type StartThreadResult,
  type TerminalSize,
  type ThreadConfig,
  type ThreadPresentationMode,
  type ThreadServerRequestId,
  type ScheduledTask,
  type ScheduledTaskInput,
  type ScheduledTaskRun,
} from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { readBoundedResponseBody } from "@/shared/http";
import type { NormalizeExactOptionalProperties } from "@/shared/contracts/exactType";
import {
  ipcProcedureMap,
  jsonCallEnvelopeSchema,
  omittedCallEnvelopeSchema,
  omittedResultSchema,
} from "@/shared/ipc";

export class RemoteClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RemoteClientError";
  }
}

export function isUnauthorizedRemoteError(error: unknown): error is RemoteClientError {
  return error instanceof RemoteClientError && (error.status === 401 || error.status === 403);
}

export function isRemoteTransportFailure(error: unknown): boolean {
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return true;
  if (
    error instanceof RemoteClientError &&
    (error.status === 0 || error.status === 502 || error.status === 504)
  ) {
    return true;
  }
  return error instanceof Error && error.cause !== undefined
    ? isRemoteTransportFailure(error.cause)
    : false;
}

export interface ThreadHistoryOptions {
  readonly targetTimelineEntryCount?: number;
  /**
   * WS3 #2: skip the inlined `terminalScrollback` — cursor-sync clients
   * render the terminal from the watch baseline instead, so inlining the
   * tail transfers the same bytes twice.
   */
  readonly omitScrollback?: boolean;
}

function parseJsonResponse(text: string, response: Response): unknown {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const contentType = response.headers.get("content-type") ?? "";
    const htmlLike = contentType.includes("text/html") || trimmed.startsWith("<");
    throw new RemoteClientError(
      htmlLike
        ? "That endpoint returned the app HTML instead of the desktop API. Use the desktop API endpoint shown in Remote Access settings, not the web app URL."
        : "Remote request failed.",
      response.status,
      "invalid_response",
    );
  }
}

/**
 * Parse a value against a response schema, converting a {@link z.ZodError}
 * into a readable {@link RemoteClientError}. Raw ZodError `.message` is a JSON
 * issue dump that callers render verbatim (mobile toast, desktop banner); this
 * gives users a readable message and a stable `code` to branch on.
 */
function parseResponse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new RemoteClientError(
    `The server sent an unexpected ${what} response. It may be running an incompatible version.`,
    500,
    "invalid_response",
    { cause: result.error },
  );
}

function removeExplicitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeExplicitUndefined);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (nested !== undefined) result[key] = removeExplicitUndefined(nested);
  }
  return result;
}

/**
 * JSON cannot carry explicit `undefined`, but Zod's inferred optional properties
 * include it. Remove any transform/default-produced undefined keys recursively
 * so the validated result soundly satisfies exact-optional producer interfaces.
 */
function parseExactOptionalResponse<Contract>(
  schema: z.ZodType<NormalizeExactOptionalProperties<Contract>>,
  value: unknown,
  what: string,
): Contract {
  return removeExplicitUndefined(parseResponse(schema, value, what)) as Contract;
}

function defaultClientMetadata(): RemoteClientMetadata {
  const userAgent = globalThis.navigator?.userAgent;
  const isMobile = userAgent ? /\bMobile\b/i.test(userAgent) : false;
  return {
    label: isMobile ? "Poracode mobile web" : "Poracode web app",
    deviceType: isMobile ? "mobile" : "browser",
    ...(userAgent ? { os: userAgent } : {}),
  };
}

function endpointUrl(endpoint: string, path: string): URL {
  const base = new URL(endpoint);
  base.search = "";
  base.hash = "";
  if (!base.pathname.endsWith("/")) {
    base.pathname = `${base.pathname}/`;
  }
  return new URL(path.replace(/^\/+/, ""), base);
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
  readonly certFingerprint?: string;
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

const DEFAULT_REMOTE_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_REMOTE_RESPONSE_MAX_BYTES = 64 * 1024 * 1024;
/** Bounded revalidating-GET cache: shell snapshot, agent statuses, and one
 * thread history per open thread fit far below this; eviction is oldest-first. */
const ETAG_CACHE_MAX_ENTRIES = 32;

/**
 * Image-ticket cache for {@link RemoteDesktopClient.localImageUrl}. The TTL
 * mirrors the host's mint window (`ImageTicketStore`, 30 s); a cached URL is
 * reused only while more than the reuse margin remains so an `<img>` load
 * starts with real validity left. The bound mirrors the host's live-ticket
 * cap in spirit; eviction is oldest-first.
 */
const LOCAL_IMAGE_TICKET_TTL_MS = 30_000;
const LOCAL_IMAGE_TICKET_REUSE_MARGIN_MS = 5_000;
const LOCAL_IMAGE_TICKET_CACHE_MAX_ENTRIES = 64;

/**
 * Long-running server operations (clone, push, PR creation, commit, sync,
 * merge) routinely exceed the 60s default while succeeding server-side; a
 * short deadline reports a false failure while the op keeps running. These get
 * a generous deadline instead.
 */
const LONG_REMOTE_REQUEST_TIMEOUT_MS = 5 * 60_000;

const settingsResponseSchema = z.object({ settings: remoteSettingsSchema });
const browserStateResponseSchema = z.object({ state: remoteBrowserStateSchema });
const attachmentUploadResponseSchema = z.object({ path: z.string().min(1) });
/** Mint result of `POST /api/files/image-ticket` (B5b ticket flow). */
const remoteImageTicketResultSchema = z.object({
  ticket: z.string().min(1),
  expiresAt: z.string().min(1),
});
const projectNotesResponseSchema = z.object({ notes: projectNotesSchema.nullable() });
const prWatchResponseSchema = z.object({ watch: prWatchSchema.nullable() });

export class RemoteDesktopClient {
  private readonly fetchImpl: RemoteFetch;
  private readonly requestTimeoutMs: number;
  private readonly maxResponseBodyBytes: number;
  private readonly onRequestSuccess: (() => void) | undefined;
  private readonly onRequestError: ((error: unknown) => void) | undefined;
  private tokenLifecycle: RemoteTokenLifecycle | undefined;
  /** The pin this client enforces on every request (adopted at first pair). */
  private pinnedCertFingerprint: string | undefined;
  private readonly certFingerprintProbe: RemoteCertFingerprintProbe | undefined;
  private readonly onCertFingerprintValidated: ((fingerprint: string) => void) | undefined;
  /** Memoized one-shot probe, so one client instance asks the transport once. */
  private certFingerprintVerification: Promise<string | null> | undefined;

  constructor(
    readonly endpoint: string,
    private accessToken?: string,
    fetchImpl?: RemoteFetch,
    options: RemoteDesktopClientOptions = {},
  ) {
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
    this.pinnedCertFingerprint = options.certFingerprint?.toLowerCase();
    this.certFingerprintProbe = options.certFingerprintProbe;
    this.onCertFingerprintValidated = options.onCertFingerprintValidated;
  }

  /**
   * Attaches (or replaces) the caller-owned refresh lifecycle after
   * construction — for callers that build clients through an injected
   * factory and can only bind persistence once the server record is known.
   */
  setTokenLifecycle(lifecycle: RemoteTokenLifecycle | undefined): void {
    this.tokenLifecycle = lifecycle;
  }

  /** Sets (or clears) the pinned server certificate fingerprint after
   * construction — same contract as the `certFingerprint` option. */
  setCertFingerprintPin(fingerprint: string | undefined): void {
    this.pinnedCertFingerprint = fingerprint?.toLowerCase();
  }

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

  async environment(): Promise<RemoteEnvironmentDescriptor> {
    let raw: unknown;
    try {
      raw = await this.requestJson("/.well-known/poracode/environment");
    } catch (error) {
      if (!(error instanceof RemoteClientError) || error.status !== 404) throw error;
      raw = await this.requestJson("/.well-known/lightcode/environment");
    }
    // Pre-parse the protocol version with a loose schema so a mismatch (the
    // literal in the strict schema would otherwise dump a JSON ZodError) yields
    // a readable, branchable error instead.
    const version = z.object({ protocolVersion: z.unknown() }).safeParse(raw).data?.protocolVersion;
    if (version !== PORACODE_REMOTE_PROTOCOL_VERSION) {
      throw new RemoteClientError(
        "This app version is incompatible with that server. Update both to the same version.",
        409,
        "protocol_version_mismatch",
      );
    }
    const descriptor = parseResponse(remoteEnvironmentDescriptorSchema, raw, "environment");
    // The wire schema is lenient about advertised scopes (a newer server may
    // list scopes this build doesn't know); narrow to the usable set here.
    return {
      ...descriptor,
      auth: {
        ...descriptor.auth,
        scopes: filterKnownRemoteAccessScopes(descriptor.auth.scopes),
      },
    };
  }

  async exchangePairingCredential(input: {
    readonly credential: string;
    readonly scopes?: readonly RemoteAccessScope[];
    /**
     * Client metadata to register with the session. Defaults to a
     * navigator-derived value (mobile/browser). A desktop-as-client caller
     * passes e.g. `{ label, deviceType: "desktop" }` — see also
     * {@link RemoteDesktopClientOptions.clientMetadata}.
     */
    readonly client?: RemoteClientMetadata;
    /**
     * Gate 6 item 4.2: the leaf-certificate fingerprint the pairing QR asserts
     * (`#fp=sha256:<hex>`). When it can be checked — against the probed
     * server certificate, or against this client's stored pin when no probe
     * is available — a mismatch refuses pairing BEFORE the one-time
     * credential is sent, so the credential cannot be stolen by a MITM whose
     * link was cloned.
     */
    readonly certFingerprint?: string;
  }): Promise<RemoteAccessTokenResult> {
    await this.refuseCertFingerprintMismatch(input.certFingerprint);
    const result = parseResponse(
      remoteAccessTokenResultSchema,
      await this.requestJson("/oauth/token", {
        method: "POST",
        body: {
          grantType: "pairing-token",
          credential: input.credential,
          scopes: [...(input.scopes ?? REMOTE_STANDARD_SCOPES)],
          client: input.client ?? defaultClientMetadata(),
        },
      }),
      "pairing",
    );
    // Server-echoed granted scopes are lenient on the wire; narrow to the set
    // this build can act on.
    const narrowed = { ...result, scopes: filterKnownRemoteAccessScopes(result.scopes) };
    // First pair over a probe-capable transport: adopt the observed
    // certificate as this record's pin (TOFU anchored by the QR's own
    // fingerprint assertion) and hand it to the caller for persistence.
    const actual = await this.probeCertFingerprint();
    if (actual && !this.pinnedCertFingerprint) {
      this.pinnedCertFingerprint = actual;
      this.onCertFingerprintValidated?.(actual);
    }
    return narrowed;
  }

  /**
   * Gate 6 item 4.6: exchanges the persisted refresh token for a fresh
   * 24-hour access token (the refresh value rotates server-side). Returns the
   * new tokens or null when this client has no lifecycle to refresh with.
   */
  async refreshTokens(): Promise<RemoteTokenSnapshot | null> {
    const refreshToken = this.tokenLifecycle?.refreshToken();
    if (!refreshToken) return null;
    const result = parseResponse(
      remoteAccessTokenResultSchema,
      await this.requestJson(
        "/oauth/token",
        { method: "POST", body: { grantType: "refresh_token", refreshToken } },
        // Never recurse into the refresh path from the refresh call itself.
        { isTokenRefresh: true },
      ),
      "token refresh",
    );
    const tokens: RemoteTokenSnapshot = {
      accessToken: result.accessToken,
      ...(result.refreshToken
        ? {
            refreshToken: result.refreshToken,
            ...(result.refreshTokenExpiresAt
              ? { refreshTokenExpiresAt: result.refreshTokenExpiresAt }
              : {}),
          }
        : {}),
    };
    this.accessToken = tokens.accessToken;
    this.tokenLifecycle?.onTokensRefreshed(tokens);
    return tokens;
  }

  /**
   * Gate 6 item 4.2: refuses a pairing whose QR-asserted fingerprint contradicts
   * what this client can verify (probed server certificate, else the stored
   * pin). Returns silently when there is no QR assertion or nothing to check
   * it against.
   */
  private async refuseCertFingerprintMismatch(claimed: string | undefined): Promise<void> {
    if (!claimed) return;
    const probed = await this.probeCertFingerprint();
    const reference = this.pinnedCertFingerprint ?? probed;
    if (reference && reference.toLowerCase() !== claimed.toLowerCase()) {
      throw new RemoteClientError(
        "The pairing link's certificate fingerprint does not match the server's TLS certificate. The link may be cloned, or the server certificate changed — re-generate the pairing QR on the desktop.",
        502,
        "certificate_fingerprint_mismatch",
      );
    }
  }

  private probeCertFingerprintVerification(): Promise<string | null> {
    this.certFingerprintVerification ??= (async () => {
      try {
        return await this.certFingerprintProbe!(endpointUrl(this.endpoint, "/"));
      } catch {
        return null;
      }
    })();
    return this.certFingerprintVerification;
  }

  private probeCertFingerprint(): Promise<string | null> {
    if (!this.certFingerprintProbe) return Promise.resolve(null);
    return this.probeCertFingerprintVerification();
  }

  /**
   * Shell snapshot. Without options the historical full thread list is
   * fetched. With `threadListPageLimit` (Gate 4 hazard #3) the request bounds
   * the thread list and this method transparently pages the remainder from
   * the thread-list route until the host reports the end, resolving with the
   * complete assembled snapshot so callers keep a single unchanged contract.
   * A host that predates the pagination ignores the query parameter and
   * returns no `threadsNextCursor`, which ends the loop after one response.
   */
  async snapshot(options: { threadListPageLimit?: number } = {}): Promise<RemoteShellSnapshot> {
    const limit = options.threadListPageLimit;
    let snapshot = parseResponse(
      remoteShellSnapshotSchema,
      await this.requestJson(
        limit === undefined ? "/api/snapshot" : `/api/snapshot?threadLimit=${limit}`,
      ),
      "snapshot",
    );
    let cursor: string | null = snapshot.threadsNextCursor ?? null;
    if (cursor === null) return snapshot;
    const threads = [...snapshot.threads];
    const runtimeSummariesByThread = { ...snapshot.runtimeSummariesByThread };
    let gitSummariesByThread = snapshot.gitSummariesByThread;
    // The host advances the cursor strictly past returned rows, so a repeated
    // cursor can only mean a misbehaving peer; refuse it instead of looping.
    const seenCursors = new Set<string>();
    while (cursor !== null) {
      if (seenCursors.has(cursor)) {
        throw new RemoteClientError(
          "The server repeated a thread-list cursor; the thread list may be incomplete.",
          502,
          "thread_list_cursor_loop",
        );
      }
      seenCursors.add(cursor);
      const nextCursor: string = cursor;
      const page: RemoteThreadListPage = parseResponse(
        remoteThreadListPageSchema,
        await this.requestJson(
          `/api/threads?limit=${limit}&cursor=${encodeURIComponent(nextCursor)}`,
        ),
        "thread list page",
      );
      threads.push(...page.threads);
      Object.assign(runtimeSummariesByThread, page.runtimeSummariesByThread);
      if (page.gitSummariesByThread) {
        gitSummariesByThread = { ...(gitSummariesByThread ?? {}), ...page.gitSummariesByThread };
      }
      cursor = page.nextCursor ?? null;
    }
    return {
      ...snapshot,
      threads,
      runtimeSummariesByThread,
      ...(gitSummariesByThread !== undefined ? { gitSummariesByThread } : {}),
      threadsNextCursor: null,
    };
  }

  async agentStatuses(options: { omitSlashCommands?: boolean } = {}): Promise<RemoteAgentStatuses> {
    // WS3-A payload split: slash-command catalogs dominate this response, so
    // clients that fetch them lazily pass omitSlashCommands to skip them.
    const path = options.omitSlashCommands
      ? "/api/agent-statuses?slashCommands=0"
      : "/api/agent-statuses";
    return parseResponse(remoteAgentStatusesSchema, await this.requestJson(path), "agent statuses");
  }

  /** One agent's slash-command catalog (WS3-A lazy fetch partner). */
  async agentSlashCommands(kind: string): Promise<RemoteAgentSlashCommands> {
    return parseResponse(
      remoteAgentSlashCommandsSchema,
      await this.requestJson(`/api/agents/${encodeURIComponent(kind)}/slash-commands`),
      "agent slash commands",
    );
  }

  async hostUpdateState(): Promise<RemoteHostUpdateState> {
    return parseResponse(
      remoteHostUpdateStateSchema,
      await this.requestJson("/api/host-update"),
      "host update",
    );
  }

  async checkHostUpdate(): Promise<RemoteHostUpdateState> {
    return parseResponse(
      remoteHostUpdateStateSchema,
      await this.requestJson("/api/host-update/check", { method: "POST", body: {} }),
      "host update",
    );
  }

  async installHostUpdate(): Promise<void> {
    await this.requestJson("/api/host-update/install", { method: "POST", body: {} });
  }

  /** Provider usage snapshots validated against the collector-owned wire schema. */
  async providerUsage(): Promise<ProviderUsageResponse> {
    return parseResponse(
      providerUsageResponseSchema,
      await this.requestJson("/api/provider-usage"),
      "provider usage",
    );
  }

  async projectNotes(projectId: string): Promise<ProjectNotes | null> {
    const result = parseResponse(
      projectNotesResponseSchema,
      await this.requestJson(`/api/projects/${encodeURIComponent(projectId)}/notes`),
      "project notes",
    );
    return result.notes;
  }

  async setProjectNotes(notes: ProjectNotes): Promise<void> {
    const { projectId, ...body } = notes;
    await this.requestJson(`/api/projects/${encodeURIComponent(projectId)}/notes`, {
      method: "POST",
      body,
    });
  }

  /** Remote-editable desktop settings (the AI helpers). */
  async settings(): Promise<RemoteSettings> {
    const result = parseResponse(
      settingsResponseSchema,
      await this.requestJson("/api/settings"),
      "settings",
    );
    return result.settings;
  }

  async updateSettings(patch: RemoteSettingsPatch): Promise<RemoteSettings> {
    const result = parseResponse(
      settingsResponseSchema,
      await this.requestJson("/api/settings", { method: "POST", body: patch }),
      "settings",
    );
    return result.settings;
  }

  async uploadAttachment(input: {
    readonly threadId: string;
    readonly fileName: string;
    readonly data: Uint8Array;
  }): Promise<string> {
    const url = new URL("/api/files/attachment", "http://poracode.invalid");
    url.searchParams.set("threadId", input.threadId);
    url.searchParams.set("name", input.fileName);
    const result = parseResponse(
      attachmentUploadResponseSchema,
      await this.requestJson(`${url.pathname}${url.search}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        rawBody: input.data,
      }),
      "attachment upload",
    );
    return result.path;
  }

  async schedules(): Promise<ScheduledTask[]> {
    const result = parseResponse(
      remoteSchedulesResponseSchema,
      await this.requestJson("/api/schedules"),
      "schedules",
    );
    return result.schedules;
  }

  private async scheduleCommand(
    command: RemoteScheduleCommand,
  ): Promise<ScheduledTask | undefined> {
    const result = parseResponse(
      remoteSchedulesResponseSchema,
      await this.requestJson("/api/schedules/command", { method: "POST", body: command }),
      "schedule command",
    );
    return result.schedule;
  }

  async createSchedule(task: ScheduledTaskInput): Promise<ScheduledTask> {
    const schedule = await this.scheduleCommand({ kind: "create", task });
    if (!schedule) throw new Error("The desktop did not return the created schedule.");
    return schedule;
  }

  async updateSchedule(id: string, task: ScheduledTaskInput): Promise<ScheduledTask> {
    const schedule = await this.scheduleCommand({ kind: "update", id, task });
    if (!schedule) throw new Error("The desktop did not return the updated schedule.");
    return schedule;
  }

  async deleteSchedule(id: string): Promise<void> {
    await this.scheduleCommand({ kind: "delete", id });
  }

  async runScheduleNow(id: string): Promise<ScheduledTask> {
    const schedule = await this.scheduleCommand({ kind: "run", id });
    if (!schedule) throw new Error("The desktop did not return the running schedule.");
    return schedule;
  }

  async scheduleRuns(id: string): Promise<ScheduledTaskRun[]> {
    const query = new URLSearchParams({ id });
    const result = parseResponse(
      remoteScheduleRunsResponseSchema,
      await this.requestJson(`/api/schedules/runs?${query.toString()}`),
      "schedule runs",
    );
    return result.runs;
  }

  async getPrWatch(input: PrWatchKey): Promise<PrWatch | null> {
    const query = new URLSearchParams({
      projectId: input.projectId,
      prNumber: String(input.prNumber),
    });
    const result = parseResponse(
      prWatchResponseSchema,
      await this.requestJson(`/api/pr-watches?${query.toString()}`),
      "PR automation",
    );
    return result.watch;
  }

  async checkPrWatch(input: PrWatchKey): Promise<void> {
    await this.requestJson("/api/pr-watches/check", { method: "POST", body: input });
  }

  async upsertPrWatch(input: PrWatchInput): Promise<PrWatch> {
    const result = parseResponse(
      prWatchResponseSchema,
      await this.requestJson("/api/pr-watches", { method: "POST", body: input }),
      "PR automation",
    );
    if (!result.watch) throw new Error("The desktop did not return the PR automation state.");
    return result.watch;
  }

  async deletePrWatch(input: PrWatchKey): Promise<void> {
    await this.requestJson("/api/pr-watches", { method: "DELETE", body: input });
  }

  async syncPrWatchAgent(input: PrWatchAgentSync): Promise<void> {
    await this.requestJson("/api/pr-watches/agent", { method: "POST", body: input });
  }

  /**
   * Profile: local usage stats + identity, computed on the paired desktop's
   * SQLite store. Response shapes are typed contracts with no runtime schema
   * (like {@link providerUsage}), so only a light shape check. The stats
   * blobs carry many more keys than the check names, so they must stay
   * looseObject — a plain z.object would strip everything unnamed.
   */
  async profileDevices(): Promise<ProfileDevicesResponse> {
    return parseExactOptionalResponse<ProfileDevicesResponse>(
      profileDevicesResponseSchema,
      await this.requestJson("/api/profile/devices"),
      "profile devices",
    );
  }

  async profileCoreStats(req: ProfileStatsRequest): Promise<ProfileCoreStats> {
    return parseExactOptionalResponse<ProfileCoreStats>(
      profileCoreStatsSchema,
      await this.requestJson("/api/profile/core-stats", { method: "POST", body: req }),
      "profile stats",
    );
  }

  async profileTokenStats(req: ProfileStatsRequest): Promise<ProfileTokenStats> {
    return parseExactOptionalResponse<ProfileTokenStats>(
      profileTokenStatsSchema,
      await this.requestJson("/api/profile/token-stats", { method: "POST", body: req }),
      "profile token stats",
    );
  }

  async setProfileIdentity(identity: ProfileIdentity): Promise<ProfileIdentityResponse> {
    return parseExactOptionalResponse<ProfileIdentityResponse>(
      profileIdentityResponseSchema,
      await this.requestJson("/api/profile/identity", { method: "POST", body: identity }),
      "profile identity",
    );
  }

  async browserState(): Promise<RemoteBrowserState> {
    const result = parseResponse(
      browserStateResponseSchema,
      await this.requestJson("/api/browser/state"),
      "browser state",
    );
    return result.state;
  }

  /** Tab mutation (create/close/activate/navigate/…); returns the new state. */
  async browserCommand(command: RemoteBrowserCommand): Promise<RemoteBrowserState> {
    const result = parseResponse(
      browserStateResponseSchema,
      await this.requestJson("/api/browser/command", { method: "POST", body: command }),
      "browser state",
    );
    return result.state;
  }

  async threadHistory(
    threadId: string,
    options: ThreadHistoryOptions = {},
  ): Promise<RemoteThreadSnapshot> {
    const search = new URLSearchParams({
      runtimePage: "1",
      ...(options.targetTimelineEntryCount !== undefined
        ? { targetTimelineEntryCount: String(options.targetTimelineEntryCount) }
        : {}),
      ...(options.omitScrollback ? { omitScrollback: "1" } : {}),
    });
    return remoteThreadSnapshotSchema.parse(
      await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/history?${search}`),
    );
  }

  async threadRuntimeItemsPage(
    input: RemoteRuntimeItemsPageRequest,
  ): Promise<RemoteRuntimeItemsPage> {
    const search = new URLSearchParams({
      limit: String(input.limit),
      ...(input.beforePosition !== undefined
        ? { beforePosition: String(input.beforePosition) }
        : {}),
      ...(input.targetTimelineEntryCount !== undefined
        ? { targetTimelineEntryCount: String(input.targetTimelineEntryCount) }
        : {}),
    });
    return remoteRuntimeItemsPageSchema.parse(
      await this.requestJson(
        `/api/threads/${encodeURIComponent(input.threadId)}/history/items?${search}`,
      ),
    );
  }

  async startThread(input: StartRemoteThreadInput): Promise<StartThreadResult> {
    const result = await this.requestJson("/api/threads/start", {
      method: "POST",
      headers: {
        // Never reuse a send-path userMessageItemId: receipts reject the same
        // command id across routes, and a failed /send must still be able to
        // fall back to /start for unknown-session resume.
        [REMOTE_COMMAND_ID_HEADER]: input.userMessageItemId
          ? `thread-start-item:${input.userMessageItemId}`
          : input.threadId
            ? `thread-start:${input.threadId}`
            : crypto.randomUUID(),
      },
      body: {
        ...(input.threadId ? { threadId: input.threadId } : {}),
        projectLocation: input.projectLocation,
        agentKind: input.agentKind,
        ...(input.agentInstanceId ? { agentInstanceId: input.agentInstanceId } : {}),
        config: input.config,
        prompt: input.prompt,
        ...(input.segments && input.segments.length > 0 ? { segments: input.segments } : {}),
        initialSize: input.initialSize ?? DEFAULT_TERMINAL_SIZE,
        ...(input.sessionRef ? { sessionRef: input.sessionRef } : {}),
        ...(input.presentationMode ? { presentationMode: input.presentationMode } : {}),
        ...(input.userMessageItemId ? { userMessageItemId: input.userMessageItemId } : {}),
        ...(input.providerSwitch ? { providerSwitch: input.providerSwitch } : {}),
        ...(input.ensureRunning ? { ensureRunning: true } : {}),
      },
    });
    return parseResponse(z.object({ threadId: z.string() }), result, "thread");
  }

  async startNewThread(input: StartRemoteNewThreadInput): Promise<StartThreadResult> {
    const threadId = input.threadId ?? crypto.randomUUID();
    await this.sendThreadCommand({
      kind: "start",
      threadId,
      projectId: input.projectId,
      agentKind: input.agentKind,
      ...(input.agentInstanceId ? { agentInstanceId: input.agentInstanceId } : {}),
      config: input.config,
      prompt: input.prompt,
      ...(input.segments && input.segments.length > 0 ? { segments: [...input.segments] } : {}),
      ...(input.presentationMode ? { presentationMode: input.presentationMode } : {}),
      ...(input.userMessageItemId ? { userMessageItemId: input.userMessageItemId } : {}),
      ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
      ...(input.worktreeBranch ? { worktreeBranch: input.worktreeBranch } : {}),
      ...(input.isNewWorktree ? { isNewWorktree: true } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.groupId ? { groupId: input.groupId } : {}),
      ...(input.groupName ? { groupName: input.groupName } : {}),
    });
    return { threadId };
  }

  async sendThreadInput(input: SendThreadInputPayload): Promise<void> {
    const parsed = sendThreadInputPayloadSchema.parse(input);
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/send`, {
      method: "POST",
      headers: {
        [REMOTE_COMMAND_ID_HEADER]: parsed.userMessageItemId ?? crypto.randomUUID(),
      },
      body: {
        prompt: parsed.prompt,
        config: parsed.config,
        ...(parsed.segments ? { segments: parsed.segments } : {}),
        ...(parsed.userMessageItemId ? { userMessageItemId: parsed.userMessageItemId } : {}),
      },
    });
  }

  async interruptThread(threadId: string): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/interrupt`, {
      method: "POST",
    });
  }

  async controlThreadGoal(input: ControlThreadGoalPayload): Promise<void> {
    const { threadId, ...body } = controlThreadGoalPayloadSchema.parse(input);
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/goal`, {
      method: "POST",
      body,
    });
  }

  async closeThread(threadId: string): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/close`, {
      method: "POST",
    });
  }

  async truncateThreadRuntimeAfter(input: {
    readonly threadId: string;
    readonly itemId: string;
  }): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/runtime/truncate`, {
      method: "POST",
      body: { itemId: input.itemId },
    });
  }

  /** WS2 stage 4: the backend-owned compound checkpoint revert. */
  async checkpointRevert(input: {
    readonly threadId: string;
    readonly checkpointItemId: string;
    readonly operationKey: string;
  }): Promise<CheckpointRevertResult> {
    const parsed = checkpointRevertPayloadSchema.parse(input);
    return checkpointRevertResultSchema.parse(
      await this.requestJson(
        `/api/threads/${encodeURIComponent(parsed.threadId)}/checkpoint-revert`,
        {
          method: "POST",
          headers: {
            [REMOTE_COMMAND_ID_HEADER]: `${CHECKPOINT_REVERT_COMMAND_ID_PREFIX}${parsed.operationKey}`,
          },
          body: {
            checkpointItemId: parsed.checkpointItemId,
            operationKey: parsed.operationKey,
          },
        },
      ),
    );
  }

  async setPendingSteer(input: SetPendingSteerPayload): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/steer/set`, {
      method: "POST",
      body: {
        prompt: input.prompt,
        ...(input.segments ? { segments: input.segments } : {}),
        config: input.config,
      },
    });
  }

  async clearPendingSteer(threadId: string): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/steer/clear`, {
      method: "POST",
    });
  }

  /** Thread-metadata mutation (rename, done, pin, archive, delete). */
  async sendThreadCommand(command: RemoteThreadCommand): Promise<void> {
    const { threadId, ...body } = command;
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/command`, {
      method: "POST",
      ...(command.kind === "start"
        ? { headers: { [REMOTE_COMMAND_ID_HEADER]: `thread-start:${threadId}` } }
        : {}),
      body,
    });
  }

  async writeTerminal(input: { readonly threadId: string; readonly data: string }): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/terminal/write`, {
      method: "POST",
      body: { data: input.data },
    });
  }

  async resizeTerminal(input: ResizeTerminalPayload): Promise<void> {
    const { threadId, ...body } = input;
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/terminal/resize`, {
      method: "POST",
      body,
    });
  }

  /** Spawns a dev shell (the id is `shellId`, not scoped to a thread). */
  async startShell(input: StartShellPayload): Promise<void> {
    await this.requestJson(`/api/terminal/start`, { method: "POST", body: input });
  }

  /** Tears down a terminal PTY (CLI thread or dev shell) by id. */
  async closeShell(input: { readonly threadId: string }): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/terminal/close`, {
      method: "POST",
      body: {},
    });
  }

  async resolveRequest(input: {
    readonly threadId: string;
    readonly requestId: ThreadServerRequestId;
    readonly method: string;
    readonly response: unknown;
  }): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(input.threadId)}/requests/resolve`, {
      method: "POST",
      body: {
        requestId: input.requestId,
        method: input.method,
        response: input.response,
      },
    });
  }

  /**
   * Generic supervisor passthrough to the paired desktop. The reused desktop
   * project controls call bridge methods, which
   * the remote bridge shim forwards here (see bridge.ts). `procedure` is one of
   * the allowlisted names in REMOTE_PROCEDURE_SPECS; the server validates
   * it.
   */
  async callRemoteProcedure(procedure: string, payload: unknown): Promise<unknown> {
    try {
      if (!isRemoteProcedure(procedure)) {
        throw new RemoteClientError(
          `Procedure "${procedure}" is not available to remote clients.`,
          403,
          "git_procedure_not_allowed",
        );
      }
      const spec = REMOTE_PROCEDURE_SPECS[procedure];
      const envelope = await this.requestJson("/api/git/call", {
        method: "POST",
        body: { procedure, payload },
        ...("timeout" in spec && spec.timeout === "long"
          ? { timeoutMs: LONG_REMOTE_REQUEST_TIMEOUT_MS }
          : {}),
      });
      const resultSchema = ipcProcedureMap[procedure].resultSchema;
      if (!resultSchema) {
        throw new RemoteClientError(
          `Procedure "${procedure}" is missing an authoritative result schema.`,
          500,
          "git_procedure_result_schema_missing",
        );
      }
      if (resultSchema === omittedResultSchema) {
        parseResponse(omittedCallEnvelopeSchema, envelope, `procedure ${procedure}`);
        return undefined;
      }
      return parseResponse(jsonCallEnvelopeSchema(resultSchema), envelope, `procedure ${procedure}`)
        .result;
    } catch (error) {
      // A host from before
      // queued follow-ups knows the passthrough endpoint but rejects these new
      // procedure names; turn that capability miss into a stable, actionable
      // error. Never retry through setPendingSteer: queue and steer have
      // intentionally different semantics.
      if (
        isRemoteFollowUpQueueProcedure(procedure) &&
        error instanceof RemoteClientError &&
        ((error.status === 403 && error.code === "git_procedure_not_allowed") ||
          (error.status === 404 && error.code === "not_found"))
      ) {
        throw new RemoteClientError(
          msg("supervisor.followUpQueue.unsupported"),
          501,
          "follow_up_queue_unsupported",
          { cause: error },
        );
      }
      throw error;
    }
  }

  /**
   * Add (existing folder / scratch / clone) or remove a project on the paired
   * desktop or server. Requires the `projects:manage` scope. Returns the full
   * updated project list; connected clients also receive a
   * `remote-projects-changed` event to refresh their snapshot.
   */
  async projectCommand(command: RemoteProjectCommand): Promise<RemoteProjectCommandResult> {
    return remoteProjectCommandResultSchema.parse(
      await this.requestJson("/api/projects/command", {
        method: "POST",
        body: command,
        ...(command.kind === "clone" ? { timeoutMs: LONG_REMOTE_REQUEST_TIMEOUT_MS } : {}),
      }),
    );
  }

  async projectSettings(projectId: string): Promise<RemoteProjectSettings> {
    return remoteProjectSettingsSchema.parse(
      await this.requestJson(`/api/projects/${encodeURIComponent(projectId)}/settings`),
    );
  }

  /**
   * Discover dev servers listening on the paired desktop's localhost, plus any
   * forwards already open. Requires the `ports:forward` scope. Runs a fresh
   * scan on every call (fast — a handful of concurrent, short-timeout probes).
   */
  async listPorts(): Promise<RemotePortsState> {
    return remotePortsStateSchema.parse(await this.requestJson("/api/ports"));
  }

  /**
   * Opens a raw TCP proxy from the desktop's LAN-reachable interface to
   * `127.0.0.1:targetPort`, so a phone browser can load it directly at
   * `http://<advertisedHost>:<listenPort>/`. Idempotent per `targetPort` (a
   * second call returns the existing forward). Requires `ports:forward`.
   */
  async startPortForward(targetPort: number): Promise<RemotePortForwardResult> {
    return remotePortForwardResultSchema.parse(
      await this.requestJson("/api/ports/forward", { method: "POST", body: { targetPort } }),
    );
  }

  /** Closes a port forward by id. Requires `ports:forward`. */
  async stopPortForward(id: string): Promise<void> {
    remotePortUnforwardResultSchema.parse(
      await this.requestJson("/api/ports/unforward", { method: "POST", body: { id } }),
    );
  }

  /**
   * Mints a fresh enter token for an already-open forward (the one returned by
   * {@link startPortForward} may have expired — tokens are TTL'd). Requires
   * `ports:forward`. Throws `forward_not_found` (404) if the forward has since
   * closed.
   */
  async enterPortForward(id: string): Promise<RemotePortEnterResult> {
    return remotePortEnterResultSchema.parse(
      await this.requestJson("/api/ports/enter", { method: "POST", body: { id } }),
    );
  }

  /**
   * Register this device's APNs tokens for push notifications and Live
   * Activities. Idempotent upsert keyed by `deviceId`: any token field present
   * replaces the stored value; absent fields are preserved. Requires the
   * `session:operate` scope (no separate push scope), so already-paired devices
   * register without re-pairing.
   */
  async registerPush(registration: RemotePushRegistration): Promise<RemotePushRegistrationResult> {
    return parseResponse(
      remotePushRegistrationResultSchema,
      await this.requestJson("/api/push/register", { method: "POST", body: registration }),
      "push registration",
    );
  }

  /** Resolve the VAPID application-server key used by installed web apps. */
  async webPushConfig(): Promise<{ publicKey: string }> {
    return remoteWebPushConfigResultSchema.parse(await this.requestJson("/api/push/config"));
  }

  /** Drop all push registrations for a device (sign-out / unpair). */
  async unregisterPush(deviceId: string, routing?: RemotePushRegistrationRouting): Promise<void> {
    await this.requestJson("/api/push/unregister", {
      method: "POST",
      body: { deviceId, ...(routing ? { routing } : {}) },
    });
  }

  async websocketTicket(timeoutMs?: number): Promise<string> {
    const result = remoteWebSocketTicketResultSchema.parse(
      await this.requestJson("/api/auth/websocket-ticket", {
        method: "POST",
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      }),
    );
    return result.ticket;
  }

  /**
   * Build the event-stream WebSocket URL. `lastSeenSeq` is the sequence the
   * client has already applied; the server replays events after it (and
   * signals `resync-required` if that window has expired). Send it whenever it
   * is a non-negative sequence — including `0`, which asks the server to
   * replay from the beginning / resync. Omission is reserved for the sentinel
   * meaning "no snapshot yet" (`null`/`undefined`), which the server reads as
   * "no replay". A client at snapshotSeq=0 that omitted the param would
   * otherwise silently miss events.
   */
  websocketUrl(
    ticket: string,
    lastSeenSeq: number | null | undefined,
    options: { readonly threadItemInterests?: readonly string[] } = {},
  ): string {
    const url = toWebSocketUrl(endpointUrl(this.endpoint, "/ws"));
    url.searchParams.set("ticket", ticket);
    if (typeof lastSeenSeq === "number" && Number.isInteger(lastSeenSeq) && lastSeenSeq >= 0) {
      url.searchParams.set("lastSeenSeq", String(lastSeenSeq));
    }
    if (options.threadItemInterests) {
      url.searchParams.set("threadItemInterests", JSON.stringify(options.threadItemInterests));
    }
    return url.toString();
  }

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

  parseSocketMessage(value: string): RemoteWebSocketServerMessage {
    return remoteWebSocketServerMessageSchema.parse(JSON.parse(value) as unknown);
  }

  tryParseSocketMessage(value: string): RemoteWebSocketServerMessage | null {
    return tryParseRemoteSocketMessage(value);
  }

  private async requestJson(
    path: string,
    init: {
      readonly method?: "GET" | "POST" | "DELETE";
      readonly body?: unknown;
      readonly rawBody?: Uint8Array;
      readonly headers?: Readonly<Record<string, string>>;
      /** Per-call deadline override; defaults to the client's requestTimeoutMs.
       * Long-running ops (clone, push, PR creation) pass a larger value. */
      readonly timeoutMs?: number;
    } = {},
    // Internal refresh-loop state: the token-refresh call never refreshes
    // (that would loop), and a post-refresh retry never retries again.
    refreshState: { readonly isTokenRefresh?: boolean; readonly isRefreshRetry?: boolean } = {},
  ): Promise<unknown> {
    // Gate 6 item 4.2: with a pinned fingerprint and a TLS-observable
    // transport, refuse BEFORE credentials leave the client.
    if (this.pinnedCertFingerprint && this.certFingerprintProbe) {
      const actual = await this.probeCertFingerprint();
      if (actual && actual.toLowerCase() !== this.pinnedCertFingerprint) {
        throw new RemoteClientError(
          "The server's TLS certificate no longer matches the fingerprint pinned at pairing. Re-pair the device from the desktop's Remote Access panel.",
          502,
          "certificate_fingerprint_mismatch",
        );
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
            if (await this.refreshTokens()) {
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
