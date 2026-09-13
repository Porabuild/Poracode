import { randomUUID } from "node:crypto";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  type BackendHostOutboundMessage,
  type BackendHostRequest,
  type BackendNativeRequest,
} from "@/shared/backendHostProtocol";
import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";

/** Reverse IPC remains alive while admitted backend work drains. */
export class BackendNativeRequests {
  private readonly work = new AsyncWorkTracker();
  private readonly pending = new Map<
    string,
    {
      resolve(value: unknown): void;
      reject(reason: unknown): void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();
  private cancellation: Error | undefined;

  constructor(private readonly send: (message: BackendHostOutboundMessage) => void) {}

  request(request: BackendNativeRequest): Promise<unknown> {
    if (this.cancellation) return Promise.reject(this.cancellation);
    return this.work.run(
      () =>
        new Promise((resolve, reject) => {
          const id = randomUUID();
          const timeout = setTimeout(() => {
            this.pending.delete(id);
            reject(new Error(`Native request "${request.operation}" timed out.`));
          }, 60_000);
          timeout.unref?.();
          this.pending.set(id, { resolve, reject, timeout });
          try {
            this.send({
              version: BACKEND_HOST_PROTOCOL_VERSION,
              kind: "native-request",
              id,
              request,
            });
          } catch (error) {
            clearTimeout(timeout);
            this.pending.delete(id);
            reject(error);
          }
        }),
    );
  }

  resolve(
    reply: Extract<BackendHostRequest, { operation: "resolve-native-request" }>["payload"],
  ): void {
    const pending = this.pending.get(reply.requestId);
    if (!pending) return;
    this.pending.delete(reply.requestId);
    clearTimeout(pending.timeout);
    if (reply.ok) pending.resolve(reply.data);
    else pending.reject(new Error(reply.error));
  }

  /** Parent loss/forced shutdown cancels waits without claiming the native effect stopped. */
  cancel(error: Error): void {
    this.cancellation ??= error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(this.cancellation);
    }
    this.pending.clear();
  }

  /** Call after every producer has stopped and its admitted continuations have joined. */
  drain(): Promise<void> {
    return this.work.drain();
  }
}
