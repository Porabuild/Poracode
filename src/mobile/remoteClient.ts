import { z } from "zod";
import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import {
  REMOTE_STANDARD_SCOPES,
  remoteAgentStatusesSchema,
  remoteAccessTokenResultSchema,
  remoteBrowserStateSchema,
  remoteEnvironmentDescriptorSchema,
  remoteHttpErrorSchema,
  remoteSettingsSchema,
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
  type RemoteEnvironmentDescriptor,
  type RemoteSettings,
  type RemoteSettingsPatch,
  type RemoteShellSnapshot,
  type RemoteThreadSnapshot,
  type RemoteWebSocketServerMessage,
} from "@/shared/remote";
import {
  DEFAULT_TERMINAL_SIZE,
  sendThreadInputPayloadSchema,
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
} from "@/shared/contracts";

export class RemoteClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "RemoteClientError";
  }
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
        ? i18n._(
            msg`That endpoint opened the mobile app instead of the desktop API. Use the desktop endpoint from Settings → Remote Access.`,
          )
        : "Remote request failed.",
      response.status,
      "invalid_response",
    );
  }
}

export interface StartRemoteThreadInput {
  readonly threadId?: StartThreadPayload["threadId"] | undefined;
  readonly projectLocation: ProjectLocation;
  readonly agentKind: StartThreadPayload["agentKind"];
  readonly agentInstanceId?: StartThreadPayload["agentInstanceId"] | undefined;
  readonly config: ThreadConfig;
  readonly prompt: string;
  readonly segments?: readonly PromptSegment[] | undefined;
  readonly initialSize?: TerminalSize | undefined;
  readonly sessionRef?: StartThreadPayload["sessionRef"] | undefined;
  readonly presentationMode?: ThreadPresentationMode | undefined;
  readonly userMessageItemId?: StartThreadPayload["userMessageItemId"] | undefined;
}

export interface StartRemoteNewThreadInput {
  readonly threadId?: string | undefined;
  readonly projectId: string;
  readonly agentKind: StartThreadPayload["agentKind"];
  readonly agentInstanceId?: StartThreadPayload["agentInstanceId"] | undefined;
  readonly config: ThreadConfig;
  readonly prompt: string;
  readonly segments?: readonly PromptSegment[] | undefined;
  readonly presentationMode?: ThreadPresentationMode | undefined;
  readonly worktreePath?: string | undefined;
  readonly worktreeBranch?: string | undefined;
  readonly isNewWorktree?: boolean | undefined;
}

export class RemoteDesktopClient {
  constructor(
    readonly endpoint: string,
    private readonly accessToken?: string,
  ) {}

  async environment(): Promise<RemoteEnvironmentDescriptor> {
    return remoteEnvironmentDescriptorSchema.parse(
      await this.requestJson("/.well-known/lightcode/environment"),
    );
  }

  async exchangePairingCredential(input: {
    readonly credential: string;
    readonly scopes?: readonly RemoteAccessScope[];
  }): Promise<RemoteAccessTokenResult> {
    return remoteAccessTokenResultSchema.parse(
      await this.requestJson("/oauth/token", {
        method: "POST",
        body: {
          grantType: "pairing-token",
          credential: input.credential,
          scopes: [...(input.scopes ?? REMOTE_STANDARD_SCOPES)],
          client: {
            label: navigator.userAgent.includes("Mobile")
              ? "Lightcode mobile web"
              : "Lightcode web app",
            deviceType: navigator.userAgent.includes("Mobile") ? "mobile" : "browser",
            os: navigator.userAgent,
          },
        },
      }),
    );
  }

  async snapshot(): Promise<RemoteShellSnapshot> {
    return remoteShellSnapshotSchema.parse(await this.requestJson("/api/snapshot"));
  }

  async agentStatuses(): Promise<RemoteAgentStatuses> {
    return remoteAgentStatusesSchema.parse(await this.requestJson("/api/agent-statuses"));
  }

  /** Provider usage snapshots; the response shape is a typed contract with no
   * runtime schema (see `ProviderUsageResponse`), so a light shape check only. */
  async providerUsage(): Promise<ProviderUsageResponse> {
    const result = z
      .object({ snapshots: z.array(z.unknown()), fromCache: z.boolean() })
      .parse(await this.requestJson("/api/provider-usage"));
    return result as ProviderUsageResponse;
  }

  /** Remote-editable desktop settings (the AI helpers). */
  async settings(): Promise<RemoteSettings> {
    const result = z
      .object({ settings: remoteSettingsSchema })
      .parse(await this.requestJson("/api/settings"));
    return result.settings;
  }

  async updateSettings(patch: RemoteSettingsPatch): Promise<RemoteSettings> {
    const result = z
      .object({ settings: remoteSettingsSchema })
      .parse(await this.requestJson("/api/settings", { method: "POST", body: patch }));
    return result.settings;
  }

  async browserState(): Promise<RemoteBrowserState> {
    const result = z
      .object({ state: remoteBrowserStateSchema })
      .parse(await this.requestJson("/api/browser/state"));
    return result.state;
  }

  /** Tab mutation (create/close/activate/navigate/…); returns the new state. */
  async browserCommand(command: RemoteBrowserCommand): Promise<RemoteBrowserState> {
    const result = z
      .object({ state: remoteBrowserStateSchema })
      .parse(await this.requestJson("/api/browser/command", { method: "POST", body: command }));
    return result.state;
  }

  async threadHistory(threadId: string): Promise<RemoteThreadSnapshot> {
    return remoteThreadSnapshotSchema.parse(
      await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/history`),
    );
  }

  async startThread(input: StartRemoteThreadInput): Promise<StartThreadResult> {
    const result = await this.requestJson("/api/threads/start", {
      method: "POST",
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
    const parsed = z.object({ threadId: z.string() }).safeParse(result);
    if (!parsed.success) {
      throw new RemoteClientError(
        "Desktop returned an invalid thread response.",
        500,
        "bad_result",
      );
    }
    return parsed.data;
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

  async closeThread(threadId: string): Promise<void> {
    await this.requestJson(`/api/threads/${encodeURIComponent(threadId)}/close`, {
      method: "POST",
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
   * git-review components and the mobile file tree call bridge methods, which
   * the remote bridge shim forwards here (see bridge.ts). `procedure` is one of
   * the allowlisted names in GIT_REMOTE_PROCEDURE_SCOPES; the server validates
   * it.
   */
  async gitCall(procedure: string, payload: unknown): Promise<unknown> {
    const result = (await this.requestJson("/api/git/call", {
      method: "POST",
      body: { procedure, payload },
    })) as { result: unknown };
    return result.result;
  }

  async websocketTicket(): Promise<string> {
    const result = remoteWebSocketTicketResultSchema.parse(
      await this.requestJson("/api/auth/websocket-ticket", { method: "POST" }),
    );
    return result.ticket;
  }

  websocketUrl(ticket: string, lastSeenSeq: number): string {
    const url = toWebSocketUrl(new URL("/ws", this.endpoint));
    url.searchParams.set("ticket", ticket);
    if (lastSeenSeq > 0) {
      url.searchParams.set("lastSeenSeq", String(lastSeenSeq));
    }
    return url.toString();
  }

  parseSocketMessage(value: string): RemoteWebSocketServerMessage {
    return remoteWebSocketServerMessageSchema.parse(JSON.parse(value) as unknown);
  }

  private async requestJson(
    path: string,
    init: {
      readonly method?: "GET" | "POST";
      readonly body?: unknown;
    } = {},
  ): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (this.accessToken) {
      headers.authorization = `Bearer ${this.accessToken}`;
    }
    const response = await fetch(new URL(path, this.endpoint), {
      method: init.method ?? "GET",
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const text = await response.text();
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
  }
}
