import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HexVoiceJob, HexVoiceRequest, HexVoiceResponse } from "@/shared/contracts/hexVoice";
import { HEX_VOICE_CHUNK_BYTES, HEX_VOICE_MAX_AUDIO_BYTES } from "@/shared/contracts/hexVoice";
import {
  encodeVoiceWav,
  createHexVoiceSession,
  listHexVoiceModels,
  prepareHexVoiceModel,
  transcribeHexVoice,
} from "./hexVoice";

const { call, remote, getRemoteClient } = vi.hoisted(() => ({
  call: vi.fn<(request: HexVoiceRequest) => Promise<HexVoiceResponse>>(),
  remote: vi.fn<() => boolean>(() => false),
  getRemoteClient: vi.fn<
    () => {
      callRemoteProcedure: (name: string, request: HexVoiceRequest) => Promise<HexVoiceResponse>;
    } | null
  >(() => null),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ hexVoice: call }),
  isRemoteSession: remote,
}));
vi.mock("@/renderer/browser/remoteBridge", () => ({ getRemoteBridgeClient: getRemoteClient }));

const selection = () => ({
  model: "parakeet_v3",
  language: "ru",
  signal: new AbortController().signal,
});

beforeEach(() => {
  call.mockReset();
  remote.mockReturnValue(false);
  getRemoteClient.mockReturnValue(null);
  call.mockImplementation(async (request) => {
    if (request.action === "list") {
      return {
        kind: "catalog",
        models: [
          {
            id: "parakeet_v3",
            name: "Parakeet v3",
            installed: true,
            verified: true,
            downloadBytes: null,
            languages: ["ru", "en"],
            supportsLanguageDetection: false,
          },
        ],
      };
    }
    if (request.action === "cancel") return { kind: "cancelled" };
    if (!("id" in request)) throw new Error("Expected a voice job request");
    return {
      kind: "job",
      job: {
        id: request.id,
        phase:
          request.action === "finish" || request.action === "status"
            ? "done"
            : request.action === "prepare"
              ? "preparing"
              : "uploading",
        ...(request.action === "finish" ? { transcript: "recognized words" } : {}),
      },
    };
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Hex client audio", () => {
  it("keeps uploads and cleanup on the original host after the PWA switches hosts", async () => {
    remote.mockReturnValue(true);
    const nextHost = {
      callRemoteProcedure:
        vi.fn<(name: string, request: HexVoiceRequest) => Promise<HexVoiceResponse>>(),
    };
    const originalHost = {
      callRemoteProcedure: vi.fn<
        (name: string, request: HexVoiceRequest) => Promise<HexVoiceResponse>
      >(async (_name, request) => {
        if (request.action === "begin") getRemoteClient.mockReturnValue(nextHost);
        return call(request);
      }),
    };
    getRemoteClient.mockReturnValue(originalHost);

    await expect(transcribeHexVoice(new Float32Array([0.5]), selection())).resolves.toBe(
      "recognized words",
    );
    expect(
      originalHost.callRemoteProcedure.mock.calls.map(([, request]) => request.action),
    ).toEqual(["list", "begin", "append", "finish", "cancel"]);
    expect(nextHost.callRemoteProcedure).not.toHaveBeenCalled();
  });

  it("refuses a remote operation without a connected host", async () => {
    remote.mockReturnValue(true);
    await expect(transcribeHexVoice(new Float32Array([0.5]), selection())).rejects.toMatchObject({
      code: "disconnected",
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("binds a session to the host selected before capture", async () => {
    remote.mockReturnValue(true);
    const originalHost = {
      callRemoteProcedure: vi.fn<
        (name: string, request: HexVoiceRequest) => Promise<HexVoiceResponse>
      >(async (_name, request) => call(request)),
    };
    const nextHost = {
      callRemoteProcedure:
        vi.fn<(name: string, request: HexVoiceRequest) => Promise<HexVoiceResponse>>(),
    };
    getRemoteClient.mockReturnValue(originalHost);
    const session = createHexVoiceSession();
    getRemoteClient.mockReturnValue(nextHost);

    await expect(session.transcribe(new Float32Array([0.5]), selection())).resolves.toBe(
      "recognized words",
    );
    expect(originalHost.callRemoteProcedure).toHaveBeenCalled();
    expect(nextHost.callRemoteProcedure).not.toHaveBeenCalled();
  });

  it("checks verified installation and language without preparing or downloading", async () => {
    call.mockImplementationOnce(async () => ({
      kind: "catalog",
      models: [
        {
          id: "parakeet_v3",
          name: "Parakeet v3",
          installed: false,
          verified: false,
          downloadBytes: 10,
          languages: ["ru"],
          supportsLanguageDetection: false,
        },
      ],
    }));
    await expect(
      createHexVoiceSession().checkReady("parakeet_v3", "ru", new AbortController().signal),
    ).rejects.toMatchObject({ code: "not_ready" });
    expect(call.mock.calls.map(([request]) => request.action)).toEqual(["list"]);
  });

  it("encodes bounded mono PCM16 WAV and rejects invalid samples", () => {
    const wav = encodeVoiceWav(new Float32Array([-2, -0.5, 0, 0.5, 2]));
    const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(10);
    expect([0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
      -32768, -16384, 0, 16384, 32767,
    ]);
    expect(() => encodeVoiceWav(new Float32Array([NaN]))).toThrow(/voice request is invalid/i);
    expect(() => encodeVoiceWav(new Float32Array())).toThrow(/voice request is invalid/i);
    expect(() => encodeVoiceWav(new Float32Array(HEX_VOICE_MAX_AUDIO_BYTES / 2))).toThrow(
      /voice request is invalid/i,
    );
  });

  it("uploads ordered bounded chunks to the selected model and returns the transcript", async () => {
    const samples = new Float32Array(HEX_VOICE_CHUNK_BYTES).fill(0.25);
    await expect(transcribeHexVoice(samples, selection())).resolves.toBe("recognized words");
    const requests = call.mock.calls.map(([request]) => request);
    expect(requests[0]?.action).toBe("list");
    expect(requests[1]).toMatchObject({ action: "begin", model: "parakeet_v3", language: "ru" });
    const uploads = requests.filter((request) => request.action === "append");
    expect(uploads.map((request) => request.offset)).toEqual([
      0,
      HEX_VOICE_CHUNK_BYTES,
      HEX_VOICE_CHUNK_BYTES * 2,
    ]);
    const decoded = uploads.map((request) =>
      Uint8Array.from(atob(request.audioBase64), (char) => char.charCodeAt(0)),
    );
    const joined = new Uint8Array(decoded.reduce((size, chunk) => size + chunk.length, 0));
    let offset = 0;
    for (const chunk of decoded) {
      expect(chunk.length).toBeLessThanOrEqual(HEX_VOICE_CHUNK_BYTES);
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    expect(joined).toEqual(encodeVoiceWav(samples));
    expect(requests.at(-1)?.action).toBe("cancel");
  });

  it("polls preparation progress without sending audio", async () => {
    vi.useFakeTimers();
    const progress = vi.fn<(job: HexVoiceJob) => void>();
    const operation = prepareHexVoiceModel({ ...selection(), onProgress: progress });
    await vi.advanceTimersByTimeAsync(500);
    await operation;
    expect(progress.mock.calls.map(([job]) => job.phase)).toEqual([
      "preparing",
      "preparing",
      "done",
    ]);
    expect(call.mock.calls.some(([request]) => request.action === "append")).toBe(false);
  });

  it("cancels the same owner job even when aborted during begin", async () => {
    let resolve!: (response: HexVoiceResponse) => void;
    call.mockImplementationOnce(async () => ({
      kind: "catalog",
      models: [
        {
          id: "parakeet_v3",
          name: "Parakeet v3",
          installed: true,
          verified: true,
          downloadBytes: null,
          languages: ["ru"],
          supportsLanguageDetection: false,
        },
      ],
    }));
    call.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const abort = new AbortController();
    const operation = transcribeHexVoice(new Float32Array([0.5]), {
      ...selection(),
      signal: abort.signal,
    });
    await vi.waitFor(() => expect(call.mock.calls.length).toBeGreaterThan(1));
    const request = call.mock.calls[1]![0];
    if (request.action !== "begin") throw new Error("expected begin");
    abort.abort();
    resolve({ kind: "job", job: { id: request.id, phase: "uploading" } });
    await expect(operation).rejects.toMatchObject({ code: "cancelled" });
    expect(call).toHaveBeenCalledWith({ action: "cancel", id: request.id });
    expect(call.mock.calls.some(([value]) => value.action === "append")).toBe(false);
  });

  it("reports the internal audio deadline as timeout, not user cancellation", async () => {
    const audioDeadline = new AbortController();
    const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((milliseconds) =>
        milliseconds === 240_000 ? audioDeadline.signal : originalTimeout(milliseconds),
      );
    let resolveBegin!: (response: HexVoiceResponse) => void;
    call.mockImplementationOnce(async () => ({
      kind: "catalog",
      models: [
        {
          id: "parakeet_v3",
          name: "Parakeet v3",
          installed: true,
          verified: true,
          downloadBytes: null,
          languages: ["ru"],
          supportsLanguageDetection: false,
        },
      ],
    }));
    call.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBegin = resolve;
        }),
    );
    const operation = transcribeHexVoice(new Float32Array([0.5]), selection());
    await vi.waitFor(() => expect(resolveBegin).toBeTypeOf("function"));
    audioDeadline.abort();
    const begin = call.mock.calls.find(([request]) => request.action === "begin")?.[0];
    if (!begin || begin.action !== "begin") throw new Error("expected begin");
    resolveBegin({ kind: "job", job: { id: begin.id, phase: "uploading" } });
    await expect(operation).rejects.toMatchObject({ code: "timeout" });
    timeoutSpy.mockRestore();
  });

  it("surfaces unavailable and not-ready errors without silently switching backend", async () => {
    call.mockResolvedValueOnce({ kind: "error", code: "unavailable" });
    await expect(listHexVoiceModels("en")).rejects.toMatchObject({ code: "unavailable" });
    call.mockResolvedValueOnce({ kind: "error", code: "not_ready" });
    await expect(transcribeHexVoice(new Float32Array([0.5]), selection())).rejects.toMatchObject({
      code: "not_ready",
    });
  });
});
