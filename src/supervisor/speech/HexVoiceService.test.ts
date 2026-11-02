import { HexError, type CreateOptions, type HexHost } from "@kitlangton/hex";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HEX_VOICE_CHUNK_BYTES, HEX_VOICE_MAX_AUDIO_BYTES } from "@/shared/contracts/hexVoice";
import { HexVoiceService } from "./HexVoiceService";

const model = {
  id: "parakeet_v3" as const,
  name: "Parakeet v3",
  installed: true,
  verified: true,
  managed: true,
  downloadBytes: null,
  languages: ["en", "de"],
  supportsLanguageDetection: false,
};

function bytesBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function wav(data = new Uint8Array([0, 0])): Uint8Array {
  const bytes = new Uint8Array(44 + data.length);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1)
      bytes[offset + index] = value.charCodeAt(index);
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, data.length, true);
  bytes.set(data, 44);
  return bytes;
}

function fakeHost(
  options: {
    ready?: boolean;
    createDelay?: Promise<never>;
    listDelay?: Promise<void>;
  } = {},
) {
  const close = vi.fn<() => Promise<void>>(async () => {});
  const client = {
    models: {
      list: vi.fn<(...args: unknown[]) => Promise<(typeof model)[]>>(async () => {
        await options.listDelay;
        return [{ ...model, installed: options.ready ?? true }];
      }),
      prepare: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
    },
    transcribe: vi.fn<(...args: unknown[]) => Promise<{ transcript: string; durationMs: number }>>(
      async () => ({ transcript: "native words", durationMs: 1 }),
    ),
  };
  const create = vi.fn<(options: CreateOptions) => Promise<HexHost>>(async () => {
    if (options.createDelay) return options.createDelay;
    return { client, close } as unknown as HexHost;
  });
  return { create, client, close };
}

const id = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const thirdId = "33333333-3333-4333-8333-333333333333";

describe("HexVoiceService", () => {
  let service: HexVoiceService;

  afterEach(async () => {
    await service?.dispose();
    vi.useRealTimers();
  });

  it("discovers the helper catalog and prepares a selected model explicitly", async () => {
    const host = fakeHost();
    service = new HexVoiceService({ executable: () => "/usr/bin/hex", create: host.create });
    await expect(service.handle({ action: "list", language: "en" })).resolves.toMatchObject({
      kind: "catalog",
      models: [{ id: "parakeet_v3", installed: true }],
    });
    const preparing = await service.handle({
      action: "prepare",
      id,
      model: "parakeet_v3",
      language: "en",
    });
    expect(preparing).toMatchObject({ kind: "job", job: { id, phase: "preparing" } });
    await vi.waitFor(async () => {
      await expect(service.handle({ action: "status", id })).resolves.toMatchObject({
        kind: "job",
        job: { phase: "done", progress: 100 },
      });
    });
    expect(host.client.models.prepare).toHaveBeenCalledWith(
      "parakeet_v3",
      expect.objectContaining({ language: "en" }),
    );
    expect(host.close).toHaveBeenCalled();
  });

  it("returns unavailable and not_ready without accepting an unverified model", async () => {
    const unavailable = new HexVoiceService({ executable: () => undefined });
    await expect(unavailable.handle({ action: "list", language: "en" })).resolves.toEqual({
      kind: "error",
      code: "unavailable",
    });
    await unavailable.dispose();

    const host = fakeHost({ ready: false });
    service = new HexVoiceService({ executable: () => "/usr/bin/hex", create: host.create });
    await expect(
      service.handle({ action: "begin", id, model: "parakeet_v3", language: "en" }),
    ).resolves.toMatchObject({
      kind: "error",
      code: "not_ready",
    });
    expect(host.close).toHaveBeenCalled();
  });

  it("rejects odd-length PCM16 WAV payloads", async () => {
    const host = fakeHost();
    service = new HexVoiceService({ executable: () => "/usr/bin/hex", create: host.create });
    await service.handle({ action: "begin", id: thirdId, model: "parakeet_v3", language: "en" });
    await service.handle({
      action: "append",
      id: thirdId,
      offset: 0,
      audioBase64: bytesBase64(wav(new Uint8Array([1]))),
    });
    await expect(service.handle({ action: "finish", id: thirdId })).resolves.toEqual({
      kind: "error",
      code: "invalid_request",
    });
  });

  it("enforces owner ordering, upload bounds, and canonical WAV validation", async () => {
    const host = fakeHost();
    service = new HexVoiceService({ executable: () => "/usr/bin/hex", create: host.create });
    await service.handle({ action: "begin", id, model: "parakeet_v3", language: "en" });
    await expect(
      service.handle({ action: "append", id, offset: 1, audioBase64: "AA==" }),
    ).resolves.toEqual({
      kind: "error",
      code: "invalid_request",
    });
    await expect(
      service.handle({ action: "append", id, offset: 0, audioBase64: bytesBase64(wav()) }),
    ).resolves.toMatchObject({
      kind: "job",
      job: { phase: "uploading" },
    });
    await expect(service.handle({ action: "finish", id })).resolves.toMatchObject({
      kind: "job",
      job: { phase: "loading" },
    });
    await vi.waitFor(async () => {
      await expect(service.handle({ action: "status", id })).resolves.toMatchObject({
        kind: "job",
        job: { phase: "done", transcript: "native words" },
      });
    });

    const malformed = await service.handle({
      action: "begin",
      id: secondId,
      model: "parakeet_v3",
      language: "en",
    });
    expect(malformed).toMatchObject({ kind: "job" });
    const chunk = new Uint8Array(HEX_VOICE_CHUNK_BYTES);
    const fullChunk = bytesBase64(chunk);
    let offset = 0;
    while (offset + chunk.length <= HEX_VOICE_MAX_AUDIO_BYTES) {
      await expect(
        service.handle({ action: "append", id: secondId, offset, audioBase64: fullChunk }),
      ).resolves.toMatchObject({ kind: "job", job: { phase: "uploading" } });
      offset += chunk.length;
    }
    const remainder = HEX_VOICE_MAX_AUDIO_BYTES - offset;
    await expect(
      service.handle({
        action: "append",
        id: secondId,
        offset,
        audioBase64: bytesBase64(new Uint8Array(remainder)),
      }),
    ).resolves.toMatchObject({ kind: "job", job: { phase: "uploading" } });
    await expect(
      service.handle({
        action: "append",
        id: secondId,
        offset: HEX_VOICE_MAX_AUDIO_BYTES,
        audioBase64: bytesBase64(new Uint8Array([0])),
      }),
    ).resolves.toMatchObject({
      kind: "error",
      code: "invalid_request",
    });
    await service.handle({ action: "cancel", id: secondId });

    const malformedId = "33333333-3333-4333-8333-333333333333";
    await service.handle({
      action: "begin",
      id: malformedId,
      model: "parakeet_v3",
      language: "en",
    });
    await service.handle({
      action: "append",
      id: malformedId,
      offset: 0,
      audioBase64: bytesBase64(wav(new Uint8Array([0]))),
    });
    await expect(service.handle({ action: "finish", id: malformedId })).resolves.toEqual({
      kind: "error",
      code: "invalid_request",
    });
    await service.handle({ action: "cancel", id: malformedId });
  });

  it("retains detached preparation in setup without exposing active audio IDs", async () => {
    const host = fakeHost();
    service = new HexVoiceService({ executable: () => "/usr/bin/hex", create: host.create });
    await service.handle({ action: "prepare", id, model: "parakeet_v3", language: "en" });

    await vi.waitFor(async () => {
      await expect(service.handle({ action: "setup" })).resolves.toMatchObject({
        kind: "setup",
        setup: { preparation: { id, phase: "done" } },
      });
    });

    const audioId = "33333333-3333-4333-8333-333333333333";
    await expect(
      service.handle({ action: "begin", id: audioId, model: "parakeet_v3", language: "en" }),
    ).resolves.toMatchObject({ kind: "job", job: { id: audioId } });
    const snapshot = await service.handle({ action: "setup" });
    expect(JSON.stringify(snapshot)).not.toContain(audioId);
    expect(snapshot).toMatchObject({
      kind: "setup",
      setup: { preparation: { id, phase: "done" } },
    });
    await service.handle({ action: "cancel", id: audioId });
  });

  it("returns busy while a helper is active and cancels during startup without leaking it", async () => {
    const host = fakeHost();
    service = new HexVoiceService({ executable: () => "/usr/bin/hex", create: host.create });
    await service.handle({ action: "begin", id, model: "parakeet_v3", language: "en" });
    await expect(
      service.handle({ action: "begin", id: secondId, model: "parakeet_v3", language: "en" }),
    ).resolves.toEqual({
      kind: "error",
      code: "busy",
    });
    await expect(service.handle({ action: "cancel", id })).resolves.toEqual({ kind: "cancelled" });
    await expect(
      service.handle({ action: "begin", id: secondId, model: "parakeet_v3", language: "en" }),
    ).resolves.toMatchObject({
      kind: "job",
      job: { id: secondId },
    });

    let rejectCreate!: (error: Error) => void;
    const delayed = new Promise<never>((_, reject) => {
      rejectCreate = reject;
    });
    const pendingHost = fakeHost({ createDelay: delayed });
    const startupService = new HexVoiceService({
      executable: () => "/usr/bin/hex",
      create: pendingHost.create,
    });
    const begin = startupService.handle({
      action: "begin",
      id,
      model: "parakeet_v3",
      language: "en",
    });
    await Promise.resolve();
    const cancel = startupService.handle({ action: "cancel", id });
    rejectCreate(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    await expect(cancel).resolves.toEqual({ kind: "cancelled" });
    await expect(begin).resolves.toMatchObject({ kind: "error" });
    await startupService.dispose();
  });

  it("times out startup and waits for helper close during disposal", async () => {
    vi.useFakeTimers();
    const timedOutService = new HexVoiceService({
      executable: () => "/usr/bin/hex",
      create: ({ signal }: CreateOptions): Promise<HexHost> =>
        new Promise((_, reject) => {
          if (!signal) throw new Error("expected abort signal");
          signal.addEventListener(
            "abort",
            () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            { once: true },
          );
        }),
    });
    const beginning = timedOutService.handle({
      action: "begin",
      id,
      model: "parakeet_v3",
      language: "en",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(beginning).resolves.toEqual({ kind: "error", code: "timeout" });
    await timedOutService.dispose();
    vi.useRealTimers();

    let closeHelper!: () => void;
    const closePromise = new Promise<void>((resolve) => {
      closeHelper = resolve;
    });
    const host = fakeHost();
    host.close.mockImplementation(() => closePromise);
    service = new HexVoiceService({ executable: () => "/usr/bin/hex", create: host.create });
    await service.handle({ action: "begin", id, model: "parakeet_v3", language: "en" });
    let disposed = false;
    const disposing = service.dispose().then(() => {
      disposed = true;
    });
    await Promise.resolve();
    expect(disposed).toBe(false);
    closeHelper();
    await disposing;
    expect(disposed).toBe(true);
  });

  it("serializes catalog work with jobs and waits for helper shutdown when cancelled", async () => {
    let finishList!: () => void;
    const listDelay = new Promise<void>((resolve) => {
      finishList = resolve;
    });
    const host = fakeHost({ listDelay });
    service = new HexVoiceService({ executable: () => "/usr/bin/hex", create: host.create });
    const listing = service.handle({ action: "list", language: "en" });
    await vi.waitFor(() => expect(host.client.models.list).toHaveBeenCalledTimes(1));
    await expect(service.handle({ action: "list", language: "de" })).resolves.toEqual({
      kind: "error",
      code: "busy",
    });
    await expect(
      service.handle({ action: "begin", id, model: "parakeet_v3", language: "en" }),
    ).resolves.toEqual({ kind: "error", code: "busy" });
    finishList();
    await expect(listing).resolves.toMatchObject({ kind: "catalog" });

    let closeHelper!: () => void;
    const closePromise = new Promise<void>((resolve) => {
      closeHelper = resolve;
    });
    const closingHost = fakeHost();
    closingHost.close.mockImplementation(() => closePromise);
    service = new HexVoiceService({
      executable: () => "/usr/bin/hex",
      create: closingHost.create,
    });
    await service.handle({
      action: "prepare",
      id,
      model: "parakeet_v3",
      language: "en",
    });
    await vi.waitFor(async () => {
      await expect(service.handle({ action: "status", id })).resolves.toMatchObject({
        kind: "job",
        job: { phase: "done" },
      });
    });
    let cancelled = false;
    const cancelling = service.handle({ action: "cancel", id }).then((result) => {
      cancelled = true;
      return result;
    });
    await Promise.resolve();
    expect(cancelled).toBe(false);
    finishList(); // Resolving the already-finished catalog gate is harmless.
    closeHelper();
    await expect(cancelling).resolves.toEqual({ kind: "cancelled" });
    expect(cancelled).toBe(true);
  });

  it("keeps competing work busy while managed-engine removal is pending", async () => {
    let finishRemoval!: () => void;
    const removal = new Promise<void>((resolve) => {
      finishRemoval = resolve;
    });
    const installer = {
      cancelInstall: vi.fn<() => Promise<void>>(async () => {}),
      removeManagedEngine: vi.fn<() => Promise<void>>(() => removal),
      snapshot: () => ({
        state: "missing",
        source: null,
        version: null,
        availableVersion: "3.1.1",
        downloadBytes: null,
      }),
      managedExecutable: undefined,
      isInstalling: false,
    };
    service = new HexVoiceService({ installer: installer as never });
    const removing = service.handle({ action: "remove_engine" });
    await Promise.resolve();
    expect(installer.removeManagedEngine).toHaveBeenCalledTimes(1);
    await expect(service.handle({ action: "list", language: "en" })).resolves.toEqual({
      kind: "error",
      code: "busy",
    });
    await expect(
      service.handle({ action: "begin", id, model: "parakeet_v3", language: "en" }),
    ).resolves.toEqual({ kind: "error", code: "busy" });
    await expect(
      service.handle({ action: "prepare", id, model: "parakeet_v3", language: "en" }),
    ).resolves.toEqual({ kind: "error", code: "busy" });
    await expect(service.handle({ action: "install" })).resolves.toEqual({
      kind: "error",
      code: "busy",
    });
    finishRemoval();
    await expect(removing).resolves.toMatchObject({ kind: "setup" });
    await expect(service.handle({ action: "list", language: "en" })).resolves.toEqual({
      kind: "error",
      code: "unavailable",
    });
  });

  it("maps known SDK protocol and nested permission errors safely", async () => {
    const incompatible = new HexVoiceService({
      executable: () => "/usr/bin/hex",
      create: async () => {
        throw new HexError("invalid-handshake", "raw stderr must not escape");
      },
    });
    await expect(incompatible.handle({ action: "list", language: "en" })).resolves.toEqual({
      kind: "error",
      code: "incompatible",
    });
    await incompatible.dispose();

    const permission = new HexVoiceService({
      executable: () => "/usr/bin/hex",
      create: async () => {
        throw new Error("startup", { cause: Object.assign(new Error(), { code: "EACCES" }) });
      },
    });
    await expect(permission.handle({ action: "list", language: "en" })).resolves.toEqual({
      kind: "error",
      code: "permission_denied",
    });
    await permission.dispose();
  });
});
