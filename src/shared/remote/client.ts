import { z } from "zod";
import { remoteImageRefPath, type RemoteImageRefValue } from "./imageRef";
import {
  PORACODE_REMOTE_PROTOCOL_VERSION,
  REMOTE_COMMAND_ID_HEADER,
  REMOTE_STANDARD_SCOPES,
  filterKnownRemoteAccessScopes,
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
  remoteProjectCommandResultSchema,
  remoteProjectSettingsSchema,
  remoteRuntimeItemsPageSchema,
  remoteShellSnapshotSchema,
  remoteThreadSnapshotSchema,
  remoteWebSocketServerMessageSchema,
  remoteWebSocketTicketResultSchema,
  toWebSocketUrl,
  type RemoteAccessScope,
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
  type RemoteRuntimeItemsPage,
  type RemoteRuntimeItemsPageRequest,
  type RemoteSettings,
  type RemoteSettingsPatch,
  type RemoteScheduleCommand,
  type RemoteShellSnapshot,
  type RemoteThreadSnapshot,
  type RemoteWebSocketServerMessage,
} from "@/shared/remote";
import {
  DEFAULT_TERMINAL_SIZE,
  controlThreadGoalPayloadSchema,
  profileIdentitySchema,
  prWatchSchema,
  projectNotesSchema,
  sendThreadInputPayloadSchema,
  type ProfileCoreStats,
  type ControlThreadGoalPayload,
  type ProfileDevicesResponse,
  type ProfileIdentity,
  type ProfileIdentityResponse,
  type ProfileStatsRequest,
  type ProfileTokenStats,
  type PrWatch,
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
} from "@/shared/contracts";
import { readBoundedResponseBody } from "@/shared/http";

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

export interface ThreadHistoryOptions {
  readonly targetTimelineEntryCount?: number;
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
}

export interface StartRemoteThreadInput extends StartRemoteThreadCommon {
  readonly projectLocation: ProjectLocation;
  readonly initialSize?: TerminalSize | undefined;
  readonly sessionRef?: StartThreadPayload["sessionRef"] | undefined;
  readonly userMessageItemId?: StartThreadPayload["userMessageItemId"] | undefined;
}

export interface StartRemoteNewThreadInput extends StartRemoteThreadCommon {
  readonly projectId: string;
  readonly worktreePath?: string | undefined;
  readonly worktreeBranch?: string | undefined;
  readonly isNewWorktree?: boolean | undefined;
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
}

const DEFAULT_REMOTE_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_REMOTE_RESPONSE_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Long-running server operations (clone, push, PR creation, commit, sync,
 * merge) routinely exceed the 60s default while succeeding server-side; a
 * short deadline reports a false failure while the op keeps running. These get
 * a generous deadline instead.
 */
const LONG_REMOTE_REQUEST_TIMEOUT_MS = 5 * 60_000;

/**
 * Git-call procedures that mutate remote state and can run long (network I/O
 * against a remote or GitHub). These use {@link LONG_REMOTE_REQUEST_TIMEOUT_MS}.
 * Kept in sync loosely with REMOTE_PROCEDURE_SPECS' `session:operate`
 * network operations — the point is to avoid false timeouts on slow ops, so
 * over-inclusion here is harmless.
 */
const LONG_RUNNING_GIT_PROCEDURES: ReadonlySet<string> = new Set([
  "gitFetch",
  "gitPull",
  "gitPullRebase",
  "gitPush",
  "gitSync",
  "gitSyncRebase",
  "gitCommit",
  "gitMergeToSource",
  "gitPullFromSource",
  "gitFinishMerge",
  "ghCreatePr",
  "ghMergePr",
  "ghUpdatePrBranch",
  "ghSubmitPrReview",
  "generateCommitMessage",
  "generateTitle",
  "generatePrSummary",
]);

const settingsResponseSchema = z.object({ settings: remoteSettingsSchema });
const browserStateResponseSchema = z.object({ state: remoteBrowserStateSchema });
const attachmentUploadResponseSchema = z.object({ path: z.string().min(1) });
const projectNotesResponseSchema = z.object({ notes: projectNotesSchema.nullable() });
const prWatchResponseSchema = z.object({ watch: prWatchSchema.nullable() });

export class RemoteDesktopClient {
  private readonly fetchImpl: RemoteFetch;
  private readonly requestTimeoutMs: number;
  private readonly maxResponseBodyBytes: number;

  constructor(
    readonly endpoint: string,
    private readonly accessToken?: string,
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
  }

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
  }): Promise<RemoteAccessTokenResult> {
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
    return { ...result, scopes: filterKnownRemoteAccessScopes(result.scopes) };
  }

  async snapshot(): Promise<RemoteShellSnapshot> {
    return parseResponse(
      remoteShellSnapshotSchema,
      await this.requestJson("/api/snapshot"),
      "snapshot",
    );
  }

  async agentStatuses(): Promise<RemoteAgentStatuses> {
    return parseResponse(
      remoteAgentStatusesSchema,
      await this.requestJson("/api/agent-statuses"),
      "agent statuses",
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

  /** Provider usage snapshots; the response shape is a typed contract with no
   * runtime schema (see `ProviderUsageResponse`), so a light shape check only. */
  async providerUsage(): Promise<ProviderUsageResponse> {
    const result = parseResponse(
      z.object({ snapshots: z.array(z.unknown()), fromCache: z.boolean() }),
      await this.requestJson("/api/provider-usage"),
      "provider usage",
    );
    return result as ProviderUsageResponse;
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
    await this.requestJson(`/api/projects/${encodeURIComponent(notes.projectId)}/notes`, {
      method: "POST",
      body: notes,
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

  /**
   * Profile: local usage stats + identity, computed on the paired desktop's
   * SQLite store. Response shapes are typed contracts with no runtime schema
   * (like {@link providerUsage}), so only a light shape check. The stats
   * blobs carry many more keys than the check names, so they must stay
   * looseObject — a plain z.object would strip everything unnamed.
   */
  async profileDevices(): Promise<ProfileDevicesResponse> {
    const result = parseResponse(
      z.object({ devices: z.array(z.unknown()), currentDeviceId: z.string() }),
      await this.requestJson("/api/profile/devices"),
      "profile devices",
    );
    return result as ProfileDevicesResponse;
  }

  async profileCoreStats(req: ProfileStatsRequest): Promise<ProfileCoreStats> {
    const result = parseResponse(
      z.looseObject({ scope: z.string(), device: z.unknown(), totals: z.unknown() }),
      await this.requestJson("/api/profile/core-stats", { method: "POST", body: req }),
      "profile stats",
    );
    return result as unknown as ProfileCoreStats;
  }

  async profileTokenStats(req: ProfileStatsRequest): Promise<ProfileTokenStats> {
    const result = parseResponse(
      z.looseObject({ available: z.boolean(), scope: z.string(), device: z.unknown() }),
      await this.requestJson("/api/profile/token-stats", { method: "POST", body: req }),
      "profile token stats",
    );
    return result as unknown as ProfileTokenStats;
  }

  async setProfileIdentity(identity: ProfileIdentity): Promise<ProfileIdentityResponse> {
    const result = parseResponse(
      z.object({ identity: profileIdentitySchema, device: z.unknown() }),
      await this.requestJson("/api/profile/identity", { method: "POST", body: identity }),
      "profile identity",
    );
    return result as ProfileIdentityResponse;
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
        [REMOTE_COMMAND_ID_HEADER]: input.userMessageItemId ?? crypto.randomUUID(),
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
      ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
      ...(input.worktreeBranch ? { worktreeBranch: input.worktreeBranch } : {}),
      ...(input.isNewWorktree ? { isNewWorktree: true } : {}),
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
    const result = (await this.requestJson("/api/git/call", {
      method: "POST",
      body: { procedure, payload },
      // push / PR creation / commit / sync run long; don't false-timeout them.
      ...(LONG_RUNNING_GIT_PROCEDURES.has(procedure)
        ? { timeoutMs: LONG_REMOTE_REQUEST_TIMEOUT_MS }
        : {}),
    })) as { result: unknown };
    return result.result;
  }

  /**
   * Add (existing folder / scratch / clone) or remove a project on the paired
   * desktop or server. Requires the `projects:manage` scope. Returns the full
   * updated project list; connected clients also receive a
   * `remote-projects-changed` event to refresh their snapshot.
   */
  async projectCommand(command: RemoteProjectCommand): Promise<RemoteProjectCommandResult> {
    return remoteProjectCommandResultSchema.parse(
      await this.requestJson("/api/projects/command", { method: "POST", body: command }),
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
  async registerPush(registration: RemotePushRegistration): Promise<void> {
    parseResponse(
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
  async unregisterPush(deviceId: string): Promise<void> {
    await this.requestJson("/api/push/unregister", { method: "POST", body: { deviceId } });
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
  websocketUrl(ticket: string, lastSeenSeq: number | null | undefined): string {
    const url = toWebSocketUrl(endpointUrl(this.endpoint, "/ws"));
    url.searchParams.set("ticket", ticket);
    if (typeof lastSeenSeq === "number" && Number.isInteger(lastSeenSeq) && lastSeenSeq >= 0) {
      url.searchParams.set("lastSeenSeq", String(lastSeenSeq));
    }
    return url.toString();
  }

  /**
   * Absolute URL of the authenticated image endpoint used for poracode-local
   * sources. The access token rides in the query string because <img> tags
   * can't send Authorization headers. Returns "" without a token — callers
   * fall back to the original (unrenderable in a browser) URL then.
   */
  localImageUrl(absolutePath: string): string {
    if (!this.accessToken) return "";
    const url = endpointUrl(this.endpoint, "/api/files/image");
    url.searchParams.set("path", absolutePath);
    url.searchParams.set("access_token", this.accessToken);
    return url.toString();
  }

  /**
   * Absolute URL for a host-minted image reference. Like {@link localImageUrl}
   * the token rides in the query string because <img> tags can't send an
   * Authorization header — but unlike it, the location is addressed inside the
   * host's own stored payload rather than by a filesystem path, so nothing the
   * agent wrote can influence what gets served. Returns "" without a token.
   */
  imageRefUrl(ref: RemoteImageRefValue): string {
    if (!this.accessToken) return "";
    const url = endpointUrl(this.endpoint, remoteImageRefPath(ref));
    url.searchParams.set("access_token", this.accessToken);
    return url.toString();
  }

  parseSocketMessage(value: string): RemoteWebSocketServerMessage {
    return remoteWebSocketServerMessageSchema.parse(JSON.parse(value) as unknown);
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
  ): Promise<unknown> {
    const headers: Record<string, string> = { ...init.headers };
    if (init.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (this.accessToken) {
      headers.authorization = `Bearer ${this.accessToken}`;
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
        throw new RemoteClientError(
          "Remote request returned 304 without a cached body.",
          304,
          "not_modified",
        );
      }
      const body = await Promise.race([
        readBoundedResponseBody(response, this.maxResponseBodyBytes),
        timeoutPromise,
      ]);
      const text = new TextDecoder().decode(body);
      const parsed = parseJsonResponse(text, response);
      if (!response.ok) {
        const error = remoteHttpErrorSchema.safeParse(parsed);
        throw new RemoteClientError(
          error.success ? error.data.error.message : "Remote request failed.",
          response.status,
          error.success ? error.data.error.code : "request_failed",
        );
      }
      return parsed;
    } catch (error) {
      if (controller.signal.aborted && error !== timeoutError) {
        throw new RemoteClientError(
          `Remote request timed out after ${effectiveTimeoutMs}ms.`,
          0,
          "timeout",
          { cause: error },
        );
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
