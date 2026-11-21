/** Stateful host-voice contract fixture. ASR itself is qualified separately
 * through real Core ML Whisper; this fixture exercises native host controls. */
export class VoiceFixture {
  enabled = false;
  private installed = false;
  private prepared = false;
  private preparation: Record<string, unknown> | null = null;
  private readonly jobs = new Map<string, { bytes: number; done: boolean }>();

  reset(): void {
    this.enabled = false;
    this.installed = false;
    this.prepared = false;
    this.preparation = null;
    this.jobs.clear();
  }

  call(body: Record<string, unknown>): unknown {
    const id = String(body.id ?? "");
    switch (body.action) {
      case "setup":
        return this.setup();
      case "install":
        this.installed = true;
        return this.setup();
      case "cancel_install":
        return this.setup();
      case "remove_engine":
        this.installed = false;
        return this.setup();
      case "list":
        return {
          kind: "catalog",
          models: [
            {
              id: "parakeet_v3",
              name: "Fixture Speech",
              installed: this.prepared,
              verified: this.prepared,
              downloadBytes: 0,
              languages: ["en", "fr"],
              supportsLanguageDetection: false,
            },
          ],
        };
      case "prepare":
        if (!this.installed) return { kind: "error", code: "unavailable" };
        this.prepared = true;
        this.preparation = {
          id,
          model: body.model,
          language: body.language,
          phase: "done",
          progress: 100,
        };
        return this.job(id, "done");
      case "begin":
        if (!this.installed || !this.prepared) return { kind: "error", code: "not_ready" };
        this.jobs.set(id, { bytes: 0, done: false });
        return this.job(id, "uploading");
      case "append": {
        const job = this.jobs.get(id);
        if (!job || body.offset !== job.bytes || job.done)
          return { kind: "error", code: "invalid_request" };
        const bytes = Buffer.from(String(body.audioBase64), "base64");
        if (job.bytes === 0 && bytes.subarray(0, 4).toString() !== "RIFF")
          return { kind: "error", code: "invalid_request" };
        job.bytes += bytes.length;
        return this.job(id, "uploading");
      }
      case "finish": {
        const job = this.jobs.get(id);
        if (!job || job.bytes <= 44) return { kind: "error", code: "invalid_request" };
        job.done = true;
        return this.job(id, "done");
      }
      case "status":
        return this.jobs.has(id)
          ? this.job(id, this.jobs.get(id)!.done ? "done" : "uploading")
          : { kind: "error", code: "invalid_request" };
      case "cancel":
        this.jobs.delete(id);
        if (this.preparation?.id === id) this.preparation = null;
        return { kind: "cancelled" };
      default:
        return { kind: "error", code: "invalid_request" };
    }
  }

  private setup(): unknown {
    return {
      kind: "setup",
      setup: {
        hostName: "Native Voice Host",
        platform: "darwin",
        arch: "arm64",
        engine: {
          state: this.installed ? "installed" : "missing",
          source: this.installed ? "managed" : null,
          version: this.installed ? "fixture" : null,
          availableVersion: "fixture",
          downloadBytes: 0,
        },
        preparation: this.preparation,
      },
    };
  }
  private job(id: string, phase: string): unknown {
    return {
      kind: "job",
      job: { id, phase, ...(phase === "done" ? { transcript: "Fixture host transcript" } : {}) },
    };
  }
}
