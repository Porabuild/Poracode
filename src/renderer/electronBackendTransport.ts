import {
  BACKEND_RENDERER_STREAM_VERSION,
  isDirectRendererDatabaseProcedure,
  isDirectRendererServiceProcedure,
  type BackendRendererReply,
  type BackendRendererRequestOperation,
  type BackendRendererStreamInfo,
} from "@/shared/backendHostProtocol";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { ipcProcedureMap, type IpcProcedureName, type SupervisorEvent } from "@/shared/ipc";

const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const RECONNECT_DELAY_MS = 1_000;

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

interface RendererInterests {
  terminalThreadIds: string[];
  runtimeThreadIds: string[];
}

export class ElectronBackendTransport {
  private info: BackendRendererStreamInfo | null = null;
  private socket: WebSocket | null = null;
  private connectPromise: Promise<WebSocket> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSequence = 0;
  private directEventsConnected = false;
  private readonly listeners = new Set<(event: SupervisorEvent) => void>();
  private readonly pending = new Map<string, PendingRequest>();
  private interests: RendererInterests = { terminalThreadIds: [], runtimeThreadIds: [] };

  constructor(private readonly host: ElectronHostBridge) {
    host.onSupervisorEvent((event, rendererSequence) => {
      if (this.directEventsConnected) return;
      if (rendererSequence !== undefined) {
        if (rendererSequence <= this.lastSequence) return;
        this.lastSequence = rendererSequence;
      }
      this.dispatch(event);
    });
    host.onBackendRendererStreamChanged((info) => this.replaceInfo(info));
    void host
      .getBackendRendererStreamInfo()
      .then((info) => {
        if (info) this.replaceInfo(info);
      })
      .catch(() => undefined);
  }

  subscribe(listener: (event: SupervisorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setEventInterests(interests: RendererInterests): Promise<void> {
    this.interests = {
      terminalThreadIds: [...new Set(interests.terminalThreadIds)],
      runtimeThreadIds: [...new Set(interests.runtimeThreadIds)],
    };
    this.sendInterests();
    await this.syncMainEventInterests();
  }

  operationFor(name: IpcProcedureName): BackendRendererRequestOperation | null {
    if (ipcProcedureMap[name].transport === "supervisor") return "supervisor";
    if (isDirectRendererDatabaseProcedure(name)) return "database";
    if (isDirectRendererServiceProcedure(name)) return "service";
    return null;
  }

  async call(
    operation: BackendRendererRequestOperation,
    name: IpcProcedureName,
    payload: unknown,
    fallbackArgs: unknown[],
  ): Promise<unknown> {
    let socket: WebSocket;
    try {
      socket = await this.connect();
    } catch {
      return this.host.invokeProcedure(name, fallbackArgs);
    }
    const id = crypto.randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`Backend request ${name} timed out.`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        socket.send(
          JSON.stringify({
            version: BACKEND_RENDERER_STREAM_VERSION,
            type: "request",
            id,
            operation,
            name,
            payload,
          }),
        );
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private replaceInfo(info: BackendRendererStreamInfo): void {
    if (this.info?.url === info.url && this.info.token === info.token) return;
    this.info = info;
    this.lastSequence = 0;
    this.disconnect(new Error("Backend renderer transport changed."));
    void this.connect().catch(() => undefined);
  }

  private connect(): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
    if (this.connectPromise) return this.connectPromise;
    const info = this.info;
    if (!info) return Promise.reject(new Error("Backend renderer transport is unavailable."));
    const endpoint = new URL(info.url);
    endpoint.searchParams.set("token", info.token);
    const socket = new WebSocket(endpoint);
    this.socket = socket;
    this.connectPromise = new Promise<WebSocket>((resolve, reject) => {
      socket.addEventListener(
        "open",
        () => {
          if (this.socket !== socket) return;
          this.connectPromise = null;
          this.sendInterests();
          resolve(socket);
        },
        { once: true },
      );
      socket.addEventListener(
        "close",
        () => reject(new Error("Backend renderer transport closed before connecting.")),
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          if (this.socket === socket) this.connectPromise = null;
          reject(new Error("Unable to connect to the backend renderer transport."));
        },
        { once: true },
      );
    });
    socket.addEventListener("message", (event) => this.handleMessage(socket, String(event.data)));
    socket.addEventListener("close", () => this.handleClose(socket));
    return this.connectPromise;
  }

  private handleMessage(socket: WebSocket, raw: string): void {
    if (this.socket !== socket) return;
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      socket.close(1008, "Invalid backend renderer message");
      return;
    }
    if (!isBackendRendererMessage(message)) {
      socket.close(1008, "Invalid backend renderer message");
      return;
    }
    if (message.type === "reply") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.ok) pending.resolve(message.data);
      else pending.reject(new Error(message.error));
      return;
    }
    if (message.type === "interests-ack") {
      this.lastSequence = Math.max(this.lastSequence, message.latestSeq);
      this.directEventsConnected = true;
      return;
    }
    if (message.type === "event") {
      if (message.seq <= this.lastSequence) return;
      this.lastSequence = message.seq;
      this.dispatch(message.event);
      return;
    }
    if (message.type === "resync-required") {
      this.lastSequence = message.latestSeq;
      for (const threadId of this.interests.terminalThreadIds) {
        this.dispatch({ type: "thread-scrollback-resync", threadId });
      }
      for (const threadId of this.interests.runtimeThreadIds) {
        this.dispatch({ type: "thread-reset", threadId });
      }
    }
  }

  private handleClose(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.connectPromise = null;
    this.directEventsConnected = false;
    this.rejectPending(new Error("Backend renderer transport disconnected."));
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => undefined);
    }, RECONNECT_DELAY_MS);
  }

  private disconnect(error: Error): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.connectPromise = null;
    this.directEventsConnected = false;
    socket?.close();
    this.rejectPending(error);
  }

  private rejectPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
  }

  private sendInterests(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests",
        terminalThreadIds: this.interests.terminalThreadIds,
        runtimeThreadIds: this.interests.runtimeThreadIds,
        lastSeq: this.lastSequence,
      }),
    );
  }

  private async syncMainEventInterests(): Promise<void> {
    await this.host.invokeProcedure("setRendererEventInterests", [this.interests]);
  }

  private dispatch(event: SupervisorEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

type BackendRendererMessage =
  | BackendRendererReply
  | {
      version: typeof BACKEND_RENDERER_STREAM_VERSION;
      type: "hello" | "interests-ack" | "resync-required";
      latestSeq: number;
    }
  | {
      version: typeof BACKEND_RENDERER_STREAM_VERSION;
      type: "event";
      seq: number;
      event: SupervisorEvent;
    };

function isBackendRendererMessage(value: unknown): value is BackendRendererMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message.version !== BACKEND_RENDERER_STREAM_VERSION || typeof message.type !== "string") {
    return false;
  }
  if (message.type === "reply") {
    return (
      typeof message.id === "string" &&
      typeof message.ok === "boolean" &&
      (message.ok || typeof message.error === "string")
    );
  }
  if (message.type === "event") {
    return (
      typeof message.seq === "number" &&
      typeof message.event === "object" &&
      message.event !== null &&
      typeof (message.event as { type?: unknown }).type === "string"
    );
  }
  return (
    (message.type === "hello" ||
      message.type === "interests-ack" ||
      message.type === "resync-required") &&
    typeof message.latestSeq === "number"
  );
}
