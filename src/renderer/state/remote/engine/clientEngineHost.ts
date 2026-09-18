import {
  CLIENT_ENGINE_MAX_PENDING,
  CLIENT_ENGINE_PROTOCOL_VERSION,
  CLIENT_ENGINE_TIMEOUT_MS,
  type ClientEngineRequest,
  type ClientEngineResponse,
  type ClientEngineWorkRequest,
} from "./protocol";
import {
  decodeBackendRendererFrame,
  decodeRemoteSocketFrame,
  parseJsonValue,
  stringifyJsonValue,
  type DecodeFrameResult,
  type JsonParseResult,
  type JsonStringifyResult,
} from "./decode";

export class ClientEngineOverflowError extends Error {
  constructor() {
    super("Client engine overflow");
    this.name = "ClientEngineOverflowError";
  }
}

type PendingEntry = {
  generation: number;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
  fallback(): unknown;
};

let host: ClientEngineHost | null = null;

export function getClientEngineHost(): ClientEngineHost {
  host ??= new ClientEngineHost();
  return host;
}

export function decodeBackendSync(raw: string): DecodeFrameResult {
  return decodeBackendRendererFrame(raw);
}

export function isClientEngineWorkerActive(): boolean {
  return getClientEngineHost().isWorkerActive();
}

export function resetClientEngineHostForTests(): void {
  host?.dispose();
  host = null;
}

export class ClientEngineHost {
  private generation = 0;
  private nextId = 1;
  private worker: Worker | null = null;
  private workerState: "untried" | "active" | "unavailable" = "untried";
  private readonly pending = new Map<number, PendingEntry>();
  private readonly overflowHandlers = new Set<() => void>();

  addOverflowListener(handler: () => void): () => void {
    this.overflowHandlers.add(handler);
    return () => {
      this.overflowHandlers.delete(handler);
    };
  }

  setOnOverflow(handler: (() => void) | null): void {
    this.overflowHandlers.clear();
    if (handler) this.overflowHandlers.add(handler);
  }

  isWorkerActive(): boolean {
    return this.ensureWorker() !== null;
  }

  reset(error: Error = new Error("Client engine reset")): void {
    this.generation += 1;
    this.rejectPending(error);
    this.postControl({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: this.generation,
      type: "reset",
    });
  }

  decodeBackend(raw: string): Promise<DecodeFrameResult> {
    return this.enqueue({ type: "decode-backend", raw }, () => decodeBackendRendererFrame(raw));
  }

  decodeRemote(raw: string): Promise<DecodeFrameResult> {
    return this.enqueue({ type: "decode-remote", raw }, () => decodeRemoteSocketFrame(raw));
  }

  async parseJson(raw: string): Promise<unknown> {
    const result = await this.enqueue({ type: "parse-json", raw }, () => parseJsonValue(raw));
    if (!result.ok) throw new SyntaxError("Invalid JSON");
    return result.value;
  }

  async stringifyJson(value: unknown): Promise<string> {
    const result = await this.enqueue({ type: "stringify-json", value }, () =>
      stringifyJsonValue(value),
    );
    if (!result.ok) throw new TypeError("Cannot stringify value");
    return result.json;
  }

  dispose(): void {
    this.rejectPending(new Error("Client engine reset"));
    this.worker?.terminate();
    this.worker = null;
    this.workerState = "unavailable";
    this.overflowHandlers.clear();
  }

  private enqueue<T extends DecodeFrameResult | JsonParseResult | JsonStringifyResult>(
    work:
      | { type: "decode-backend" | "decode-remote" | "parse-json"; raw: string }
      | {
          type: "stringify-json";
          value: unknown;
        },
    fallback: () => T,
  ): Promise<T> {
    const worker = this.ensureWorker();
    if (!worker) return Promise.resolve(fallback());
    if (this.pending.size >= CLIENT_ENGINE_MAX_PENDING) {
      this.handleOverflow();
      return Promise.reject(new ClientEngineOverflowError());
    }

    const id = this.nextId++;
    const generation = this.generation;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        this.postAck(id, generation);
        resolve(entry.fallback() as T);
      }, CLIENT_ENGINE_TIMEOUT_MS);
      this.pending.set(id, {
        generation,
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
        fallback,
      });
      const request = {
        v: CLIENT_ENGINE_PROTOCOL_VERSION,
        generation,
        id,
        ...work,
      } as ClientEngineWorkRequest;
      try {
        worker.postMessage(request);
      } catch {
        this.pending.delete(id);
        clearTimeout(timeout);
        resolve(fallback());
      }
    });
  }

  private ensureWorker(): Worker | null {
    if (this.workerState === "active") return this.worker;
    if (this.workerState === "unavailable") return null;
    if (typeof Worker === "undefined") {
      this.workerState = "unavailable";
      return null;
    }
    try {
      const worker = new Worker(new URL("./clientEngineWorker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<ClientEngineResponse>) => {
        this.onWorkerMessage(event.data);
      };
      worker.onerror = () => this.failWorker();
      worker.onmessageerror = () => this.failWorker();
      this.worker = worker;
      this.workerState = "active";
      return worker;
    } catch {
      this.workerState = "unavailable";
      return null;
    }
  }

  private onWorkerMessage(response: ClientEngineResponse): void {
    if (!response || response.v !== CLIENT_ENGINE_PROTOCOL_VERSION) return;
    if (response.generation !== this.generation) return;
    if (response.type === "overflow") {
      this.handleOverflow();
      return;
    }
    const entry = this.pending.get(response.id);
    if (!entry) return;
    if (entry.generation !== response.generation) return;
    this.pending.delete(response.id);
    clearTimeout(entry.timeout);
    this.postAck(response.id, response.generation);
    entry.resolve(resultFromResponse(response));
  }

  private handleOverflow(): void {
    this.reset(new ClientEngineOverflowError());
    for (const handler of this.overflowHandlers) handler();
  }

  private failWorker(): void {
    const pending = [...this.pending.values()];
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.workerState = "unavailable";
    this.generation += 1;
    for (const entry of pending) {
      clearTimeout(entry.timeout);
      entry.resolve(entry.fallback());
    }
  }

  private rejectPending(error: Error): void {
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const entry of pending) {
      clearTimeout(entry.timeout);
      entry.reject(error);
    }
  }

  private postAck(id: number, generation: number): void {
    this.postControl({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation,
      type: "ack",
      id,
    });
  }

  private postControl(request: Extract<ClientEngineRequest, { type: "ack" | "reset" }>): void {
    try {
      this.worker?.postMessage(request);
    } catch {
      // Worker may already be gone; fencing is host-side.
    }
  }
}

function resultFromResponse(
  response: Exclude<ClientEngineResponse, { type: "overflow" }>,
): DecodeFrameResult | JsonParseResult | JsonStringifyResult {
  if (response.type === "decode-backend" || response.type === "decode-remote") {
    return response.ok ? { ok: true, message: response.message } : { ok: false, error: "invalid" };
  }
  if (response.type === "parse-json") {
    return response.ok ? { ok: true, value: response.value } : { ok: false, error: "invalid" };
  }
  return response.ok ? { ok: true, json: response.json } : { ok: false, error: "invalid" };
}
