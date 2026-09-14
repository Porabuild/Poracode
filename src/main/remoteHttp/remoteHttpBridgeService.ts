import {
  REMOTE_HTTP_BRIDGE_PORT_LINGER_MS,
  REMOTE_HTTP_BRIDGE_VERSION,
  REMOTE_HTTP_MAX_ACTIVE_REQUESTS,
  REMOTE_HTTP_MAX_ACTIVE_REQUESTS_PER_WINDOW,
  REMOTE_HTTP_MAX_ERROR_MESSAGE_LENGTH,
  REMOTE_HTTP_MAX_REQUEST_BODY_BYTES,
  REMOTE_HTTP_MAX_RESPONSE_BODY_BYTES,
  REMOTE_HTTP_REQUEST_TIMEOUT_MS,
  REMOTE_HTTP_RESPONSE_CREDIT_BYTES,
  REMOTE_HTTP_UPLOAD_CREDIT_BYTES,
  REMOTE_HTTP_UPLOAD_RETENTION_BUDGET_BYTES,
  isRemoteHttpBridgeOpenDescriptor,
  isRemoteHttpBridgePortDownstreamMessage,
  isRemoteHttpBridgePortUpstreamMessage,
  type RemoteHttpBridgeErrorCode,
  type RemoteHttpBridgeOpenDescriptor,
  type RemoteHttpBridgeOutcome,
  type RemoteHttpBridgePortDownstreamMessage,
  type RemoteHttpBridgeSettledMessage,
  type RemoteHttpBridgeStats,
} from "@/shared/remote/httpBridgeProtocol";

/**
 * Narrow port surface the bridge engine consumes. The utility host adapts
 * `MessagePortMain` to this; tests drive it with an in-process pair.
 */
export interface RemoteHttpBridgeWorkerPort {
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
  onMessage(listener: (message: unknown) => void): void;
  onClose(listener: () => void): void;
}

export type RemoteHttpBridgeLogEvent = Readonly<Record<string, string | number>>;

export interface RemoteHttpBridgeServiceOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxResponseBodyBytes?: number;
  readonly maxRequestBodyBytes?: number;
  readonly uploadRetentionBudgetBytes?: number;
  readonly maxActiveRequests?: number;
  readonly maxActiveRequestsPerWindow?: number;
  readonly portLingerMs?: number;
  readonly onSettled?: (message: RemoteHttpBridgeSettledMessage) => void;
  /** Env-gated, payload-free counter logging. Never includes URLs or headers. */
  readonly log?: (event: RemoteHttpBridgeLogEvent) => void;
}

type ActiveState = "collecting" | "dispatching" | "streaming" | "retired";

interface ActiveRequest {
  readonly descriptor: RemoteHttpBridgeOpenDescriptor;
  readonly port: RemoteHttpBridgeWorkerPort;
  readonly controller: AbortController;
  state: ActiveState;
  /**
   * Single retained body buffer, allocated to the admitted declared length on
   * the first upload chunk. It is also the fetch body (or a view of it) for
   * 307/308 replay, so the utility holds one copy rather than a chunk list
   * plus a concatenated duplicate.
   */
  body: Uint8Array | null;
  uploadBytes: number;
  /** Declared bytes not received yet; `reservedBytes + uploadBytes === accountedBytes`. */
  reservedBytes: number;
  /** Total bytes this request holds against the aggregate upload budget. */
  accountedBytes: number;
  credit: number;
  creditWaiters: Array<() => void>;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  deadline: ReturnType<typeof setTimeout> | null;
  linger: ReturnType<typeof setTimeout> | null;
  receivedBytes: number;
  sentBytes: number;
}

interface MutableCounters {
  openedRequests: number;
  completedRequests: number;
  failedRequests: number;
  cancelledRequests: number;
  timedOutRequests: number;
  rejectedRequests: number;
  protocolViolations: number;
  uploadedBytes: number;
  downloadedBytes: number;
}

function clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
  if (timer !== null) clearTimeout(timer);
}

function unrefTimer(timer: unknown): void {
  (timer as { unref?: () => void } | null)?.unref?.();
}

function boundedMessage(message: string): string {
  const clean = message.trim();
  if (clean.length === 0) return "Remote request failed.";
  return clean.length > REMOTE_HTTP_MAX_ERROR_MESSAGE_LENGTH
    ? clean.slice(0, REMOTE_HTTP_MAX_ERROR_MESSAGE_LENGTH)
    : clean;
}

/** Copy a bytes view so the posted message owns exactly the chunk it reports. */
function exactBytes(value: Uint8Array, offset: number, length: number): Uint8Array {
  if (
    offset === 0 &&
    length === value.byteLength &&
    value.byteOffset === 0 &&
    value.buffer instanceof ArrayBuffer &&
    value.buffer.byteLength === value.byteLength
  ) {
    return value;
  }
  const copy = new Uint8Array(length);
  copy.set(value.subarray(offset, offset + length));
  return copy;
}

/**
 * Production engine for one remote HTTP request. Owns the Node fetch, the
 * replayable upload retention, the credit-gated response pump, cancellation,
 * and the 60 s / 64 MiB limits. It never touches Electron and never hands body
 * bytes to main: all frames go to the per-request renderer port.
 */
export class RemoteHttpBridgeService {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxResponseBodyBytes: number;
  private readonly maxRequestBodyBytes: number;
  private readonly uploadRetentionBudgetBytes: number;
  private readonly maxActiveRequests: number;
  private readonly maxActiveRequestsPerWindow: number;
  private readonly portLingerMs: number;
  private readonly onSettled: ((message: RemoteHttpBridgeSettledMessage) => void) | undefined;
  private readonly log: ((event: RemoteHttpBridgeLogEvent) => void) | undefined;

  private readonly requests = new Map<string, ActiveRequest>();
  private readonly senderCounts = new Map<number, number>();
  private reservedUploadBytes = 0;
  private retainedUploadBytes = 0;
  private uploadAccountedBytes = 0;
  private peakRetainedUploadBytes = 0;
  private peakUploadAccountedBytes = 0;
  private readonly counters: MutableCounters = {
    openedRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    cancelledRequests: 0,
    timedOutRequests: 0,
    rejectedRequests: 0,
    protocolViolations: 0,
    uploadedBytes: 0,
    downloadedBytes: 0,
  };

  constructor(options: RemoteHttpBridgeServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? REMOTE_HTTP_REQUEST_TIMEOUT_MS;
    this.maxResponseBodyBytes = options.maxResponseBodyBytes ?? REMOTE_HTTP_MAX_RESPONSE_BODY_BYTES;
    this.maxRequestBodyBytes = options.maxRequestBodyBytes ?? REMOTE_HTTP_MAX_REQUEST_BODY_BYTES;
    this.uploadRetentionBudgetBytes =
      options.uploadRetentionBudgetBytes ?? REMOTE_HTTP_UPLOAD_RETENTION_BUDGET_BYTES;
    this.maxActiveRequests = options.maxActiveRequests ?? REMOTE_HTTP_MAX_ACTIVE_REQUESTS;
    this.maxActiveRequestsPerWindow =
      options.maxActiveRequestsPerWindow ?? REMOTE_HTTP_MAX_ACTIVE_REQUESTS_PER_WINDOW;
    this.portLingerMs = options.portLingerMs ?? REMOTE_HTTP_BRIDGE_PORT_LINGER_MS;
    this.onSettled = options.onSettled;
    this.log = options.log;
  }

  /**
   * Admit one request. `descriptor` is re-validated here (main validated it
   * too); `port` is the utility-side end of the per-request channel.
   */
  open(descriptor: unknown, port: RemoteHttpBridgeWorkerPort): void {
    if (!isRemoteHttpBridgeOpenDescriptor(descriptor)) {
      this.counters.protocolViolations += 1;
      this.safeClose(port);
      return;
    }
    if (this.requests.has(descriptor.requestId)) {
      // A duplicate descriptor cannot be attributed to a main-side reservation
      // distinct from the accepted request already using this UUID, so it must
      // never emit a settle notification: that could retire the accepted
      // request's main-side record. The accepted request's own terminal
      // notification remains the only release signal for this id.
      this.rejectOpen(
        descriptor,
        port,
        "protocol",
        "A remote request with this id is already active.",
        false,
      );
      return;
    }
    if (this.requests.size >= this.maxActiveRequests) {
      this.rejectOpen(descriptor, port, "overloaded", "Too many active remote requests.");
      return;
    }
    if ((this.senderCounts.get(descriptor.senderId) ?? 0) >= this.maxActiveRequestsPerWindow) {
      this.rejectOpen(
        descriptor,
        port,
        "overloaded",
        "Too many active remote requests for this window.",
      );
      return;
    }
    if (descriptor.bodyBytes > this.maxRequestBodyBytes) {
      this.rejectOpen(descriptor, port, "too-large", "request body too large");
      return;
    }
    // Upload admission reserve: the declared length is charged against the
    // aggregate account here, before the renderer may send the first byte and
    // before any body buffer exists. A request that cannot be admitted fails
    // with an explicit bounded error instead of growing the process.
    if (this.uploadAccountedBytes + descriptor.bodyBytes > this.uploadRetentionBudgetBytes) {
      this.rejectOpen(descriptor, port, "overloaded", "upload retention budget exceeded");
      return;
    }

    const request: ActiveRequest = {
      descriptor,
      port,
      controller: new AbortController(),
      state: "collecting",
      body: null,
      uploadBytes: 0,
      reservedBytes: descriptor.bodyBytes,
      accountedBytes: descriptor.bodyBytes,
      credit: 0,
      creditWaiters: [],
      reader: null,
      deadline: null,
      linger: null,
      receivedBytes: 0,
      sentBytes: 0,
    };
    this.requests.set(descriptor.requestId, request);
    this.senderCounts.set(
      descriptor.senderId,
      (this.senderCounts.get(descriptor.senderId) ?? 0) + 1,
    );
    this.counters.openedRequests += 1;
    if (descriptor.bodyBytes > 0) {
      this.reservedUploadBytes += descriptor.bodyBytes;
      this.uploadAccountedBytes += descriptor.bodyBytes;
      this.peakUploadAccountedBytes = Math.max(
        this.peakUploadAccountedBytes,
        this.uploadAccountedBytes,
      );
    }

    const deadline = setTimeout(() => {
      this.abortRequest(
        request,
        "timeout",
        `Remote request timed out after ${this.timeoutMs}ms.`,
        true,
      );
    }, this.timeoutMs);
    unrefTimer(deadline);
    request.deadline = deadline;

    port.onMessage((message) => this.handlePortMessage(request, message));
    port.onClose(() => {
      if (request.state !== "retired") {
        this.abortRequest(request, "cancelled", "Remote request cancelled.", false);
      }
    });
    port.start();

    if (!descriptor.hasBody || descriptor.bodyBytes === 0) {
      this.dispatch(request);
      return;
    }
    // Upload window: posted only after the reservation above succeeded, so the
    // renderer never sends a payload the utility has not admitted. The port
    // queues this frame until the renderer starts its end.
    this.postDownstream(port, {
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "upload-grant",
      requestId: descriptor.requestId,
      generation: descriptor.generation,
      bytes: Math.min(descriptor.bodyBytes, REMOTE_HTTP_UPLOAD_CREDIT_BYTES),
    });
  }

  /** Cancel every active request owned by one renderer window. */
  abortWindow(senderId: number): number {
    let aborted = 0;
    for (const request of [...this.requests.values()]) {
      if (request.descriptor.senderId !== senderId) continue;
      this.abortRequest(request, "cancelled", "Remote request cancelled.", true);
      aborted += 1;
    }
    return aborted;
  }

  abortAll(): void {
    for (const request of [...this.requests.values()]) {
      this.abortRequest(request, "cancelled", "Remote request cancelled.", true);
    }
  }

  /** Main-side cancel fallback (a renderer normally cancels over its port). */
  cancel(requestId: string, generation: number): void {
    const request = this.requests.get(requestId);
    if (!request) return;
    if (request.descriptor.generation !== generation) {
      this.counters.protocolViolations += 1;
      return;
    }
    this.abortRequest(request, "cancelled", "Remote request cancelled.", false);
  }

  stats(): RemoteHttpBridgeStats {
    return {
      activeRequests: this.requests.size,
      ...this.counters,
      retainedUploadBytes: this.retainedUploadBytes,
      peakRetainedUploadBytes: this.peakRetainedUploadBytes,
      reservedUploadBytes: this.reservedUploadBytes,
      uploadAccountedBytes: this.uploadAccountedBytes,
      peakUploadAccountedBytes: this.peakUploadAccountedBytes,
    };
  }

  private rejectOpen(
    descriptor: RemoteHttpBridgeOpenDescriptor,
    port: RemoteHttpBridgeWorkerPort,
    code: RemoteHttpBridgeErrorCode,
    message: string,
    notifyMain = true,
  ): void {
    this.counters.rejectedRequests += 1;
    this.postDownstream(port, {
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "error",
      requestId: descriptor.requestId,
      generation: descriptor.generation,
      code,
      message: boundedMessage(message),
    });
    port.start();
    this.logEvent({ event: "rejected", code });
    const linger = setTimeout(() => this.safeClose(port), this.portLingerMs);
    unrefTimer(linger);
    if (notifyMain) {
      // A valid descriptor that failed utility-side admission corresponds to a
      // main-side reservation: emitting the existing `settled` control frame
      // (no frame-shape change) releases that slot immediately instead of
      // leaving it to the 90 s safety timer. Rejections that cannot prove
      // identity (duplicate id, malformed descriptor) never notify.
      this.onSettled?.({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "settled",
        generation: descriptor.generation,
        requestId: descriptor.requestId,
        outcome: "failed",
        receivedBytes: 0,
        sentBytes: 0,
      });
    }
  }

  private handlePortMessage(request: ActiveRequest, message: unknown): void {
    if (request.state === "retired") return;
    if (!isRemoteHttpBridgePortUpstreamMessage(message)) {
      this.counters.protocolViolations += 1;
      return;
    }
    if (message.requestId !== request.descriptor.requestId) {
      // A per-request port can only carry its own request id; anything else is
      // a protocol violation and must not consume another request's credit.
      this.counters.protocolViolations += 1;
      return;
    }
    switch (message.kind) {
      case "upload-chunk": {
        if (request.state !== "collecting") {
          this.counters.protocolViolations += 1;
          return;
        }
        const chunkBytes = message.data.byteLength;
        // The declared length is the per-request bound enforced *after*
        // admission too: credit should keep a conforming renderer exact, and a
        // chunk beyond the declared body is a violation, not extra retention.
        if (request.uploadBytes + chunkBytes > request.descriptor.bodyBytes) {
          this.abortRequest(request, "too-large", "request body too large", true);
          return;
        }
        let body: Uint8Array;
        try {
          body = this.uploadBuffer(request);
        } catch {
          this.abortRequest(request, "network", "upload buffer allocation failed", true);
          return;
        }
        body.set(message.data, request.uploadBytes);
        request.uploadBytes += chunkBytes;
        request.reservedBytes -= chunkBytes;
        this.counters.uploadedBytes += chunkBytes;
        this.reservedUploadBytes -= chunkBytes;
        this.retainedUploadBytes += chunkBytes;
        this.peakRetainedUploadBytes = Math.max(
          this.peakRetainedUploadBytes,
          this.retainedUploadBytes,
        );
        // Grant accepted bytes back so the renderer's in-transit window stays
        // bounded; never grant past the declared length.
        const grant = Math.min(chunkBytes, request.descriptor.bodyBytes - request.uploadBytes);
        if (grant > 0) {
          this.postDownstream(request.port, {
            v: REMOTE_HTTP_BRIDGE_VERSION,
            kind: "upload-grant",
            requestId: request.descriptor.requestId,
            generation: request.descriptor.generation,
            bytes: grant,
          });
        }
        return;
      }
      case "upload-end": {
        if (request.state === "collecting") this.dispatch(request);
        return;
      }
      case "credit": {
        // Credit is accepted from dispatch onward so a renderer that grants it
        // immediately after the head frame can never race the state flip. The
        // accumulated window is clamped to the advertised per-request ceiling:
        // ordinary refills, a burst of valid grant frames, or a duplicate grant
        // can never add up to a full-body response burst beyond what one
        // consumer pull covers.
        if (request.state !== "streaming" && request.state !== "dispatching") return;
        request.credit = Math.min(
          request.credit + message.bytes,
          REMOTE_HTTP_RESPONSE_CREDIT_BYTES,
        );
        for (const waiter of request.creditWaiters.splice(0)) waiter();
        return;
      }
      case "cancel": {
        this.abortRequest(request, "cancelled", "Remote request cancelled.", false);
        return;
      }
    }
  }

  private dispatch(request: ActiveRequest): void {
    if (request.state !== "collecting") return;
    request.state = "dispatching";
    const body = request.descriptor.hasBody ? this.buildBody(request) : undefined;
    void this.runFetch(request, body);
  }

  /** Allocate the single retained body buffer at its admitted declared length. */
  private uploadBuffer(request: ActiveRequest): Uint8Array {
    request.body ??= new Uint8Array(request.descriptor.bodyBytes);
    return request.body;
  }

  private buildBody(request: ActiveRequest): Uint8Array {
    if (!request.body) return new Uint8Array(0);
    if (request.uploadBytes === request.body.byteLength) return request.body;
    return request.body.subarray(0, request.uploadBytes);
  }

  private async runFetch(request: ActiveRequest, body: Uint8Array | undefined): Promise<void> {
    try {
      const response = await this.fetchImpl(request.descriptor.url, {
        method: request.descriptor.method,
        headers: request.descriptor.headers,
        ...(body !== undefined ? { body: body as unknown as BodyInit } : {}),
        signal: request.controller.signal,
        redirect: "follow",
      });
      await this.pumpResponse(request, response);
    } catch (error) {
      if (this.isRetired(request)) return;
      const message =
        request.controller.signal.aborted && request.controller.signal.reason instanceof Error
          ? request.controller.signal.reason.message
          : error instanceof Error
            ? error.message
            : "Remote request failed.";
      this.abortRequest(request, "network", message, true);
    }
  }

  private async pumpResponse(request: ActiveRequest, response: Response): Promise<void> {
    const nullBody =
      request.descriptor.method === "HEAD" ||
      response.status < 200 ||
      response.status === 204 ||
      response.status === 205 ||
      response.status === 304 ||
      response.body === null;

    if (!nullBody && response.body) {
      const declared = response.headers.get("content-length");
      if (declared !== null) {
        const parsed = Number(declared);
        if (Number.isFinite(parsed) && parsed > this.maxResponseBodyBytes) {
          await response.body.cancel().catch(() => undefined);
          this.abortRequest(request, "too-large", "response body too large", true);
          return;
        }
      }
    }

    // The response metadata budget is separate from (and looser than) the
    // request budget, but it is still enforced *before* anything is posted:
    // a head frame the renderer's downstream validator would reject must
    // become an explicit bounded error instead of a silent 60 s stall.
    const head: RemoteHttpBridgePortDownstreamMessage = {
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "head",
      requestId: request.descriptor.requestId,
      generation: request.descriptor.generation,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers],
    };
    if (!isRemoteHttpBridgePortDownstreamMessage(head)) {
      await response.body?.cancel().catch(() => undefined);
      this.abortRequest(request, "too-large", "response metadata too large", true);
      return;
    }
    this.postDownstream(request.port, head);

    if (nullBody || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      this.complete(request);
      return;
    }

    const reader = response.body.getReader();
    request.reader = reader;
    request.state = "streaming";
    for (;;) {
      const { done, value } = await reader.read();
      if (this.isRetired(request)) {
        await reader.cancel().catch(() => undefined);
        return;
      }
      if (done) break;
      request.receivedBytes += value.byteLength;
      if (request.receivedBytes > this.maxResponseBodyBytes) {
        await reader.cancel().catch(() => undefined);
        this.abortRequest(request, "too-large", "response body too large", true);
        return;
      }
      let offset = 0;
      while (offset < value.byteLength) {
        const ready = await this.waitForCredit(request);
        if (!ready) return;
        const allowed = Math.min(request.credit, value.byteLength - offset);
        const data = exactBytes(value, offset, allowed);
        request.credit -= allowed;
        offset += allowed;
        request.sentBytes += allowed;
        this.postDownstream(request.port, {
          v: REMOTE_HTTP_BRIDGE_VERSION,
          kind: "chunk",
          requestId: request.descriptor.requestId,
          generation: request.descriptor.generation,
          data,
        });
      }
    }
    this.complete(request);
  }

  private isRetired(request: ActiveRequest): boolean {
    return request.state === "retired";
  }

  private waitForCredit(request: ActiveRequest): Promise<boolean> {
    if (request.state === "retired") return Promise.resolve(false);
    if (request.credit > 0) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      request.creditWaiters.push(() => resolve(request.state !== "retired" && request.credit > 0));
    });
  }

  private complete(request: ActiveRequest): void {
    if (request.state === "retired") return;
    this.counters.completedRequests += 1;
    this.counters.downloadedBytes += request.receivedBytes;
    this.postDownstream(request.port, {
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "end",
      requestId: request.descriptor.requestId,
      generation: request.descriptor.generation,
    });
    this.retire(request, "completed");
  }

  private abortRequest(
    request: ActiveRequest,
    code: RemoteHttpBridgeErrorCode,
    message: string,
    post: boolean,
  ): void {
    if (request.state === "retired") return;
    if (code === "cancelled") this.counters.cancelledRequests += 1;
    else if (code === "timeout") this.counters.timedOutRequests += 1;
    else this.counters.failedRequests += 1;
    if (post) {
      this.postDownstream(request.port, {
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "error",
        requestId: request.descriptor.requestId,
        generation: request.descriptor.generation,
        code,
        message: boundedMessage(message),
      });
    }
    this.retire(request, code === "cancelled" ? "cancelled" : "failed");
  }

  private retire(request: ActiveRequest, outcome: RemoteHttpBridgeOutcome): void {
    if (request.state === "retired") return;
    request.state = "retired";
    clearTimer(request.deadline);
    request.deadline = null;
    this.requests.delete(request.descriptor.requestId);
    const senderCount = (this.senderCounts.get(request.descriptor.senderId) ?? 1) - 1;
    if (senderCount <= 0) this.senderCounts.delete(request.descriptor.senderId);
    else this.senderCounts.set(request.descriptor.senderId, senderCount);
    if (request.reader) {
      void request.reader.cancel().catch(() => undefined);
    }
    if (!request.controller.signal.aborted) {
      request.controller.abort(new Error("Remote request settled."));
    }
    this.releaseUploadAccount(request);
    for (const waiter of request.creditWaiters.splice(0)) waiter();

    // The renderer closes the port on its terminal frame; this linger only
    // covers a renderer that never does (crash, stopped script). The close
    // event clears it in the normal path.
    const linger = setTimeout(() => this.safeClose(request.port), this.portLingerMs);
    unrefTimer(linger);
    request.linger = linger;

    this.onSettled?.({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "settled",
      generation: request.descriptor.generation,
      requestId: request.descriptor.requestId,
      outcome,
      receivedBytes: request.receivedBytes,
      sentBytes: request.sentBytes,
    });
    this.logEvent({
      event: "settled",
      outcome,
      receivedBytes: request.receivedBytes,
      sentBytes: request.sentBytes,
      activeRequests: this.requests.size,
      retainedUploadBytes: this.retainedUploadBytes,
    });
  }

  private releaseUploadAccount(request: ActiveRequest): void {
    if (request.accountedBytes === 0) return;
    this.uploadAccountedBytes = Math.max(0, this.uploadAccountedBytes - request.accountedBytes);
    this.reservedUploadBytes = Math.max(0, this.reservedUploadBytes - request.reservedBytes);
    this.retainedUploadBytes = Math.max(0, this.retainedUploadBytes - request.uploadBytes);
    request.accountedBytes = 0;
    request.reservedBytes = 0;
    request.uploadBytes = 0;
    request.body = null;
  }

  private postDownstream(
    port: RemoteHttpBridgeWorkerPort,
    message: RemoteHttpBridgePortDownstreamMessage,
  ): void {
    try {
      port.postMessage(message);
    } catch {
      // A dead port settles the request through its close event; nothing else
      // to do here.
    }
  }

  private safeClose(port: RemoteHttpBridgeWorkerPort): void {
    try {
      port.close();
    } catch {
      // Already closed.
    }
  }

  private logEvent(event: RemoteHttpBridgeLogEvent): void {
    this.log?.(event);
  }
}
