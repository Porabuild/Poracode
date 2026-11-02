import { hostname } from "node:os";
import * as Hex from "@kitlangton/hex";
import type { CreateOptions, HexHost, ModelId, ModelInfo, ModelProgress } from "@kitlangton/hex";
import {
  HEX_VOICE_MAX_AUDIO_BYTES,
  hexVoiceRequestSchema,
  hexVoiceResponseSchema,
  type HexVoicePreparation,
  type HexVoiceErrorCode,
  type HexVoiceJob,
  type HexVoiceModel,
  type HexVoiceRequest,
  type HexVoiceResponse,
  type HexVoiceSetup,
} from "@/shared/contracts/hexVoice";
import {
  HEX_ENGINE_VERSION,
  externalHexExecutable,
  HexEngineInstaller,
  type HexEngineSnapshot,
} from "./HexEngineInstaller";

const STARTUP_TIMEOUT_MS = 15_000;
const UPLOAD_IDLE_TIMEOUT_MS = 60_000;
const PREPARATION_TIMEOUT_MS = 20 * 60_000;
const INFERENCE_TIMEOUT_MS = 3 * 60_000;
const RETENTION_MS = 60_000;

type HexHostLike = Pick<HexHost, "client" | "close">;
type HexCreate = (options: CreateOptions) => Promise<HexHostLike>;

export interface HexVoiceServiceOptions {
  readonly create?: HexCreate;
  readonly executable?: () => string | undefined;
  readonly pathExecutable?: () => string | undefined;
  readonly managedDirectory?: string;
  readonly installer?: HexEngineInstaller;
  readonly now?: () => number;
}

interface VoiceJob {
  readonly id: string;
  readonly model: string;
  readonly language: string;
  readonly controller: AbortController;
  readonly settled: Promise<void>;
  readonly resolveSettled: () => void;
  readonly kind: "audio" | "preparation";
  phase: HexVoiceJob["phase"];
  progress?: number;
  transcript?: string;
  audio?: Uint8Array;
  expectedOffset: number;
  host?: HexHostLike;
  idleTimer?: ReturnType<typeof setTimeout>;
  retentionTimer?: ReturnType<typeof setTimeout>;
  retainedUntil: number;
  error?: HexVoiceErrorCode;
  cancelRequested: boolean;
  timedOut: boolean;
  cleanupStarted: boolean;
  operation?: Promise<void>;
}

function isAbort(error: unknown): boolean {
  return (
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "CancellationError")) ||
    (error !== null && typeof error === "object" && "code" in error && error.code === "cancelled")
  );
}

function modelSupportsLanguage(model: ModelInfo, language: string): boolean {
  return model.languages.some((candidate) => candidate.toLowerCase() === language.toLowerCase());
}

function toModel(model: ModelInfo): HexVoiceModel {
  return {
    id: model.id,
    name: model.name,
    installed: model.installed,
    verified: model.verified,
    downloadBytes: model.downloadBytes,
    languages: [...model.languages],
    supportsLanguageDetection: model.supportsLanguageDetection,
  };
}

function decodeBase64(value: string): Uint8Array | undefined {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    let canonical = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      canonical += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    if (btoa(canonical) !== value) return undefined;
    return bytes;
  } catch {
    return undefined;
  }
}

function validWav(audio: Uint8Array): boolean {
  if (audio.length < 44) return false;
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const text = (offset: number, expected: string): boolean =>
    expected
      .split("")
      .every((character, index) => audio[offset + index] === character.charCodeAt(0));
  return (
    text(0, "RIFF") &&
    text(8, "WAVE") &&
    text(12, "fmt ") &&
    view.getUint32(16, true) === 16 &&
    view.getUint16(20, true) === 1 &&
    view.getUint16(22, true) === 1 &&
    view.getUint32(24, true) === 16_000 &&
    view.getUint32(28, true) === 32_000 &&
    view.getUint16(32, true) === 2 &&
    view.getUint16(34, true) === 16 &&
    text(36, "data") &&
    view.getUint32(40, true) > 0 &&
    view.getUint32(40, true) % 2 === 0 &&
    view.getUint32(40, true) === audio.length - 44 &&
    view.getUint32(4, true) === audio.length - 8
  );
}

export class HexVoiceService {
  private readonly create: HexCreate;
  private readonly explicitExecutable: () => string | undefined;
  private readonly pathExecutable: () => string | undefined;
  private readonly installer: HexEngineInstaller | undefined;
  private readonly now: () => number;
  private removalOperation: Promise<void> | undefined;
  private readonly jobs = new Map<string, VoiceJob>();
  private readonly pending = new Map<AbortController, Promise<HexVoiceResponse>>();
  private latestPreparation: HexVoicePreparation | null = null;
  private active: VoiceJob | undefined;
  private disposed = false;

  constructor(options: HexVoiceServiceOptions = {}) {
    this.create = options.create ?? ((createOptions) => Hex.create(createOptions));
    this.explicitExecutable =
      options.executable ??
      (() => externalHexExecutable(process.env, process.platform, "").executable);
    this.pathExecutable =
      options.pathExecutable ??
      (() => externalHexExecutable({}, process.platform, process.env.PATH ?? "").executable);
    this.installer =
      options.installer ??
      (options.managedDirectory
        ? new HexEngineInstaller({ managedDirectory: options.managedDirectory })
        : undefined);
    this.now = options.now ?? Date.now;
  }

  async handle(input: unknown): Promise<HexVoiceResponse> {
    let request: HexVoiceRequest;
    try {
      request = hexVoiceRequestSchema.parse(input);
    } catch {
      return this.result({ kind: "error", code: "invalid_request" });
    }
    try {
      switch (request.action) {
        case "setup":
          return this.setup();
        case "install":
          return this.install();
        case "cancel_install":
          return await this.cancelInstall();
        case "remove_engine":
          return await this.removeEngine();
        case "list":
          return await this.list(request.language);
        case "prepare":
          return await this.prepare(request.id, request.model, request.language);
        case "begin":
          return await this.begin(request.id, request.model, request.language);
        case "append":
          return await this.append(request.id, request.offset, request.audioBase64);
        case "finish":
          return await this.finish(request.id);
        case "status":
          return this.status(request.id);
        case "cancel":
          return await this.cancel(request.id);
      }
    } catch (error) {
      return this.result({ kind: "error", code: this.errorCode(error) });
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const cancelInstall = this.installer?.cancelInstall();
    for (const controller of this.pending.keys()) controller.abort();
    const active = this.active;
    if (active) {
      active.cancelRequested = true;
      active.controller.abort();
      void this.failJob(active, "cancelled");
    }
    await Promise.all([
      ...this.pending.values(),
      ...(active?.operation ? [active.operation] : []),
      ...(active ? [active.settled] : []),
      ...(cancelInstall ? [cancelInstall] : []),
      ...(this.removalOperation ? [this.removalOperation] : []),
    ]);
    for (const job of this.jobs.values()) {
      if (job.retentionTimer) clearTimeout(job.retentionTimer);
      delete job.audio;
    }
    this.jobs.clear();
    this.active = undefined;
  }

  private result(response: HexVoiceResponse): HexVoiceResponse {
    return hexVoiceResponseSchema.parse(response);
  }

  private errorCode(error: unknown): HexVoiceErrorCode {
    if (error instanceof VoiceError) return error.code;
    if (Hex.isHexError(error)) {
      if (error.code === "incompatible-api" || error.code === "invalid-handshake") {
        return "incompatible";
      }
      if (error.code === "startup-timeout") return "timeout";
    }
    let nested: unknown = error;
    for (let depth = 0; depth < 4 && nested !== null && typeof nested === "object"; depth += 1) {
      if (
        "code" in nested &&
        ["EACCES", "EPERM", "EROFS", "ERR_ACCESS_DENIED"].includes(String(nested.code))
      ) {
        return "permission_denied";
      }
      nested = "cause" in nested ? nested.cause : undefined;
    }
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      [
        "unavailable",
        "busy",
        "invalid_request",
        "not_ready",
        "failed",
        "cancelled",
        "timeout",
        "disconnected",
        "incompatible",
        "unsupported",
        "download_failed",
        "integrity",
        "permission_denied",
      ].includes(error.code)
    ) {
      return error.code as HexVoiceErrorCode;
    }
    if (error instanceof Error && error.name === "TimeoutError") return "timeout";
    return "failed";
  }

  private setup(): HexVoiceResponse {
    const setup: HexVoiceSetup = {
      hostName: hostname(),
      platform: process.platform,
      arch: process.arch,
      engine: this.engineSnapshot(),
      preparation: this.latestPreparation,
    };
    return this.result({ kind: "setup", setup });
  }

  private engineSnapshot(): HexEngineSnapshot {
    const managedSnapshot: HexEngineSnapshot = this.installer?.snapshot() ?? {
      state: "missing",
      source: null,
      version: null,
      availableVersion: HEX_ENGINE_VERSION,
      downloadBytes: null,
    };
    if (this.installer?.isInstalling) return managedSnapshot;
    if (this.explicitExecutable()) {
      return {
        state: "installed",
        source: "external",
        version: null,
        availableVersion: HEX_ENGINE_VERSION,
        downloadBytes: managedSnapshot.downloadBytes,
      };
    }
    if (this.installer?.managedExecutable) return managedSnapshot;
    if (this.pathExecutable()) {
      return {
        state: "installed",
        source: "external",
        version: null,
        availableVersion: HEX_ENGINE_VERSION,
        downloadBytes: managedSnapshot.downloadBytes,
      };
    }
    return managedSnapshot;
  }

  private hasActiveOperation(): boolean {
    return Boolean(
      this.active || this.pending.size > 0 || this.installer?.isInstalling || this.removalOperation,
    );
  }

  private install(): HexVoiceResponse {
    if (this.hasActiveOperation()) return this.result({ kind: "error", code: "busy" });
    if (!this.installer) return this.result({ kind: "error", code: "unsupported" });
    try {
      this.installer.startInstall();
      return this.setup();
    } catch (error) {
      return this.result({ kind: "error", code: this.errorCode(error) });
    }
  }

  private async cancelInstall(): Promise<HexVoiceResponse> {
    await this.installer?.cancelInstall();
    return this.setup();
  }

  private async removeEngine(): Promise<HexVoiceResponse> {
    if (this.hasActiveOperation()) return this.result({ kind: "error", code: "busy" });
    if (!this.installer) return this.result({ kind: "error", code: "unsupported" });
    const removal = Promise.resolve().then(() => this.installer!.removeManagedEngine());
    this.removalOperation = removal;
    try {
      await removal;
      return this.setup();
    } catch (error) {
      return this.result({ kind: "error", code: this.errorCode(error) });
    } finally {
      if (this.removalOperation === removal) this.removalOperation = undefined;
    }
  }

  private resolveExecutable(): string | undefined {
    const explicit = this.explicitExecutable();
    if (explicit) return explicit;
    const managed = this.installer?.managedExecutable;
    if (managed) return managed;
    return this.pathExecutable();
  }

  private ensureAvailable(): string {
    if (this.disposed) throw new VoiceError("unavailable");
    const executable = this.resolveExecutable();
    if (!executable) throw new VoiceError("unavailable");
    return executable;
  }

  private async createHost(signal: AbortSignal): Promise<HexHostLike> {
    const executable = this.ensureAvailable();
    return this.create({
      command: [executable, "service", "--embedded"],
      signal,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
    });
  }

  private async list(language: string): Promise<HexVoiceResponse> {
    if (this.hasActiveOperation()) {
      return this.result({ kind: "error", code: "busy" });
    }
    const controller = new AbortController();
    const operation = this.listWithHost(language, controller);
    this.pending.set(controller, operation);
    try {
      return await operation;
    } finally {
      this.pending.delete(controller);
    }
  }

  private async listWithHost(
    language: string,
    controller: AbortController,
  ): Promise<HexVoiceResponse> {
    let host: HexHostLike | undefined;
    try {
      host = await this.withTimeout(
        () => this.createHost(controller.signal),
        controller,
        STARTUP_TIMEOUT_MS,
      );
      const models = await this.withTimeout(
        () => host!.client.models.list({ language, signal: controller.signal }),
        controller,
        STARTUP_TIMEOUT_MS,
      );
      return this.result({ kind: "catalog", models: models.map(toModel) });
    } catch (error) {
      if (controller.signal.aborted) {
        return this.result({ kind: "error", code: "timeout" });
      }
      return this.result({
        kind: "error",
        code: this.errorCode(error) === "failed" ? "unavailable" : this.errorCode(error),
      });
    } finally {
      await host?.close().catch(() => {});
    }
  }

  private makeJob(
    id: string,
    model: string,
    language: string,
    kind: VoiceJob["kind"] = "audio",
  ): VoiceJob {
    let resolveSettled!: () => void;
    const settled = new Promise<void>((resolve) => {
      resolveSettled = resolve;
    });
    const job: VoiceJob = {
      id,
      model,
      language,
      controller: new AbortController(),
      settled,
      resolveSettled,
      kind,
      phase: "uploading",
      expectedOffset: 0,
      retainedUntil: 0,
      cancelRequested: false,
      timedOut: false,
      cleanupStarted: false,
    };
    this.jobs.set(id, job);
    this.active = job;
    if (kind === "preparation") this.updatePreparation(job);
    return job;
  }

  private updatePreparation(job: VoiceJob): void {
    if (job.kind !== "preparation") return;
    this.latestPreparation = {
      id: job.id,
      model: job.model,
      language: job.language,
      phase: job.error ? "error" : job.phase === "done" ? "done" : "preparing",
      ...(job.progress === undefined ? {} : { progress: job.progress }),
      ...(job.error ? { error: job.error } : {}),
    };
  }

  private jobResponse(job: VoiceJob): HexVoiceResponse {
    if (job.error) return this.result({ kind: "error", code: job.error });
    return this.result({
      kind: "job",
      job: {
        id: job.id,
        phase: job.phase,
        ...(job.progress === undefined ? {} : { progress: job.progress }),
        ...(job.transcript === undefined ? {} : { transcript: job.transcript }),
      },
    });
  }

  private async begin(id: string, model: string, language: string): Promise<HexVoiceResponse> {
    if (this.hasActiveOperation()) {
      return this.result({ kind: "error", code: "busy" });
    }
    const job = this.makeJob(id, model, language);
    this.startIdleTimer(job);
    const operation = this.startUpload(job);
    job.operation = operation;
    await operation;
    if (job.operation === operation) delete job.operation;
    return this.jobResponse(job);
  }

  private async startUpload(job: VoiceJob): Promise<void> {
    try {
      const host = await this.withTimeout(
        () => this.createHost(job.controller.signal),
        job.controller,
        STARTUP_TIMEOUT_MS,
        job,
      );
      if (job.cleanupStarted || job.controller.signal.aborted) {
        await host.close().catch(() => {});
        throw new VoiceError(job.cancelRequested ? "cancelled" : "timeout");
      }
      job.host = host;
      const selected = await this.selectModel(job);
      if (!selected.installed || !selected.verified) throw new VoiceError("not_ready");
    } catch (error) {
      await this.failJob(job, this.codeForJob(error, "unavailable"));
    }
  }

  private async prepare(id: string, model: string, language: string): Promise<HexVoiceResponse> {
    if (this.hasActiveOperation()) {
      return this.result({ kind: "error", code: "busy" });
    }
    const job = this.makeJob(id, model, language, "preparation");
    job.phase = "preparing";
    job.progress = 0;
    this.updatePreparation(job);
    job.operation = this.runPreparation(job);
    return this.jobResponse(job);
  }

  private async runPreparation(job: VoiceJob): Promise<void> {
    try {
      const host = await this.withTimeout(
        () => this.createHost(job.controller.signal),
        job.controller,
        STARTUP_TIMEOUT_MS,
        job,
      );
      if (job.cleanupStarted || job.controller.signal.aborted) {
        await host.close().catch(() => {});
        throw new VoiceError(job.cancelRequested ? "cancelled" : "timeout");
      }
      job.host = host;
      const selected = await this.selectModel(job);
      job.progress = 0;
      await this.withTimeout(
        () =>
          job.host!.client.models.prepare(selected.id, {
            language: job.language,
            signal: job.controller.signal,
            onProgress: (progress) => this.applyProgress(job, progress),
          }),
        job.controller,
        PREPARATION_TIMEOUT_MS,
        job,
      );
      const ready = await this.selectModel(job);
      if (!ready.installed || !ready.verified) throw new VoiceError("not_ready");
      job.progress = 100;
      job.phase = "done";
      this.updatePreparation(job);
      await this.finishJob(job);
    } catch (error) {
      await this.failJob(job, this.codeForJob(error, "failed"));
    }
  }

  private async append(id: string, offset: number, encoded: string): Promise<HexVoiceResponse> {
    const job = this.jobs.get(id);
    if (!job || this.active !== job || job.phase !== "uploading") {
      return this.result({ kind: "error", code: "invalid_request" });
    }
    const chunk = decodeBase64(encoded);
    if (
      !chunk ||
      offset !== job.expectedOffset ||
      job.expectedOffset + chunk.byteLength > HEX_VOICE_MAX_AUDIO_BYTES
    ) {
      return this.result({ kind: "error", code: "invalid_request" });
    }
    const existing = job.audio ?? new Uint8Array(0);
    const combined = new Uint8Array(existing.length + chunk.length);
    combined.set(existing);
    combined.set(chunk, existing.length);
    job.audio = combined;
    job.expectedOffset += chunk.length;
    job.progress = Math.min(99, Math.floor((job.expectedOffset / HEX_VOICE_MAX_AUDIO_BYTES) * 100));
    this.startIdleTimer(job);
    return this.jobResponse(job);
  }

  private async finish(id: string): Promise<HexVoiceResponse> {
    const job = this.jobs.get(id);
    if (
      !job ||
      this.active !== job ||
      job.phase !== "uploading" ||
      !job.audio ||
      !validWav(job.audio)
    ) {
      return this.result({ kind: "error", code: "invalid_request" });
    }
    if (job.idleTimer) clearTimeout(job.idleTimer);
    job.phase = "loading";
    job.progress = 0;
    job.operation = this.runTranscription(job);
    return this.jobResponse(job);
  }

  private async runTranscription(job: VoiceJob): Promise<void> {
    try {
      const selected = await this.selectModel(job);
      if (!selected.installed || !selected.verified) throw new VoiceError("not_ready");
      await this.withTimeout(
        () =>
          job.host!.client.models.prepare(selected.id, {
            language: job.language,
            signal: job.controller.signal,
            onProgress: (progress) => this.applyProgress(job, progress),
          }),
        job.controller,
        INFERENCE_TIMEOUT_MS,
        job,
      );
      job.phase = "transcribing";
      delete job.progress;
      const result = await this.withTimeout(
        () =>
          job.host!.client.transcribe({
            audio: { data: job.audio!, contentType: "audio/wav" },
            model: selected.id,
            language: job.language,
            signal: job.controller.signal,
          }),
        job.controller,
        INFERENCE_TIMEOUT_MS,
        job,
      );
      job.transcript = result.transcript;
      job.phase = "done";
      await this.finishJob(job);
    } catch (error) {
      await this.failJob(job, this.codeForJob(error, "failed"));
    }
  }

  private async selectModel(job: VoiceJob): Promise<ModelInfo & { id: ModelId }> {
    if (!job.host) throw new VoiceError("unavailable");
    const models = await this.withTimeout(
      () =>
        job.host!.client.models.list({
          language: job.language,
          signal: job.controller.signal,
        }),
      job.controller,
      STARTUP_TIMEOUT_MS,
      job,
    );
    const selected = models.find((candidate) => candidate.id === job.model);
    if (!selected || !modelSupportsLanguage(selected, job.language)) {
      throw new VoiceError("invalid_request");
    }
    return selected;
  }

  private applyProgress(job: VoiceJob, progress: ModelProgress): void {
    if (progress.type === "downloading" && progress.totalBytes > 0) {
      job.progress = Math.min(100, (progress.downloadedBytes / progress.totalBytes) * 100);
    } else if (progress.type === "verifying") {
      job.progress = 99;
    } else {
      job.progress = 100;
    }
    this.updatePreparation(job);
  }

  private status(id: string): HexVoiceResponse {
    const job = this.jobs.get(id);
    if (!job || (job.retainedUntil > 0 && job.retainedUntil <= this.now())) {
      return this.result({ kind: "error", code: "invalid_request" });
    }
    return this.jobResponse(job);
  }

  private async cancel(id: string): Promise<HexVoiceResponse> {
    const job = this.jobs.get(id);
    if (!job) return this.result({ kind: "error", code: "invalid_request" });
    if (job.cleanupStarted || job.retainedUntil > 0) {
      await job.settled;
      this.evict(job);
      return this.result({ kind: "cancelled" });
    }
    job.cancelRequested = true;
    job.controller.abort();
    const operation = job.operation;
    if (!operation || job.phase === "uploading") await this.failJob(job, "cancelled");
    if (operation) await operation;
    await job.settled;
    return this.result({ kind: "cancelled" });
  }

  private startIdleTimer(job: VoiceJob): void {
    if (job.idleTimer) clearTimeout(job.idleTimer);
    job.idleTimer = setTimeout(() => {
      if (this.active !== job || job.phase !== "uploading") return;
      job.timedOut = true;
      job.controller.abort();
      void this.failJob(job, "timeout");
    }, UPLOAD_IDLE_TIMEOUT_MS);
  }

  private async finishJob(job: VoiceJob): Promise<void> {
    await this.closeJob(job);
  }

  private async failJob(job: VoiceJob, error: HexVoiceErrorCode): Promise<void> {
    job.error = error;
    this.updatePreparation(job);
    await this.closeJob(job);
  }

  private async closeJob(job: VoiceJob): Promise<void> {
    if (job.cleanupStarted) return job.settled;
    job.cleanupStarted = true;
    if (job.idleTimer) clearTimeout(job.idleTimer);
    try {
      await job.host?.close();
    } catch {
      // A failed close must not keep a rejected job permanently busy.
    } finally {
      delete job.host;
      delete job.audio;
      if (this.active === job) this.active = undefined;
      job.retainedUntil = this.now() + RETENTION_MS;
      job.retentionTimer = setTimeout(() => this.evict(job), RETENTION_MS);
      this.updatePreparation(job);
      job.resolveSettled();
    }
  }

  private evict(job: VoiceJob): void {
    if (job.retentionTimer) clearTimeout(job.retentionTimer);
    if (this.jobs.get(job.id) === job) this.jobs.delete(job.id);
    if (this.latestPreparation?.id === job.id) this.latestPreparation = null;
    delete job.audio;
  }

  private codeForJob(error: unknown, fallback: HexVoiceErrorCode): HexVoiceErrorCode {
    if (error instanceof VoiceError) return error.code;
    if (error instanceof Error && error.name === "TimeoutError") return "timeout";
    if (isAbort(error)) {
      if (this.active?.cancelRequested) return "cancelled";
      return this.active?.timedOut ? "timeout" : "cancelled";
    }
    return fallback;
  }

  private async withTimeout<T>(
    operation: () => Promise<T>,
    controller: AbortController,
    timeoutMs: number,
    job?: VoiceJob,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        if (job) job.timedOut = true;
        controller.abort();
        const error = new Error("operation timed out", { cause: "timeout" });
        error.name = "TimeoutError";
        reject(error);
      }, timeoutMs);
    });
    try {
      return await Promise.race([operation(), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

class VoiceError extends Error {
  constructor(readonly code: HexVoiceErrorCode) {
    super(code);
  }
}
