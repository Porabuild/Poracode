import type { RuntimeEvent } from "@/shared/contracts";
import type { ConnectThreadVoiceResult, LiveVoiceEvent } from "@/shared/contracts/liveVoice";
import { msg } from "@/shared/messages";
import type { CodexAppServerRpc } from "./appServerRpc";
import { CodexVoiceTranscript } from "./liveVoiceTranscript";

interface VoiceConnection {
  id: string;
  remoteThreadId: string;
  started: boolean;
  requested: boolean;
  closing: boolean;
  resolve: (result: ConnectThreadVoiceResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  transcript: CodexVoiceTranscript;
  closed: Promise<void>;
  confirmClosed: () => void;
  stopConfirmed: boolean;
}

/** Owns subscription WebRTC v3 signaling on the existing Codex thread. */
export class CodexLiveVoice {
  private connection: VoiceConnection | undefined;
  private intentId: string | undefined;
  private stopping: Promise<void> = Promise.resolve();
  private reconnectBlocked = false;

  constructor(
    private readonly rpc: Pick<CodexAppServerRpc, "request">,
    private readonly localThreadId: string,
    private readonly emit: (event: LiveVoiceEvent) => void,
    private readonly emitRuntime: (events: RuntimeEvent[]) => void,
  ) {}

  async connect(
    remoteThreadId: string,
    connectionId: string,
    offerSdp: string,
    prepare?: () => Promise<void>,
  ): Promise<ConnectThreadVoiceResult> {
    if (this.intentId || (this.connection && !this.connection.closing))
      throw new Error(msg("voice.alreadyConnected"));
    this.intentId = connectionId;
    await this.stopping;
    if (this.intentId !== connectionId) throw new Error(msg("voice.cancelled"));
    if (this.reconnectBlocked) {
      this.intentId = undefined;
      throw new Error(msg("voice.unavailable"));
    }
    let connection!: VoiceConnection;
    const answer = new Promise<ConnectThreadVoiceResult>((resolve, reject) => {
      let confirmClosed!: () => void;
      const closed = new Promise<void>((done) => {
        confirmClosed = done;
      });
      connection = {
        closed,
        confirmClosed,
        stopConfirmed: false,
        id: connectionId,
        remoteThreadId,
        started: false,
        requested: false,
        closing: false,
        resolve,
        reject,
        timeout: setTimeout(() => {
          reject(new Error(msg("voice.connectionTimeout")));
          void this.disconnect(connectionId);
        }, 30_000),
        transcript: new CodexVoiceTranscript(
          this.localThreadId,
          connectionId,
          this.emit,
          this.emitRuntime,
        ),
      };
    });
    // A cancellation or asynchronous server error may arrive before start's
    // acknowledgement. Attach a rejection handler while that RPC is in flight.
    void answer.catch(() => {});
    this.connection = connection;
    try {
      const account = await this.rpc.request("account/read", { refreshToken: false });
      if (this.connection !== connection || connection.closing) return await answer;
      if (account.account?.type !== "chatgpt") throw new Error(msg("voice.subscriptionRequired"));
      await prepare?.();
      if (this.connection !== connection || connection.closing) return await answer;
      connection.requested = true;
      const acknowledgement = this.rpc.request("thread/realtime/start", {
        threadId: remoteThreadId,
        realtimeSessionId: connectionId,
        version: "v3",
        outputModality: "audio",
        transport: { type: "webrtc", sdp: offerSdp },
      });
      const [, result] = await Promise.all([acknowledgement, answer]);
      return result;
    } catch (error) {
      const message =
        error instanceof Error &&
        [
          msg("voice.subscriptionRequired"),
          msg("voice.connectionTimeout"),
          msg("voice.cancelled"),
        ].includes(error.message)
          ? error.message
          : msg("voice.connectionFailed");
      if (message !== msg("voice.cancelled")) this.emit({ connectionId, type: "error", message });
      await this.disconnect(connectionId);
      throw new Error(message, { cause: error });
    }
  }

  handleNotification(method: string, params: Record<string, unknown> | undefined): boolean {
    if (!method.startsWith("thread/realtime/")) return false;
    const connection = this.connection;
    if (!connection || params?.threadId !== connection.remoteThreadId) return true;
    if (method === "thread/realtime/started") {
      if (params.realtimeSessionId === connection.id) connection.started = true;
    } else if (
      method === "thread/realtime/sdp" &&
      !connection.closing &&
      connection.started &&
      typeof params.sdp === "string"
    ) {
      clearTimeout(connection.timeout);
      connection.resolve({ answerSdp: params.sdp });
    } else if (method === "thread/realtime/error") {
      const message = msg("voice.connectionFailed");
      connection.reject(new Error(message));
      this.emit({ connectionId: connection.id, type: "error", message });
      void this.disconnect(connection.id);
    } else if (method === "thread/realtime/closed") {
      if (connection.closing && params.reason === "requested") {
        connection.stopConfirmed = true;
        connection.confirmClosed();
      } else if (!connection.closing) {
        void this.disconnect(connection.id);
      }
    } else if (connection.started) {
      connection.transcript.handle(method, params);
    }
    return true;
  }

  disconnect(connectionId?: string): Promise<void> {
    if (!connectionId || this.intentId === connectionId) this.intentId = undefined;
    const connection = this.connection;
    if (!connection || (connectionId && connection.id !== connectionId)) return this.stopping;
    if (connection.closing) return this.stopping;
    connection.closing = true;
    clearTimeout(connection.timeout);
    connection.reject(new Error(msg("voice.cancelled")));
    // Keep routing final transcript items until stop has drained. Clearing the
    // connection before the RPC completes loses the last spoken segment.
    this.stopping = this.stopAndDrain(connection);
    return this.stopping;
  }

  private async stopAndDrain(connection: VoiceConnection): Promise<void> {
    if (connection.requested) {
      // A transport_closed event can be followed by a second requested close.
      // Only the latter is the stop barrier for notifications without session IDs.
      const timer = setTimeout(connection.confirmClosed, 5_000);
      try {
        await Promise.all([
          this.rpc
            .request("thread/realtime/stop", { threadId: connection.remoteThreadId }, 5_000)
            .catch(() => {}),
          connection.closed,
        ]);
      } finally {
        clearTimeout(timer);
        // If the protocol never confirms teardown, a new conversation cannot
        // safely share its untagged notification stream. A new runtime is needed.
        this.reconnectBlocked = !connection.stopConfirmed;
      }
    }
    this.finish(connection);
  }

  private finish(connection: VoiceConnection): void {
    if (this.connection !== connection) return;
    connection.transcript.finish();
    this.connection = undefined;
    if (this.intentId === connection.id) this.intentId = undefined;
    clearTimeout(connection.timeout);
    connection.reject(new Error(msg("voice.cancelled")));
    this.emit({ connectionId: connection.id, type: "closed" });
  }
}
