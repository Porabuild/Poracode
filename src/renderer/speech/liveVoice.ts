import { create } from "zustand";
import type { AgentCapability } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { showVoiceCaptureError } from "@/renderer/components/composer/voiceError";
import { gatherIceCandidates } from "./webrtc";

interface VoiceState {
  threadId: string | null;
  scopeId: string | null;
  phase: "idle" | "connecting" | "connected";
  muted: boolean;
  userText: string;
  assistantText: string;
}

const idle: VoiceState = {
  threadId: null,
  scopeId: null,
  phase: "idle",
  muted: false,
  userText: "",
  assistantText: "",
};
/** Media and connection state are intentionally never persisted. */
export const useLiveVoice = create<VoiceState>(() => idle);

interface MediaSession {
  threadId: string;
  scopeId: string;
  connectionId: string;
  stream?: MediaStream;
  peer?: RTCPeerConnection;
  playback?: HTMLAudioElement;
  unsubscribe?: () => void;
  unsubscribeView?: () => void;
  timeout?: ReturnType<typeof setTimeout>;
  requested: boolean;
  abort: AbortController;
}

interface PendingStart {
  generation: number;
  threadId: string;
  scopeId: string;
}

interface StartVoiceOptions {
  threadId: string;
  scopeId?: string;
  capability: NonNullable<AgentCapability["liveVoice"]>;
  /** Create/resume the structured thread after microphone permission succeeds. */
  prepare?: () => Promise<void>;
}

/** One microphone owner per renderer, including the draft-to-thread transition. */
export class LiveVoiceController {
  private session: MediaSession | undefined;
  private pendingStart: PendingStart | undefined;
  private generation = 0;

  async start(options: StartVoiceOptions): Promise<void> {
    const generation = ++this.generation;
    const scopeId = options.scopeId ?? options.threadId;
    const pendingStart: PendingStart = {
      generation,
      threadId: options.threadId,
      scopeId,
    };
    this.pendingStart = pendingStart;
    const previous = this.session;
    this.session = undefined;
    if (previous) await this.release(previous);
    if (generation !== this.generation || this.pendingStart !== pendingStart) return;
    this.pendingStart = undefined;
    const session: MediaSession = {
      threadId: options.threadId,
      scopeId,
      connectionId: crypto.randomUUID(),
      requested: false,
      abort: new AbortController(),
    };
    this.session = session;
    useLiveVoice.setState({
      ...idle,
      threadId: options.threadId,
      scopeId,
      phase: "connecting",
    });
    const current = () => this.session === session && generation === this.generation;
    const initialView = useAppStore.getState().view;
    session.unsubscribeView = useAppStore.subscribe((state, previousState) => {
      if (
        !current() ||
        (state.view === previousState.view && state.threads === previousState.threads)
      )
        return;
      const threadExists = state.threads.some((thread) => thread.id === session.threadId);
      const visible = state.view.kind === "thread" && state.view.panes.includes(session.threadId);
      // Cached thread panes remain mounted after navigation. Media ownership
      // follows the visible view, including the initial draft-to-thread handoff.
      if (!visible && (threadExists || state.view !== initialView)) void this.stop();
    });
    try {
      const microphoneDeviceId = useSharedSettings.getState().audio.microphoneDeviceId;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(microphoneDeviceId ? { deviceId: { exact: microphoneDeviceId } } : {}),
        },
      });
      if (!current()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      session.stream = stream;
      for (const track of stream.getAudioTracks()) {
        // The user can mute while the permission prompt is still pending.
        track.enabled = !useLiveVoice.getState().muted;
        track.onended = () => {
          if (current()) void this.stop();
        };
      }
      await options.prepare?.();
      if (!current()) return;
      const thread = useAppStore.getState().threads.find((row) => row.id === options.threadId);
      if (!thread) throw new Error(msg("voice.unavailable"));
      const peer = new RTCPeerConnection();
      const playback = new Audio();
      playback.autoplay = true;
      session.peer = peer;
      session.playback = playback;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const channel = peer.createDataChannel(options.capability.dataChannel);
      channel.onclose = () => {
        if (current()) void this.stop();
      };
      channel.onerror = () => {
        if (current()) this.fail(new Error(msg("voice.connectionFailed")));
      };
      peer.ontrack = (event) => {
        if (!current()) {
          event.track.stop();
          return;
        }
        playback.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void playback.play().catch((error) => {
          if (current()) this.fail(error);
        });
      };
      peer.onconnectionstatechange = () => {
        if (!current()) return;
        if (peer.connectionState === "connected") {
          clearTimeout(session.timeout);
          useLiveVoice.setState({ phase: "connected" });
        } else if (peer.connectionState === "disconnected") {
          clearTimeout(session.timeout);
          session.timeout = setTimeout(() => {
            if (current()) this.fail(new Error(msg("voice.connectionFailed")));
          }, 8_000);
        } else if (peer.connectionState === "failed" || peer.connectionState === "closed") {
          this.fail(new Error(msg("voice.connectionFailed")));
        }
      };
      session.unsubscribe = readBridge().onSupervisorEvent((event) => {
        if (!current()) return;
        if (
          (event.type === "thread-exited" || event.type === "thread-reset") &&
          event.threadId === options.threadId
        ) {
          void this.stop();
          return;
        }
        if (
          event.type !== "thread-voice" ||
          event.threadId !== options.threadId ||
          event.event.connectionId !== session.connectionId
        )
          return;
        const voice = event.event;
        if (voice.type === "closed") void this.stop();
        else if (voice.type === "error") this.fail(new Error(voice.message));
        else
          useLiveVoice.setState(
            voice.role === "user" ? { userText: voice.text } : { assistantText: voice.text },
          );
      });
      session.timeout = setTimeout(() => {
        if (current()) this.fail(new Error(msg("voice.connectionTimeout")));
      }, 40_000);
      await peer.setLocalDescription(await peer.createOffer());
      await gatherIceCandidates(peer, session.abort.signal);
      if (!current()) return;
      const offerSdp = peer.localDescription?.sdp;
      if (!offerSdp) throw new Error(msg("voice.connectionFailed"));
      session.requested = true;
      const result = await readBridge().connectThreadVoice({
        threadId: options.threadId,
        connectionId: session.connectionId,
        offerSdp,
        config: thread.config,
      });
      if (!current()) {
        await readBridge().disconnectThreadVoice({
          threadId: options.threadId,
          connectionId: session.connectionId,
        });
        return;
      }
      await peer.setRemoteDescription({ type: "answer", sdp: result.answerSdp });
    } catch (error) {
      if (current()) this.fail(error);
    }
  }

  stop(): Promise<void> {
    ++this.generation;
    this.pendingStart = undefined;
    const session = this.session;
    this.session = undefined;
    useLiveVoice.setState(idle);
    return session ? this.release(session) : Promise.resolve();
  }

  stopThread(threadId: string, scopeId?: string): void {
    const matchesOwner = (owner: { threadId: string; scopeId: string }) =>
      owner.threadId === threadId && (scopeId === undefined || owner.scopeId === scopeId);
    if (this.session && matchesOwner(this.session)) {
      void this.stop();
      return;
    }
    if (this.pendingStart && matchesOwner(this.pendingStart)) void this.stop();
  }

  toggleMuted(): void {
    if (!this.session) return;
    const muted = !useLiveVoice.getState().muted;
    this.session.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    useLiveVoice.setState({ muted });
  }

  private fail(error: unknown): void {
    void this.stop();
    showVoiceCaptureError(error);
  }

  private release(session: MediaSession): Promise<void> {
    session.abort.abort();
    clearTimeout(session.timeout);
    session.unsubscribe?.();
    session.unsubscribeView?.();
    session.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (session.peer) {
      session.peer.onconnectionstatechange = null;
      session.peer.ontrack = null;
      session.peer.close();
    }
    if (session.playback) {
      session.playback.pause();
      session.playback.srcObject = null;
    }
    return session.requested
      ? readBridge()
          .disconnectThreadVoice({ threadId: session.threadId, connectionId: session.connectionId })
          .catch(() => {})
      : Promise.resolve();
  }
}

export const liveVoice = new LiveVoiceController();
if (typeof window !== "undefined")
  window.addEventListener("beforeunload", () => {
    void liveVoice.stop();
  });
