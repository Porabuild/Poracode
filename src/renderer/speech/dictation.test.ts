import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HexVoiceJob } from "@/shared/contracts/hexVoice";
import { transcribeDictation, warmupDictation, type DictationOptions } from "./dictation";
import type { HexVoiceSession } from "./hexVoice";

const mocks = vi.hoisted(() => ({
  hex: vi.fn<(...args: unknown[]) => Promise<string>>(),
  createHexSession: vi.fn<() => { transcribe: (...args: unknown[]) => Promise<string> }>(),
  builtIn: vi.fn<(...args: unknown[]) => Promise<string>>(),
  warmup: vi.fn<(options: DictationOptions) => void>(),
}));
vi.mock("./hexVoice", () => ({
  createHexVoiceSession: mocks.createHexSession,
}));
vi.mock("./voiceTranscription", () => ({
  transcribeVoiceAudio: mocks.builtIn,
  warmupVoiceTranscription: mocks.warmup,
}));

const options: DictationOptions = {
  backend: "transformers",
  model: "base",
  hexModel: "parakeet_v3",
  language: "en",
  useWebGpu: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.createHexSession.mockReturnValue({ transcribe: mocks.hex });
});

describe("dictation backend selection", () => {
  it("preserves built-in warmup, model choice and partial transcript callbacks", async () => {
    mocks.builtIn.mockResolvedValue("local text");
    const callbacks = {
      signal: new AbortController().signal,
      onPartial: vi.fn<(text: string) => void>(),
    };
    const samples = new Float32Array([0.5]);
    warmupDictation(options);
    expect(mocks.warmup).toHaveBeenCalledWith(options);
    await expect(transcribeDictation(samples, options, callbacks)).resolves.toBe("local text");
    expect(mocks.builtIn).toHaveBeenCalledWith(samples, options, {
      onPartial: callbacks.onPartial,
    });
    expect(mocks.hex).not.toHaveBeenCalled();
  });

  it("uses Hex without warming Whisper and retains errors for explicit fallback", async () => {
    const selected = { ...options, backend: "hex" as const };
    const onProgress = vi.fn<(job: HexVoiceJob) => void>();
    const callbacks = {
      signal: new AbortController().signal,
      onPartial: vi.fn<(text: string) => void>(),
      onProgress,
    };
    const samples = new Float32Array([0.5]);
    warmupDictation(selected);
    mocks.hex
      .mockResolvedValueOnce("native text")
      .mockRejectedValueOnce(new Error("missing helper"));
    await expect(transcribeDictation(samples, selected, callbacks)).resolves.toBe("native text");
    expect(mocks.hex).toHaveBeenCalledWith(samples, {
      model: "parakeet_v3",
      language: "en",
      signal: callbacks.signal,
      onProgress,
    });
    await expect(transcribeDictation(samples, selected, callbacks)).rejects.toThrow(
      "missing helper",
    );
    expect(mocks.builtIn).not.toHaveBeenCalled();
    expect(mocks.warmup).not.toHaveBeenCalled();
  });

  it("uses a session captured by the caller instead of creating another transport", async () => {
    const hexSession = { transcribe: mocks.hex } as unknown as HexVoiceSession;
    const selected = { ...options, backend: "hex" as const, hexSession };
    mocks.hex.mockResolvedValue("session text");

    await expect(
      transcribeDictation(new Float32Array([0.5]), selected, {
        signal: new AbortController().signal,
        onPartial: vi.fn<(text: string) => void>(),
      }),
    ).resolves.toBe("session text");
    expect(mocks.createHexSession).not.toHaveBeenCalled();
  });
});
