import { msg } from "@lingui/core/macro";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { getRemoteBridgeClient } from "@/renderer/browser/remoteBridge";
import { i18n } from "@/renderer/i18n/i18n";
import { isRemoteTransportFailure, RemoteClientError } from "@/shared/remote/clientErrors";
import {
  HEX_VOICE_CHUNK_BYTES,
  HEX_VOICE_MAX_AUDIO_BYTES,
  HEX_VOICE_SAMPLE_RATE,
  hexVoiceResponseSchema,
  type HexVoiceErrorCode,
  type HexVoiceJob,
  type HexVoiceModel,
  type HexVoiceRequest,
  type HexVoiceResponse,
  type HexVoiceSetup,
} from "@/shared/contracts/hexVoice";

export class HexVoiceError extends Error {
  constructor(readonly code: HexVoiceErrorCode) {
    const messages = {
      unavailable: msg`Hex is unavailable on this host. Install a compatible Hex executable and restart Poracode, or choose the built-in backend.`,
      busy: msg`Hex is busy with another voice request. Try again shortly.`,
      invalid_request: msg`The voice request is invalid or has expired. Please try again.`,
      not_ready: msg`Prepare the selected Hex model in Audio settings before recording.`,
      failed: msg`Hex could not process this request. Check the model and language in Audio settings.`,
      cancelled: msg`Voice transcription cancelled.`,
      timeout: msg`Hex timed out. Please try again.`,
      disconnected: msg`The connected Poracode host is unavailable. Reconnect and try again.`,
      incompatible: msg`The Hex engine is incompatible with this host or Poracode version.`,
      unsupported: msg`Managed Hex installation is not available on this host.`,
      download_failed: msg`The Hex engine download failed. Check your connection and try again.`,
      integrity: msg`The downloaded Hex engine failed its integrity or signature check.`,
      permission_denied: msg`Poracode does not have permission to install or run the Hex engine.`,
    };
    super(i18n._(messages[code]));
    this.name = "HexVoiceError";
  }
}

type HexVoiceCall = (request: HexVoiceRequest) => Promise<HexVoiceResponse>;

function remoteCallErrorCode(error: unknown): HexVoiceErrorCode {
  if (error instanceof RemoteClientError) {
    if (
      error.status === 404 ||
      error.code === "procedure_not_found" ||
      /unknown (?:remote )?procedure|procedure .* not found/i.test(error.message)
    ) {
      return "incompatible";
    }
  }
  return isRemoteTransportFailure(error) ? "disconnected" : "failed";
}

function captureHostCall(client = getRemoteBridgeClient()): HexVoiceCall {
  const bridge = readBridge();
  const remote = isRemoteSession();
  const hostClient = remote ? client : null;
  if (remote && !hostClient) {
    return async () => {
      throw new HexVoiceError("disconnected");
    };
  }
  const localCall = bridge?.hexVoice;
  if (!hostClient && !localCall) {
    return async () => {
      throw new HexVoiceError("unavailable");
    };
  }
  return async (request) => {
    let raw: unknown;
    try {
      raw = hostClient
        ? await hostClient.callRemoteProcedure("hexVoice", request)
        : await localCall!(request);
    } catch (error) {
      throw new HexVoiceError(hostClient ? remoteCallErrorCode(error) : "unavailable");
    }
    let result: HexVoiceResponse;
    try {
      result = hexVoiceResponseSchema.parse(raw);
    } catch {
      throw new HexVoiceError("incompatible");
    }
    if (result.kind === "error") throw new HexVoiceError(result.code);
    return result;
  };
}

function delay(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new HexVoiceError("cancelled"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 400);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

export interface HexVoiceTranscriptionOptions {
  model: string;
  language: string;
  signal: AbortSignal;
  onProgress?: (job: HexVoiceJob) => void;
}

export interface HexVoiceSession {
  setup(): Promise<HexVoiceSetup>;
  install(): Promise<HexVoiceSetup>;
  cancelInstall(): Promise<HexVoiceSetup>;
  removeEngine(): Promise<HexVoiceSetup>;
  list(language: string): Promise<HexVoiceModel[]>;
  prepare(model: string, language: string): Promise<void>;
  cancelPreparation(id: string): Promise<void>;
  checkReady(model: string, language: string, signal: AbortSignal): Promise<void>;
  transcribe(samples: Float32Array, options: HexVoiceTranscriptionOptions): Promise<string>;
}

function setupResult(result: HexVoiceResponse): HexVoiceSetup {
  if (result.kind !== "setup") throw new HexVoiceError("failed");
  return result.setup;
}

function jobResult(result: HexVoiceResponse, id: string): HexVoiceJob {
  if (result.kind !== "job" || result.job.id !== id) throw new HexVoiceError("failed");
  return result.job;
}

export function createHexVoiceSession(client = getRemoteBridgeClient()): HexVoiceSession {
  const call = captureHostCall(client);
  const list = async (language: string): Promise<HexVoiceModel[]> => {
    const result = await call({ action: "list", language });
    if (result.kind !== "catalog") throw new HexVoiceError("failed");
    return result.models;
  };
  const setup = async (): Promise<HexVoiceSetup> => setupResult(await call({ action: "setup" }));
  const engineAction = async (
    action: "install" | "cancel_install" | "remove_engine",
  ): Promise<HexVoiceSetup> => setupResult(await call({ action }));
  const prepare = async (model: string, language: string): Promise<void> => {
    const id = crypto.randomUUID();
    jobResult(await call({ action: "prepare", id, model, language }), id);
  };
  const cancelPreparation = async (id: string): Promise<void> => {
    const result = await call({ action: "cancel", id });
    if (result.kind !== "cancelled") throw new HexVoiceError("failed");
  };
  const checkReady = async (
    model: string,
    language: string,
    signal: AbortSignal,
  ): Promise<void> => {
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
    if (boundedSignal.aborted) {
      throw new HexVoiceError(signal.aborted ? "cancelled" : "timeout");
    }
    let abortListener: (() => void) | undefined;
    try {
      const models = await Promise.race([
        list(language),
        new Promise<never>((_, reject) => {
          abortListener = () => reject(new HexVoiceError(signal.aborted ? "cancelled" : "timeout"));
          boundedSignal.addEventListener("abort", abortListener, { once: true });
          if (boundedSignal.aborted) abortListener();
        }),
      ]);
      if (boundedSignal.aborted) {
        throw new HexVoiceError(signal.aborted ? "cancelled" : "timeout");
      }
      const selected = models.find((candidate) => candidate.id === model);
      if (
        !selected ||
        !selected.installed ||
        !selected.verified ||
        !selected.languages.some((candidate) => candidate.toLowerCase() === language.toLowerCase())
      ) {
        throw new HexVoiceError("not_ready");
      }
    } catch (error) {
      if (error instanceof HexVoiceError) throw error;
      throw new HexVoiceError(
        boundedSignal.aborted ? (signal.aborted ? "cancelled" : "timeout") : "failed",
      );
    } finally {
      if (abortListener) boundedSignal.removeEventListener("abort", abortListener);
    }
  };
  const transcribe = async (
    samples: Float32Array,
    options: HexVoiceTranscriptionOptions,
  ): Promise<string> => {
    await checkReady(options.model, options.language, options.signal);
    return runTrackedJob(call, options, encodeVoiceWav(samples));
  };
  return Object.freeze({
    setup,
    install: () => engineAction("install"),
    cancelInstall: () => engineAction("cancel_install"),
    removeEngine: () => engineAction("remove_engine"),
    list,
    prepare,
    cancelPreparation,
    checkReady,
    transcribe,
  });
}

async function runTrackedJob(
  call: HexVoiceCall,
  options: HexVoiceTranscriptionOptions,
  audio?: Uint8Array,
): Promise<string> {
  const id = crypto.randomUUID();
  const signal = audio
    ? AbortSignal.any([options.signal, AbortSignal.timeout(240_000)])
    : AbortSignal.any([options.signal, AbortSignal.timeout(1_260_000)]);
  const cancel = () => {
    void call({ action: "cancel", id }).catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const check = () => {
    if (signal.aborted) throw new HexVoiceError(options.signal.aborted ? "cancelled" : "timeout");
  };
  try {
    check();
    let result = await call({
      action: audio ? "begin" : "prepare",
      id,
      model: options.model,
      language: options.language,
    });
    check();
    options.onProgress?.(jobResult(result, id));
    if (audio) {
      for (let offset = 0; offset < audio.length; offset += HEX_VOICE_CHUNK_BYTES) {
        check();
        const chunk = audio.subarray(offset, offset + HEX_VOICE_CHUNK_BYTES);
        let binary = "";
        for (const byte of chunk) binary += String.fromCharCode(byte);
        const end = offset + chunk.length;
        jobResult(await call({ action: "append", id, offset, audioBase64: btoa(binary) }), id);
        options.onProgress?.({
          id,
          phase: "uploading",
          progress: Math.min(100, (end / audio.length) * 100),
        });
      }
      check();
      result = await call({ action: "finish", id });
    }
    for (;;) {
      check();
      if (result.kind !== "job" || result.job.id !== id) throw new HexVoiceError("failed");
      options.onProgress?.(result.job);
      if (result.job.phase === "done") return result.job.transcript ?? "";
      await delay(signal);
      result = await call({ action: "status", id });
    }
  } catch (error) {
    check();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    // Also covers failures during upload and cancellation during the begin RPC.
    await call({ action: "cancel", id }).catch(() => {});
  }
}

export function prepareHexVoiceModel(options: HexVoiceTranscriptionOptions): Promise<string> {
  return runTrackedJob(captureHostCall(), options);
}

export function encodeVoiceWav(samples: Float32Array): Uint8Array {
  const size = samples.length * 2 + 44;
  if (samples.length === 0 || size > HEX_VOICE_MAX_AUDIO_BYTES) {
    throw new HexVoiceError("invalid_request");
  }
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, size - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, HEX_VOICE_SAMPLE_RATE, true);
  view.setUint32(28, HEX_VOICE_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, size - 44, true);
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i]!;
    if (!Number.isFinite(value)) throw new HexVoiceError("invalid_request");
    const clipped = Math.max(-1, Math.min(1, value));
    view.setInt16(44 + i * 2, Math.round(clipped * (clipped < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

export function transcribeHexVoice(
  samples: Float32Array,
  options: HexVoiceTranscriptionOptions,
): Promise<string> {
  return createHexVoiceSession().transcribe(samples, options);
}

export function listHexVoiceModels(language: string): Promise<HexVoiceModel[]> {
  return createHexVoiceSession().list(language);
}
