import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc/events";
import type { PoracodeBridge } from "@/shared/ipc";
import { LiveVoiceController, useLiveVoice } from "./liveVoice";

const mocks = vi.hoisted(() => ({
  connect: vi.fn<PoracodeBridge["connectThreadVoice"]>(),
  disconnect: vi.fn<PoracodeBridge["disconnectThreadVoice"]>(),
  subscribe: vi.fn<PoracodeBridge["onSupervisorEvent"]>(),
  error: vi.fn<(error: unknown) => void>(),
  subscribeView: vi.fn<(...args: unknown[]) => () => void>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    connectThreadVoice: mocks.connect,
    disconnectThreadVoice: mocks.disconnect,
    onSupervisorEvent: mocks.subscribe,
  }),
}));
vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: {
    getState: () => ({
      threads: [
        { id: "thread", config: { model: "example" } },
        { id: "new-thread", config: { model: "example" } },
      ],
      view: { kind: "thread", panes: ["thread"] },
    }),
    subscribe: mocks.subscribeView,
  },
}));
vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: { getState: () => ({ audio: { microphoneDeviceId: "selected-mic" } }) },
}));
vi.mock("@/renderer/components/composer/voiceError", () => ({
  showVoiceCaptureError: mocks.error,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const options = {
  threadId: "thread",
  capability: { transport: "webrtc", dataChannel: "audio-events" },
} as const;
let controller: LiveVoiceController;
let notify: (event: SupervisorEvent) => void;
let unsubscribe: ReturnType<typeof vi.fn<() => void>>;
let track: { enabled: boolean; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null };
let stream: MediaStream;
let capture: ReturnType<typeof vi.fn>;

class Peer {
  iceGatheringState = "complete";
  static instances: Peer[] = [];
  connectionState = "new";
  localDescription = { sdp: "offer" };
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: { track: MediaStreamTrack; streams: MediaStream[] }) => void) | null = null;
  addTrack = vi.fn<(track: MediaStreamTrack, stream: MediaStream) => void>();
  createDataChannel = vi.fn<(name: string) => { onclose: null; onerror: null }>(() => ({
    onclose: null,
    onerror: null,
  }));
  createOffer = vi.fn<() => Promise<RTCSessionDescriptionInit>>(async () => ({
    type: "offer",
    sdp: "offer",
  }));
  setLocalDescription = vi.fn<(description: RTCSessionDescriptionInit) => Promise<void>>(
    async () => {},
  );
  setRemoteDescription = vi.fn<(description: RTCSessionDescriptionInit) => Promise<void>>(
    async () => {},
  );
  close = vi.fn<() => void>();
  constructor() {
    Peer.instances.push(this);
  }
}
class Playback {
  autoplay = false;
  srcObject: MediaStream | null = null;
  play = vi.fn<() => Promise<void>>(async () => {});
  pause = vi.fn<() => void>();
}

beforeEach(() => {
  controller = new LiveVoiceController();
  Peer.instances = [];
  track = { enabled: true, stop: vi.fn<() => void>(), onended: null };
  stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  capture = vi.fn<() => Promise<MediaStream>>(async () => stream);
  unsubscribe = vi.fn<() => void>();
  mocks.connect.mockResolvedValue({ answerSdp: "answer" });
  mocks.disconnect.mockResolvedValue(undefined);
  mocks.subscribeView.mockReturnValue(() => {});
  mocks.subscribe.mockImplementation((listener) => {
    notify = listener;
    return unsubscribe;
  });
  vi.stubGlobal("RTCPeerConnection", Peer);
  vi.stubGlobal("Audio", Playback);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: capture } });
});
afterEach(async () => {
  await controller.stop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("live voice media ownership", () => {
  it("stops when a cached thread pane is hidden without unmounting", async () => {
    await controller.start(options);
    const listener = mocks.subscribeView.mock.calls[0]![0] as (
      state: unknown,
      previous: unknown,
    ) => void;
    listener(
      { threads: [{ id: "thread" }], view: { kind: "home" } },
      { threads: [{ id: "thread" }], view: { kind: "thread", panes: ["thread"] } },
    );
    expect(track.stop).toHaveBeenCalledOnce();
    expect(useLiveVoice.getState().phase).toBe("idle");
  });

  it("uses the selected microphone, negotiates media, mutes, and releases all resources", async () => {
    await controller.start(options);
    expect(capture).toHaveBeenCalledWith({
      audio: expect.objectContaining({ deviceId: { exact: "selected-mic" } }),
    });
    const peer = Peer.instances[0]!;
    expect(peer.createDataChannel).toHaveBeenCalledWith("audio-events");
    expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: "answer", sdp: "answer" });
    peer.connectionState = "connected";
    peer.onconnectionstatechange!();
    expect(useLiveVoice.getState().phase).toBe("connected");
    controller.toggleMuted();
    expect(track.enabled).toBe(false);
    controller.toggleMuted();
    expect(track.enabled).toBe(true);
    await controller.stop();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(peer.close).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.disconnect).toHaveBeenCalledWith({
      threadId: "thread",
      connectionId: mocks.connect.mock.calls[0]![0].connectionId,
    });
    expect(useLiveVoice.getState().phase).toBe("idle");
  });

  it("honors mute chosen before microphone permission resolves", async () => {
    const permission = deferred<MediaStream>();
    capture.mockReturnValueOnce(permission.promise);
    const starting = controller.start(options);
    controller.toggleMuted();
    permission.resolve(stream);
    await starting;
    expect(track.enabled).toBe(false);
    expect(useLiveVoice.getState().muted).toBe(true);
  });

  it("cancels a permission prompt without creating a thread or retaining its late stream", async () => {
    const permission = deferred<MediaStream>();
    capture.mockReturnValueOnce(permission.promise);
    const prepare = vi.fn<() => Promise<void>>();
    const starting = controller.start({ ...options, prepare });
    await controller.stop();
    permission.resolve(stream);
    await starting;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(prepare).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("cancels during draft launch without starting voice after launch completes", async () => {
    const launch = deferred<void>();
    const prepare = vi.fn<() => Promise<void>>(() => launch.promise);
    const starting = controller.start({ ...options, prepare, scopeId: "draft" });
    await vi.waitFor(() => expect(prepare).toHaveBeenCalled());
    controller.stopThread("thread");
    launch.resolve();
    await starting;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(useLiveVoice.getState().phase).toBe("idle");
  });

  it("cancels a pending start while an older owner's release is unresolved", async () => {
    await controller.start(options);
    const release = deferred<void>();
    mocks.disconnect.mockReturnValueOnce(release.promise);

    const starting = controller.start({
      ...options,
      threadId: "new-thread",
      scopeId: "new-owner",
    });
    await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());

    controller.stopThread("new-thread", "new-owner");
    release.resolve();
    await starting;

    expect(capture).toHaveBeenCalledOnce();
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(useLiveVoice.getState().phase).toBe("idle");
  });

  it("does not let a stale owner cancel a newer pending start", async () => {
    await controller.start(options);
    const release = deferred<void>();
    mocks.disconnect.mockReturnValueOnce(release.promise);

    const starting = controller.start({
      ...options,
      threadId: "new-thread",
      scopeId: "new-owner",
    });
    await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());

    controller.stopThread("thread");
    controller.stopThread("new-thread", "stale-owner");
    release.resolve();
    await starting;

    expect(capture).toHaveBeenCalledTimes(2);
    expect(useLiveVoice.getState().threadId).toBe("new-thread");
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("keeps the disconnect barrier through stop, cancellation, and another retry", async () => {
    await controller.start(options);
    const release = deferred<void>();
    mocks.disconnect.mockReturnValueOnce(release.promise);

    const stopping = controller.stop();
    const canceled = controller.start({ ...options, scopeId: "canceled-draft" });
    controller.stopScope("canceled-draft");
    const starting = controller.start({ ...options, scopeId: "retry-draft" });
    try {
      await Promise.resolve();
      expect(capture).toHaveBeenCalledOnce();
      expect(mocks.connect).toHaveBeenCalledOnce();
      expect(useLiveVoice.getState()).toMatchObject({
        scopeId: "retry-draft",
        phase: "connecting",
      });
    } finally {
      release.resolve();
      await Promise.all([stopping, canceled, starting]);
    }

    expect(capture).toHaveBeenCalledTimes(2);
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(useLiveVoice.getState().scopeId).toBe("retry-draft");
  });

  it("publishes the pending owner immediately and rejects stale controls during teardown", async () => {
    await controller.start({ ...options, scopeId: "old-owner" });
    const release = deferred<void>();
    mocks.disconnect.mockReturnValueOnce(release.promise);
    const starting = controller.start({
      ...options,
      threadId: "new-thread",
      scopeId: "new-owner",
    });
    try {
      expect(useLiveVoice.getState()).toMatchObject({
        threadId: "new-thread",
        scopeId: "new-owner",
        phase: "connecting",
      });
      controller.stopScope("old-owner");
      controller.stopThread("thread");
      controller.toggleMuted("thread");
      expect(useLiveVoice.getState().muted).toBe(false);
      controller.toggleMuted("new-owner");
      expect(useLiveVoice.getState().muted).toBe(true);
      await Promise.resolve();
      expect(capture).toHaveBeenCalledOnce();
    } finally {
      release.resolve();
      await starting;
    }

    expect(useLiveVoice.getState()).toMatchObject({ scopeId: "new-owner", muted: true });
    expect(track.enabled).toBe(false);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("releases a late signaling answer after cancellation", async () => {
    const answer = deferred<{ answerSdp: string }>();
    mocks.connect.mockReturnValueOnce(answer.promise);
    const starting = controller.start(options);
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalled());
    await controller.stop();
    answer.resolve({ answerSdp: "late" });
    await starting;
    expect(Peer.instances[0]!.setRemoteDescription).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("ignores stale connection events and stops on thread exit", async () => {
    await controller.start(options);
    notify({
      type: "thread-voice",
      threadId: "thread",
      event: { connectionId: "old", type: "closed" },
    });
    expect(useLiveVoice.getState().phase).toBe("connecting");
    notify({ type: "thread-reset", threadId: "thread" });
    expect(useLiveVoice.getState().phase).toBe("idle");
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("surfaces permission failure without preparing a thread", async () => {
    const error = new DOMException("Denied", "NotAllowedError");
    capture.mockRejectedValueOnce(error);
    const prepare = vi.fn<() => Promise<void>>();
    await controller.start({ ...options, prepare });
    expect(mocks.error).toHaveBeenCalledWith(error);
    expect(prepare).not.toHaveBeenCalled();
    expect(useLiveVoice.getState().phase).toBe("idle");
  });

  it("ends a failed peer connection and releases the microphone", async () => {
    await controller.start(options);
    const peer = Peer.instances[0]!;
    peer.connectionState = "failed";
    peer.onconnectionstatechange!();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(mocks.error).toHaveBeenCalledOnce();
    expect(useLiveVoice.getState().phase).toBe("idle");
  });
});
