import { msg as sharedMsg } from "@/shared/messages";
import { RemoteClientError } from "@/shared/remote/client";
import {
  REMOTE_HTTP_BRIDGE_METHODS,
  REMOTE_HTTP_BRIDGE_VERSION,
  REMOTE_HTTP_RESPONSE_CREDIT_BYTES,
  REMOTE_HTTP_UPLOAD_CHUNK_BYTES,
  REMOTE_HTTP_UPLOAD_CREDIT_BYTES,
  isHeaderBudgetWithinBounds,
  isRemoteHttpBridgePortDownstreamMessage,
  isRemoteHttpBridgePortEnvelope,
  type RemoteHttpBridgeCancelRequest,
  type RemoteHttpBridgeMethod,
  type RemoteHttpBridgeOpenRequest,
  type RemoteHttpBridgeOpenResult,
  type RemoteHttpBridgePortDownstreamMessage,
  type RemoteHttpBridgePortEnvelope,
} from "@/shared/remote/httpBridgeProtocol";
import { readBridge } from "@/renderer/bridge";

/**
 * Renderer half of the off-main remote HTTP bridge (V4 F8).
 *
 * Main admits the request and delivers one end of a per-request `MessagePort`
 * into the main world (through the preload's documented forwarding). This
 * module drives that port: it uploads the request body in bounded chunks,
 * grants response credit only as the consumer pulls, builds a real `Response`
 * from the port, and keeps cancellation alive until EOF/error/cancel. It never
 * falls back to a full-body main IPC request: a failed bridge request rejects,
 * and a later call starts a fresh attempt.
 */

export interface RemoteHttpBridgeClientPort {
  postMessage(message: unknown): void;
  close(): void;
  start(): void;
  setMessageListener(listener: (message: unknown) => void): void;
  setCloseListener(listener: () => void): void;
}

export interface RemoteHttpBridgeTransport {
  readonly version: number;
  openRemoteHttpBridge(request: RemoteHttpBridgeOpenRequest): Promise<RemoteHttpBridgeOpenResult>;
  cancelRemoteHttpBridge(request: RemoteHttpBridgeCancelRequest): Promise<void>;
}

export interface RemoteHttpBridgeFetchInit {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string | Uint8Array;
  readonly signal?: AbortSignal;
}

export type RemoteHttpBridgePortListener = (
  envelope: RemoteHttpBridgePortEnvelope,
  port: RemoteHttpBridgeClientPort,
) => void;

export interface RemoteHttpBridgeClientDeps {
  readonly transport: RemoteHttpBridgeTransport;
  readonly subscribePorts: (listener: RemoteHttpBridgePortListener) => () => void;
  readonly randomUuid?: () => string;
}

interface HeadFrame {
  readonly status: number;
  readonly statusText: string;
  readonly headers: ReadonlyArray<readonly [string, string]>;
}

class PendingBridgeRequest {
  readonly requestId: string;
  generation: number | null = null;
  port: RemoteHttpBridgeClientPort | null = null;
  started = false;
  settled = false;
  aborted = false;
  body: Uint8Array | undefined;
  head: HeadFrame | null = null;
  controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  creditOutstanding = 0;
  consumerCancelled = false;
  terminalError: Error | null = null;
  bodyEnded = false;
  pendingChunks: Uint8Array[] = [];
  private uploadOffset = 0;
  private uploadCredit = 0;
  private uploadEnded = false;
  private uploadPumping = false;
  private readonly headResolvers = Promise.withResolvers<HeadFrame>();
  private signal: AbortSignal | undefined;
  private abortListener: (() => void) | null = null;

  constructor(requestId: string) {
    this.requestId = requestId;
    // The head promise is only awaited on the success path; an abort/error
    // before then must not surface as an unhandled rejection.
    this.headResolvers.promise.catch(() => undefined);
  }

  awaitHead(): Promise<HeadFrame> {
    return this.headResolvers.promise;
  }

  resolveHead(head: HeadFrame): void {
    this.headResolvers.resolve(head);
  }

  rejectHead(error: Error): void {
    this.headResolvers.reject(error);
  }

  attachSignal(signal: AbortSignal | undefined, listener: () => void): void {
    if (!signal) return;
    this.signal = signal;
    this.abortListener = listener;
    signal.addEventListener("abort", listener, { once: true });
  }

  removeSignal(): void {
    if (this.signal && this.abortListener) {
      this.signal.removeEventListener("abort", this.abortListener);
    }
    this.signal = undefined;
    this.abortListener = null;
  }

  /**
   * Called once both the port and the generation are known. The utility grants
   * an upload window only after it reserved the declared length; until that
   * grant arrives no payload byte is posted, so an over-budget request can
   * never clone its body into the port.
   */
  maybeStart(): void {
    if (this.started || this.settled || !this.port || this.generation === null) return;
    this.started = true;
    const body = this.body;
    if (body === undefined) return;
    if (body.byteLength === 0) {
      this.postUploadEnd();
    }
  }

  /** Accept one utility upload window; the pump sends only what it covers. */
  grantUpload(bytes: number): void {
    if (this.settled || this.uploadEnded) return;
    const body = this.body;
    if (!body || this.uploadOffset >= body.byteLength) return;
    // Clamp: a malformed or buggy grant must not grow the in-transit window.
    this.uploadCredit = Math.min(this.uploadCredit + bytes, REMOTE_HTTP_UPLOAD_CREDIT_BYTES);
    void this.pumpUpload();
  }

  private async pumpUpload(): Promise<void> {
    if (this.uploadPumping) return;
    const body = this.body;
    if (!body || !this.port) return;
    this.uploadPumping = true;
    try {
      while (!this.settled && !this.uploadEnded) {
        const remaining = body.byteLength - this.uploadOffset;
        if (remaining === 0) {
          this.postUploadEnd();
          return;
        }
        if (this.uploadCredit <= 0) return;
        const size = Math.min(this.uploadCredit, remaining, REMOTE_HTTP_UPLOAD_CHUNK_BYTES);
        const start = this.uploadOffset;
        this.port.postMessage({
          v: REMOTE_HTTP_BRIDGE_VERSION,
          kind: "upload-chunk",
          requestId: this.requestId,
          // Own exactly the chunk: structured clone serializes a subarray
          // view together with its whole backing store, so posting a view
          // would clone the caller's full body on every chunk. No transfer
          // list is used because Electron's MessagePortMain accepts ports only.
          data: exactUploadChunk(body, start, size),
        });
        this.uploadOffset += size;
        this.uploadCredit -= size;
        // Yield between quanta so a large grant is still delivered as small
        // bounded messages instead of one synchronous full-body loop.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    } catch {
      // The port close event settles the request.
    } finally {
      this.uploadPumping = false;
    }
  }

  private postUploadEnd(): void {
    if (this.uploadEnded || this.settled || !this.port) return;
    this.uploadEnded = true;
    try {
      this.port.postMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "upload-end",
        requestId: this.requestId,
      });
    } catch {
      // The port close event settles the request.
    }
  }
}

function cancelledError(): DOMException {
  return new DOMException("The remote request was cancelled.", "AbortError");
}

function unreachableError(cause: unknown): RemoteClientError {
  return new RemoteClientError(sharedMsg("remote.server.unreachable"), 0, "network", { cause });
}

function normalizeMethod(method: string | undefined): RemoteHttpBridgeMethod {
  const normalized = (method ?? "GET").toUpperCase();
  if ((REMOTE_HTTP_BRIDGE_METHODS as readonly string[]).includes(normalized)) {
    return normalized as RemoteHttpBridgeMethod;
  }
  throw new Error(`Unsupported remote HTTP method: ${normalized}`);
}

function normalizeBody(body: string | Uint8Array | undefined): Uint8Array | undefined {
  if (body === undefined) return undefined;
  return typeof body === "string" ? new TextEncoder().encode(body) : body;
}

function safeClose(port: RemoteHttpBridgeClientPort): void {
  try {
    port.close();
  } catch {
    // Already closed.
  }
}

/**
 * Return an exact-length byte range so a structured clone carries exactly this
 * chunk and never the caller's larger backing store. A subarray view clones
 * together with its entire buffer (V8 preserves the backing size), which would
 * make every 1 MiB upload frame clone the whole body; an exact whole-body view
 * is already owned, so only partial ranges need a copy.
 */
function exactUploadChunk(body: Uint8Array, offset: number, length: number): Uint8Array {
  if (
    offset === 0 &&
    length === body.byteLength &&
    body.byteOffset === 0 &&
    body.buffer instanceof ArrayBuffer &&
    body.buffer.byteLength === body.byteLength
  ) {
    return body;
  }
  return body.slice(offset, offset + length);
}

export class RemoteHttpBridgeClient {
  private readonly deps: RemoteHttpBridgeClientDeps;
  private readonly pending = new Map<string, PendingBridgeRequest>();
  private portSubscription: (() => void) | null = null;
  private readonly randomUuid: () => string;

  constructor(deps: RemoteHttpBridgeClientDeps) {
    this.deps = deps;
    this.randomUuid = deps.randomUuid ?? (() => crypto.randomUUID());
  }

  async fetch(url: string, init?: RemoteHttpBridgeFetchInit): Promise<Response> {
    this.ensureSubscribed();
    const signal = init?.signal;
    if (signal?.aborted) throw cancelledError();
    const method = normalizeMethod(init?.method);
    const body = normalizeBody(init?.body);
    const headers = init?.headers ?? {};
    if (!isHeaderBudgetWithinBounds(headers)) {
      throw unreachableError(new Error("Remote request header budget exceeded."));
    }
    const requestId = this.randomUuid();
    const entry = new PendingBridgeRequest(requestId);
    entry.body = body;
    this.pending.set(requestId, entry);
    // Abort must reject immediately even while the admission invoke is in
    // flight; a late port for an aborted request is closed on arrival.
    const aborted = Promise.withResolvers<never>();
    aborted.promise.catch(() => undefined);
    entry.attachSignal(signal, () => {
      this.abortEntry(entry);
      aborted.reject(cancelledError());
    });

    let opened: RemoteHttpBridgeOpenResult;
    try {
      opened = await Promise.race([
        this.deps.transport.openRemoteHttpBridge({
          requestId,
          url,
          method,
          headers,
          hasBody: body !== undefined,
          bodyBytes: body?.byteLength ?? 0,
        }),
        aborted.promise,
      ]);
    } catch (error) {
      this.pending.delete(requestId);
      entry.removeSignal();
      if (signal?.aborted) throw cancelledError();
      throw unreachableError(error);
    }

    if (entry.aborted || signal?.aborted) {
      this.cancelEntry(entry);
      throw cancelledError();
    }
    this.acceptGeneration(entry, opened.generation);
    entry.maybeStart();
    const head = await entry.awaitHead();
    if (entry.terminalError) throw entry.terminalError;
    const nullBody =
      method === "HEAD" ||
      head.status < 200 ||
      head.status === 204 ||
      head.status === 205 ||
      head.status === 304;
    if (nullBody) {
      return new Response(null, {
        status: head.status,
        statusText: head.statusText,
        headers: head.headers as [string, string][],
      });
    }
    return new Response(this.createBodyStream(entry), {
      status: head.status,
      statusText: head.statusText,
      headers: head.headers as [string, string][],
    });
  }

  private ensureSubscribed(): void {
    if (this.portSubscription) return;
    this.portSubscription = this.deps.subscribePorts((envelope, port) =>
      this.acceptPort(envelope, port),
    );
  }

  private acceptPort(
    envelope: RemoteHttpBridgePortEnvelope,
    port: RemoteHttpBridgeClientPort,
  ): void {
    const entry = this.pending.get(envelope.requestId);
    if (!entry || entry.settled || entry.port) {
      safeClose(port);
      return;
    }
    if (entry.generation !== null && entry.generation !== envelope.generation) {
      safeClose(port);
      this.finalize(entry, unreachableError(new Error("Remote HTTP bridge generation mismatch.")));
      return;
    }
    entry.port = port;
    entry.generation = envelope.generation;
    port.setMessageListener((message) => this.handlePortMessage(entry, message));
    port.setCloseListener(() => this.handlePortClose(entry));
    try {
      port.start();
    } catch {
      // The close event settles the request if the port is unusable.
    }
    entry.maybeStart();
  }

  private acceptGeneration(entry: PendingBridgeRequest, generation: number): void {
    if (entry.generation !== null && entry.generation !== generation) {
      this.finalize(entry, unreachableError(new Error("Remote HTTP bridge generation mismatch.")));
      return;
    }
    entry.generation = generation;
  }

  private handlePortMessage(entry: PendingBridgeRequest, message: unknown): void {
    if (entry.settled) return;
    if (!isRemoteHttpBridgePortDownstreamMessage(message)) {
      // The port is per-request: a frame that fails validation cannot be
      // fenced by requestid/generation, so it must fail this active request
      // promptly instead of leaving it to the 60 s whole-request deadline.
      this.finalize(
        entry,
        unreachableError(new Error("The remote HTTP bridge sent a malformed frame.")),
      );
      return;
    }
    if (message.requestId !== entry.requestId) return;
    // Fence every frame to the generation main minted for this request; a
    // stale frame must not reach a live consumer.
    if (entry.generation === null || message.generation !== entry.generation) return;
    switch (message.kind) {
      case "head": {
        if (entry.head || entry.settled) return;
        entry.head = message;
        entry.resolveHead(message);
        return;
      }
      case "upload-grant": {
        // Upload admission/window from the utility. No payload is posted
        // before the first grant arrives.
        entry.grantUpload(message.bytes);
        return;
      }
      case "chunk": {
        if (entry.settled) return;
        entry.creditOutstanding = Math.max(0, entry.creditOutstanding - message.data.byteLength);
        if (!entry.controller) {
          // Defensive: the utility only sends within granted credit, and credit
          // is granted from the stream's pull, so this should not happen. Buffer
          // rather than drop so a batched port delivery cannot lose bytes.
          entry.pendingChunks.push(message.data);
          return;
        }
        try {
          entry.controller.enqueue(message.data);
        } catch {
          // The consumer already errored/cancelled its stream.
        }
        return;
      }
      case "end": {
        this.finalize(entry, null);
        return;
      }
      case "error": {
        this.finalize(entry, this.mapBridgeError(message));
        return;
      }
    }
  }

  private handlePortClose(entry: PendingBridgeRequest): void {
    if (entry.settled) return;
    this.finalize(
      entry,
      entry.aborted
        ? cancelledError()
        : unreachableError(new Error("The remote HTTP bridge closed the request.")),
    );
  }

  private mapBridgeError(message: RemoteHttpBridgePortDownstreamMessage): Error {
    if (message.kind !== "error") return unreachableError(new Error("Remote request failed."));
    if (message.code === "cancelled") return cancelledError();
    return unreachableError(new Error(message.message));
  }

  private createBodyStream(entry: PendingBridgeRequest): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        entry.controller = controller;
        for (const chunk of entry.pendingChunks) controller.enqueue(chunk);
        entry.pendingChunks = [];
        if (entry.bodyEnded) controller.close();
      },
      pull: () => {
        if (entry.settled || !entry.port) return;
        // Credit only follows consumer capacity: a paused consumer stops
        // pulling, the utility stops sending, and other requests are unharmed.
        if (entry.creditOutstanding < REMOTE_HTTP_RESPONSE_CREDIT_BYTES) {
          const grant = REMOTE_HTTP_RESPONSE_CREDIT_BYTES - entry.creditOutstanding;
          entry.creditOutstanding += grant;
          try {
            entry.port.postMessage({
              v: REMOTE_HTTP_BRIDGE_VERSION,
              kind: "credit",
              requestId: entry.requestId,
              bytes: grant,
            });
          } catch {
            // The close event settles the request.
          }
        }
      },
      cancel: () => {
        entry.consumerCancelled = true;
        this.cancelEntry(entry);
        // A cancelled stream needs no controller close/error; just release the
        // transport and settle.
        this.finalize(entry, null, { skipController: true });
      },
    });
  }

  private abortEntry(entry: PendingBridgeRequest): void {
    if (entry.settled) return;
    entry.aborted = true;
    this.cancelEntry(entry);
    this.finalize(entry, cancelledError());
  }

  private cancelEntry(entry: PendingBridgeRequest): void {
    if (entry.settled) return;
    if (entry.port && entry.started) {
      try {
        entry.port.postMessage({
          v: REMOTE_HTTP_BRIDGE_VERSION,
          kind: "cancel",
          requestId: entry.requestId,
        });
      } catch {
        // Port already gone.
      }
    }
    // Main-side fallback covers the window before the port attached; it is
    // idempotent and ignored for already-settled ids.
    void this.deps.transport
      .cancelRemoteHttpBridge({ requestId: entry.requestId })
      .catch(() => undefined);
  }

  private finalize(
    entry: PendingBridgeRequest,
    error: Error | null,
    options: { readonly skipController?: boolean } = {},
  ): void {
    if (entry.settled) return;
    entry.settled = true;
    entry.terminalError = error;
    this.pending.delete(entry.requestId);
    entry.removeSignal();
    if (!options.skipController) {
      if (error) {
        if (entry.controller) {
          try {
            entry.controller.error(error);
          } catch {
            // Controller already closed/cancelled.
          }
        } else {
          entry.rejectHead(error);
        }
      } else {
        if (entry.controller) {
          try {
            entry.controller.close();
          } catch {
            // Controller already closed/cancelled.
          }
        } else {
          entry.bodyEnded = true;
        }
      }
    }
    if (entry.port) safeClose(entry.port);
  }
}

/** Create a client over injected transport/port delivery (tests use this). */
export function createRemoteHttpBridgeClient(
  deps: RemoteHttpBridgeClientDeps,
): RemoteHttpBridgeClient {
  return new RemoteHttpBridgeClient(deps);
}

let defaultClient: RemoteHttpBridgeClient | null = null;
let defaultPortListeners: Set<RemoteHttpBridgePortListener> | null = null;
let defaultPortWindowListenerInstalled = false;

function subscribeWindowPorts(listener: RemoteHttpBridgePortListener): () => void {
  defaultPortListeners ??= new Set();
  defaultPortListeners.add(listener);
  if (!defaultPortWindowListenerInstalled && typeof window !== "undefined") {
    defaultPortWindowListenerInstalled = true;
    window.addEventListener("message", (event: MessageEvent) => {
      if (event.source !== window) return;
      const data: unknown = event.data;
      if (!isRemoteHttpBridgePortEnvelope(data)) return;
      const port = event.ports[0];
      if (!port) return;
      const adapter = createDomPortAdapter(port);
      for (const current of [...(defaultPortListeners ?? [])]) current(data, adapter);
    });
  }
  return () => {
    defaultPortListeners?.delete(listener);
  };
}

function createDomPortAdapter(port: MessagePort): RemoteHttpBridgeClientPort {
  return {
    postMessage: (message) => port.postMessage(message),
    close: () => port.close(),
    start: () => port.start(),
    setMessageListener: (listener) => {
      port.onmessage = (event) => listener(event.data);
    },
    setCloseListener: (listener) => {
      (port as MessagePort & { onclose?: (() => void) | null }).onclose = listener;
    },
  };
}

function resolveDefaultTransport(): RemoteHttpBridgeTransport {
  const bridge = readBridge();
  const version = bridge.remoteHttpBridgeVersion;
  const open = bridge.openRemoteHttpBridge;
  const cancel = bridge.cancelRemoteHttpBridge;
  if (
    version !== REMOTE_HTTP_BRIDGE_VERSION ||
    typeof open !== "function" ||
    typeof cancel !== "function"
  ) {
    throw new Error(
      "The off-main remote HTTP bridge is unavailable in this renderer (facade mismatch).",
    );
  }
  return {
    version,
    openRemoteHttpBridge: (request) => open.call(bridge, request),
    cancelRemoteHttpBridge: (request) => cancel.call(bridge, request),
  };
}

/** Production entry: fetch through the Electron off-main bridge. */
export function remoteHttpBridgeFetch(
  url: string,
  init?: RemoteHttpBridgeFetchInit,
): Promise<Response> {
  defaultClient ??= new RemoteHttpBridgeClient({
    transport: resolveDefaultTransport(),
    subscribePorts: subscribeWindowPorts,
  });
  return defaultClient.fetch(url, init);
}

/** Test seam: drop the process-wide client and window listener state. */
export function resetRemoteHttpBridgeClientForTest(): void {
  defaultClient = null;
  defaultPortListeners = null;
  defaultPortWindowListenerInstalled = false;
}
