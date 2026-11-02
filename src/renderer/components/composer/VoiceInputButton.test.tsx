// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const mocks = vi.hoisted(() => ({
  settings: {
    audio: {
      microphoneDeviceId: "",
      transcriptionLanguage: "fr",
      transcriptionModel: "tiny",
      transcriptionBackend: "hex",
      hexModel: "parakeet_v3",
      useWebGpu: true,
    },
  },
  prepareAudio: vi.fn<(...args: unknown[]) => Float32Array>(),
  subscribeProgress: vi.fn<(...args: unknown[]) => () => void>(() => () => {}),
  transcribe: vi.fn<(...args: unknown[]) => Promise<string>>(),
  warmup: vi.fn<(...args: unknown[]) => void>(),
  checkReady: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: typeof mocks.settings) => unknown) =>
    selector(mocks.settings),
}));
vi.mock("@/renderer/speech/voiceTranscription", () => ({
  prepareVoiceAudio: mocks.prepareAudio,
  subscribeVoiceTranscriptionProgress: mocks.subscribeProgress,
}));
vi.mock("@/renderer/speech/dictation", () => ({
  transcribeDictation: mocks.transcribe,
  warmupDictation: mocks.warmup,
}));
vi.mock("@/renderer/speech/hexVoice", () => ({
  createHexVoiceSession: () => ({ checkReady: mocks.checkReady }),
  HexVoiceError: class extends Error {},
}));
vi.mock("./voiceError", () => ({
  formatVoiceError: (error: unknown) => String(error),
  showVoiceCaptureError: vi.fn<(...args: unknown[]) => void>(),
}));

import { VoiceInputButton } from "./VoiceInputButton";
import { HexVoiceError } from "@/renderer/speech/hexVoice";

let getUserMedia: Mock<() => Promise<MediaStream>>;
let track: { stop: ReturnType<typeof vi.fn<() => void>> };
const originalAudioContext = window.AudioContext;

class FakeAudioContext {
  readonly state = "running";
  readonly sampleRate = 48_000;
  readonly destination = {} as AudioDestinationNode;

  async close() {}
  async resume() {}

  createMediaStreamSource() {
    return {
      connect: vi.fn<() => void>(),
      disconnect: vi.fn<() => void>(),
    } as unknown as MediaStreamAudioSourceNode;
  }

  createScriptProcessor() {
    return {
      onaudioprocess: null,
      connect: vi.fn<() => void>(),
      disconnect: vi.fn<() => void>(),
    } as unknown as ScriptProcessorNode;
  }
}

beforeEach(() => {
  mocks.settings.audio.transcriptionBackend = "hex";
  mocks.settings.audio.transcriptionLanguage = "fr";
  mocks.settings.audio.transcriptionModel = "tiny";
  mocks.settings.audio.hexModel = "parakeet_v3";
  mocks.subscribeProgress.mockReturnValue(() => {});
  mocks.prepareAudio.mockReturnValue(new Float32Array([0.25]));
  mocks.transcribe.mockResolvedValue("native transcript");
  mocks.checkReady.mockResolvedValue(undefined);
  track = { stop: vi.fn<() => void>() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  getUserMedia = vi.fn<() => Promise<MediaStream>>(async () => stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  Object.defineProperty(window, "AudioContext", { configurable: true, value: FakeAudioContext });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: originalAudioContext,
  });
  vi.clearAllMocks();
});

describe("VoiceInputButton", () => {
  it("captures in a browser and sends the selected Hex transcript to its callback", async () => {
    const onTranscript = vi.fn<(transcript: string) => void>();
    render(<VoiceInputButton onTranscript={onTranscript} />);

    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Stop voice input" })).toBeInTheDocument(),
    );
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(mocks.checkReady).toHaveBeenCalledWith("parakeet_v3", "fr", expect.any(AbortSignal));
    expect(mocks.checkReady.mock.invocationCallOrder[0]).toBeLessThan(
      getUserMedia.mock.invocationCallOrder[0]!,
    );
    expect(mocks.warmup).toHaveBeenCalledWith(
      expect.objectContaining({ backend: "hex", hexModel: "parakeet_v3" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Stop voice input" }));
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("native transcript"));
    expect(mocks.transcribe).toHaveBeenCalledWith(
      expect.any(Float32Array),
      expect.objectContaining({
        backend: "hex",
        model: "tiny",
        hexModel: "parakeet_v3",
        language: "fr",
        useWebGpu: true,
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("shows a setup action without opening the microphone when Hex is not ready", async () => {
    mocks.checkReady.mockRejectedValue(new HexVoiceError("not_ready"));
    render(<VoiceInputButton onTranscript={vi.fn<(transcript: string) => void>()} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    await screen.findByRole("button", { name: "Audio settings" });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("retries retained audio with the original model and bound session", async () => {
    mocks.transcribe.mockRejectedValueOnce(new Error("Connection lost"));
    const onTranscript = vi.fn<(transcript: string) => void>();
    render(<VoiceInputButton onTranscript={onTranscript} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop voice input" }));
    const retry = await screen.findByRole("button", { name: "Retry transcription" });
    const originalOptions = mocks.transcribe.mock.calls[0]![1];
    mocks.settings.audio.hexModel = "different-model";
    fireEvent.click(retry);
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("native transcript"));
    expect(mocks.transcribe.mock.calls[1]![1]).toBe(originalOptions);
    expect(getUserMedia).toHaveBeenCalledOnce();
  });

  it("cancels transcription and never inserts a late result", async () => {
    let resolve!: (text: string) => void;
    mocks.transcribe.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const onTranscript = vi.fn<(transcript: string) => void>();
    render(<VoiceInputButton onTranscript={onTranscript} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop voice input" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel transcription" }));
    const callbacks = mocks.transcribe.mock.calls[0]![2] as { signal: AbortSignal };
    expect(callbacks.signal.aborted).toBe(true);
    resolve("late result");
    await screen.findByRole("button", { name: "Start voice input" });
    expect(onTranscript).not.toHaveBeenCalled();
  });
});
