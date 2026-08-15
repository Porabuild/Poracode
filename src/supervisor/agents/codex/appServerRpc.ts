import { randomUUID } from "node:crypto";
import type { RuntimeEvent, ThreadServerRequestId } from "@/shared/contracts";
import { mapCodexServerRequest, translateCodexCanonicalResponse } from "./canonicalMapping";
import { parseCodexSocketMessage } from "./acpProtocol";
import { buildCodexQuestionAnswerEvents } from "./acpQuestionAnswer";
import type { CodexClientRequestMap } from "./protocol";
import type { CodexStdioTransport } from "./stdioTransport";

export type CodexRpcDebugDirection = "codex->poracode" | "poracode->codex" | "transport";

export type CodexAppServerRpcTransport = Pick<
  CodexStdioTransport,
  "setListener" | "write" | "dispose" | "formatOutput"
>;

export interface CodexAppServerRpcListener {
  onNotification(method: string, params: Record<string, unknown> | undefined): void;
  onRuntimeEvents(events: RuntimeEvent[]): void;
  onClose(): void;
  onError(error: Error): void;
  onDebug?(direction: CodexRpcDebugDirection, payload: unknown): void;
}

interface RpcChannel {
  localThreadId: string;
  listener: CodexAppServerRpcListener | undefined;
  remoteThreadIds: Set<string>;
}

type PendingRequest = {
  channelId: string;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
};

type InboundRequest = {
  channelId: string;
  id: string | number;
  method: string;
  params: Record<string, unknown> | undefined;
};

const SERVER_OVERLOADED_ERROR_CODE = -32001;
const REQUEST_CANCELLED_ERROR_CODE = -32800;
const INVALID_REQUEST_ERROR_CODE = -32600;
const MAX_OVERLOAD_RETRIES = 2;
const MAX_BUFFERED_THREAD_NOTIFICATIONS = 100;

export class CodexRpcResponseError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
  ) {
    super(message);
  }
}

export function isUnsupportedCodexRequestError(error: unknown): boolean {
  return (
    error instanceof CodexRpcResponseError &&
    (error.code === -32601 ||
      (error.code === -32602 && /unknown (?:field|parameter)/iu.test(error.message)))
  );
}

/**
 * `turn/steer` rejects with an invalid-request error when the expected turn
 * already completed, no turn is active, or the active turn kind is not
 * steerable (review / manual compaction). All of those are recoverable by
 * delivering the message through a fresh `turn/start`.
 */
export function isCodexSteerRejectedError(error: unknown): boolean {
  return (
    error instanceof CodexRpcResponseError &&
    (error.code === INVALID_REQUEST_ERROR_CODE || isUnsupportedCodexRequestError(error))
  );
}

function readMessageThreadId(params: Record<string, unknown> | undefined): string | undefined {
  if (typeof params?.threadId === "string") {
    return params.threadId;
  }
  if (typeof params?.conversationId === "string") {
    return params.conversationId;
  }
  const thread =
    params && typeof params.thread === "object" && params.thread !== null
      ? (params.thread as Record<string, unknown>)
      : undefined;
  if (typeof thread?.id === "string") {
    return thread.id;
  }
  const turn =
    params && typeof params.turn === "object" && params.turn !== null
      ? (params.turn as Record<string, unknown>)
      : undefined;
  return typeof turn?.threadId === "string" ? turn.threadId : undefined;
}

function readStartedParentThreadId(
  method: string,
  params: Record<string, unknown> | undefined,
): string | undefined {
  if (method !== "thread/started" || !params || typeof params.thread !== "object") {
    return undefined;
  }
  const thread = params.thread as Record<string, unknown>;
  return typeof thread.parentThreadId === "string" ? thread.parentThreadId : undefined;
}

function shouldBufferUntilThreadClaim(method: string): boolean {
  return (
    method === "thread/started" ||
    method === "thread/status/changed" ||
    method === "thread/settings/updated"
  );
}

/** Owns one app-server transport and multiplexes it across Poracode thread sessions. */
export class CodexAppServerConnection {
  private requestSequence = 0;
  private readonly channels = new Map<string, RpcChannel>();
  private readonly remoteThreadChannels = new Map<string, string>();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly inboundRequests = new Map<string, InboundRequest>();
  private readonly bufferedThreadNotifications = new Map<
    string,
    Array<{ method: string; params: Record<string, unknown> | undefined }>
  >();
  private initializePromise: Promise<unknown> | undefined;
  private initializedNotified = false;
  private disposed = false;

  constructor(private readonly transport: CodexAppServerRpcTransport) {
    this.transport.setListener({
      onMessage: (payload) => this.handleMessage(payload),
      onClose: () => this.handleClose(),
      onError: (error) => this.handleError(error),
    });
  }

  registerChannel(channelId: string, localThreadId: string): void {
    this.channels.set(channelId, {
      localThreadId,
      listener: undefined,
      remoteThreadIds: new Set(),
    });
  }

  setChannelListener(channelId: string, listener: CodexAppServerRpcListener): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.listener = listener;
    }
  }

  claimThread(channelId: string, remoteThreadId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;

    for (const claimedId of channel.remoteThreadIds) {
      if (this.remoteThreadChannels.get(claimedId) === channelId) {
        this.remoteThreadChannels.delete(claimedId);
      }
    }
    channel.remoteThreadIds.clear();
    this.bindRemoteThread(channelId, remoteThreadId);

    const buffered = this.bufferedThreadNotifications.get(remoteThreadId);
    this.bufferedThreadNotifications.delete(remoteThreadId);
    if (buffered) {
      for (const notification of buffered) {
        channel.listener?.onNotification(notification.method, notification.params);
      }
    }
  }

  ownsThread(channelId: string, remoteThreadId: string): boolean {
    return this.remoteThreadChannels.get(remoteThreadId) === channelId;
  }

  request(channelId: string, method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (method !== "initialize") {
      return this.requestWithRetry(channelId, method, params, timeoutMs);
    }
    this.initializePromise ??= this.requestWithRetry(channelId, method, params, timeoutMs).catch(
      (error: unknown) => {
        this.initializePromise = undefined;
        throw error;
      },
    );
    return this.initializePromise;
  }

  notify(channelId: string, method: string): void {
    if (method === "initialized") {
      if (this.initializedNotified) return;
      this.initializedNotified = true;
    }
    this.write(channelId, { method });
  }

  resolveServerRequest(
    channelId: string,
    requestId: ThreadServerRequestId,
    response: unknown,
  ): void {
    const inbound = this.inboundRequests.get(String(requestId));
    if (inbound && inbound.channelId !== channelId) {
      return;
    }
    this.inboundRequests.delete(String(requestId));
    const result = inbound
      ? translateCodexCanonicalResponse(inbound.method, inbound.params, response)
      : response;
    this.write(channelId, {
      id: inbound?.id ?? requestId,
      result,
    });
    if (inbound?.method === "item/tool/requestUserInput") {
      const channel = this.channels.get(channelId);
      if (channel) {
        channel.listener?.onRuntimeEvents(
          buildCodexQuestionAnswerEvents({
            threadId: channel.localThreadId,
            params: inbound.params,
            response,
          }),
        );
      }
    }
  }

  unregisterChannel(channelId: string, error: Error): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      for (const remoteThreadId of channel.remoteThreadIds) {
        if (this.remoteThreadChannels.get(remoteThreadId) === channelId) {
          this.remoteThreadChannels.delete(remoteThreadId);
        }
      }
      this.channels.delete(channelId);
    }
    for (const [id, pending] of this.pendingRequests) {
      if (pending.channelId !== channelId) continue;
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
    for (const [id, inbound] of this.inboundRequests) {
      if (inbound.channelId === channelId) {
        this.inboundRequests.delete(id);
        try {
          this.transport.write({
            id: inbound.id,
            error: {
              code: REQUEST_CANCELLED_ERROR_CODE,
              message: "Request cancelled because the Poracode thread closed.",
            },
          });
        } catch {
          // The shared process may have exited while this thread was closing.
        }
      }
    }
  }

  dispose(error: Error): void {
    if (this.disposed) return;
    this.disposed = true;
    this.transport.dispose();
    this.rejectPendingRequests(error);
    this.channels.clear();
    this.remoteThreadChannels.clear();
    this.inboundRequests.clear();
    this.bufferedThreadNotifications.clear();
  }

  private async requestWithRetry(
    channelId: string,
    method: string,
    params: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.requestOnce(channelId, method, params, timeoutMs);
      } catch (error) {
        if (
          !(error instanceof CodexRpcResponseError) ||
          error.code !== SERVER_OVERLOADED_ERROR_CODE ||
          attempt >= MAX_OVERLOAD_RETRIES
        ) {
          throw error;
        }
        const baseDelayMs = 100 * 2 ** attempt;
        const jitteredDelayMs = Math.round(baseDelayMs * (0.5 + Math.random()));
        await new Promise((resolve) => setTimeout(resolve, jitteredDelayMs));
      }
    }
  }

  private requestOnce(
    channelId: string,
    method: string,
    params: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    const id = `poracode-${this.requestSequence++}`;
    const pending = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timed out waiting for Codex app-server response to ${method}.`));
      }, timeoutMs);
      this.pendingRequests.set(id, { channelId, resolve, reject, timeout });
    });

    try {
      this.write(channelId, { id, method, params });
    } catch (error) {
      const request = this.pendingRequests.get(id);
      if (request) {
        clearTimeout(request.timeout);
        this.pendingRequests.delete(id);
        request.reject(error);
      }
    }
    return pending;
  }

  private handleMessage(payload: unknown): void {
    const message = parseCodexSocketMessage(payload);

    if (message.kind === "response") {
      const pending = this.pendingRequests.get(message.id);
      if (!pending) return;
      this.debugChannel(pending.channelId, "codex->poracode", payload);
      this.pendingRequests.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error !== undefined) {
        const error = message.error;
        const messageText =
          typeof error === "object" && error !== null && "message" in error
            ? String((error as Record<string, unknown>).message)
            : String(error);
        const code =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof (error as Record<string, unknown>).code === "number"
            ? ((error as Record<string, unknown>).code as number)
            : undefined;
        pending.reject(new CodexRpcResponseError(messageText, code));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.kind === "request") {
      if (message.method === "currentTime/read") {
        this.transport.write({
          id: message.id,
          result: { currentTimeAt: Math.floor(Date.now() / 1000) },
        });
        return;
      }
      this.handleInboundRequest(message.id, message.method, message.params);
      return;
    }

    if (message.kind === "notification") {
      this.handleNotification(message.method, message.params, payload);
    }
  }

  private handleInboundRequest(
    id: string | number,
    method: string,
    params: Record<string, unknown> | undefined,
  ): void {
    const threadId = readMessageThreadId(params);
    const channelId =
      (threadId ? this.remoteThreadChannels.get(threadId) : undefined) ??
      (this.channels.size === 1 ? this.channels.keys().next().value : undefined);
    const channel = channelId ? this.channels.get(channelId) : undefined;
    const canonical = channel
      ? mapCodexServerRequest(channel.localThreadId, String(id), method, params)
      : undefined;
    if (channelId && channel && canonical) {
      this.debugChannel(channelId, "codex->poracode", { id, method, params });
      this.inboundRequests.set(String(id), { channelId, id, method, params });
      channel.listener?.onRuntimeEvents([canonical]);
      return;
    }

    console.warn(
      `[codex] no canonical mapping or owning thread for app-server request method "${method}"; replying method not found.`,
    );
    this.transport.write({
      id,
      error: {
        code: -32601,
        message: `Unsupported Codex app-server request method "${method}".`,
      },
    });
  }

  private handleNotification(
    method: string,
    params: Record<string, unknown> | undefined,
    payload: unknown,
  ): void {
    const threadId = readMessageThreadId(params);
    if (!threadId) {
      for (const channel of this.channels.values()) {
        channel.listener?.onDebug?.("codex->poracode", payload);
        channel.listener?.onNotification(method, params);
      }
      return;
    }

    let channelId = this.remoteThreadChannels.get(threadId);
    if (!channelId) {
      const parentThreadId = readStartedParentThreadId(method, params);
      const parentChannelId = parentThreadId
        ? this.remoteThreadChannels.get(parentThreadId)
        : undefined;
      if (parentChannelId) {
        this.bindRemoteThread(parentChannelId, threadId);
        channelId = parentChannelId;
      }
    }

    if (channelId) {
      const channel = this.channels.get(channelId);
      channel?.listener?.onDebug?.("codex->poracode", payload);
      channel?.listener?.onNotification(method, params);
      return;
    }

    if (this.channels.size === 1) {
      const channel = this.channels.values().next().value;
      channel?.listener?.onDebug?.("codex->poracode", payload);
      channel?.listener?.onNotification(method, params);
      return;
    }

    if (shouldBufferUntilThreadClaim(method)) {
      const buffered = this.bufferedThreadNotifications.get(threadId) ?? [];
      if (buffered.length < MAX_BUFFERED_THREAD_NOTIFICATIONS) {
        buffered.push({ method, params });
        this.bufferedThreadNotifications.set(threadId, buffered);
      }
    }
    for (const channel of this.channels.values()) {
      if (channel.remoteThreadIds.size === 0) continue;
      channel.listener?.onDebug?.("codex->poracode", payload);
      channel.listener?.onNotification(method, params);
    }
  }

  private bindRemoteThread(channelId: string, remoteThreadId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    channel.remoteThreadIds.add(remoteThreadId);
    this.remoteThreadChannels.set(remoteThreadId, channelId);
  }

  private handleClose(): void {
    const output = this.transport.formatOutput();
    const error = new Error(`Codex app-server exited.${output}`);
    for (const channel of this.channels.values()) {
      channel.listener?.onDebug?.("transport", { event: "close", output });
      channel.listener?.onClose();
    }
    this.inboundRequests.clear();
    this.rejectPendingRequests(error);
  }

  private handleError(error: Error): void {
    for (const channel of this.channels.values()) {
      channel.listener?.onDebug?.("transport", { event: "error", message: error.message });
      channel.listener?.onError(error);
    }
    this.inboundRequests.clear();
    this.rejectPendingRequests(error);
  }

  private write(channelId: string, message: Record<string, unknown>): void {
    this.debugChannel(channelId, "poracode->codex", message);
    this.transport.write(message);
  }

  private debugChannel(
    channelId: string,
    direction: CodexRpcDebugDirection,
    payload: unknown,
  ): void {
    this.channels.get(channelId)?.listener?.onDebug?.(direction, payload);
  }

  private rejectPendingRequests(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}

/** Per-thread facade over a shared app-server connection. */
export class CodexAppServerRpc {
  private readonly connection: CodexAppServerConnection;
  private readonly ownsConnection: boolean;
  /**
   * Channel identity is per *session instance*, not per Poracode thread: a
   * force-stopped session is replaced by a new session for the same thread id
   * while its own `dispose()` is still draining. Keying channels by thread id
   * would let that late teardown unregister the replacement's channel and
   * reject its in-flight requests, leaving the thread stuck on "working" with
   * no notifications ever routed to it.
   */
  private readonly channelId: string;

  constructor(
    transportOrConnection: CodexAppServerRpcTransport | CodexAppServerConnection,
    private readonly localThreadId: string,
  ) {
    if (transportOrConnection instanceof CodexAppServerConnection) {
      this.ownsConnection = false;
      this.connection = transportOrConnection;
    } else {
      this.ownsConnection = true;
      this.connection = new CodexAppServerConnection(transportOrConnection);
    }
    this.channelId = `${this.localThreadId}#${randomUUID()}`;
    this.connection.registerChannel(this.channelId, this.localThreadId);
  }

  setListener(listener: CodexAppServerRpcListener): void {
    this.connection.setChannelListener(this.channelId, listener);
  }

  request<M extends keyof CodexClientRequestMap>(
    method: M,
    params: CodexClientRequestMap[M]["params"],
    timeoutMs = 30_000,
  ): Promise<CodexClientRequestMap[M]["result"]> {
    return this.connection.request(this.channelId, method, params, timeoutMs) as Promise<
      CodexClientRequestMap[M]["result"]
    >;
  }

  requestUnmapped(
    method: string,
    params: Record<string, unknown> | null,
    timeoutMs = 30_000,
  ): Promise<unknown> {
    return this.connection.request(this.channelId, method, params, timeoutMs);
  }

  notify(method: string): void {
    this.connection.notify(this.channelId, method);
  }

  claimThread(threadId: string): void {
    this.connection.claimThread(this.channelId, threadId);
  }

  ownsThread(threadId: string): boolean {
    return this.connection.ownsThread(this.channelId, threadId);
  }

  resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): void {
    this.connection.resolveServerRequest(this.channelId, requestId, response);
  }

  dispose(error: Error): void {
    if (this.ownsConnection) {
      this.connection.dispose(error);
      return;
    }
    this.connection.unregisterChannel(this.channelId, error);
  }
}
