import { z } from "zod";

export const HEX_VOICE_SAMPLE_RATE = 16_000;
export const HEX_VOICE_MAX_SECONDS = 300;
export const HEX_VOICE_MAX_AUDIO_BYTES = HEX_VOICE_SAMPLE_RATE * 2 * HEX_VOICE_MAX_SECONDS + 44;
export const HEX_VOICE_CHUNK_BYTES = 192 * 1024;

const id = z.string().uuid();
const selection = {
  id,
  model: z.string().min(1).max(128),
  language: z.string().min(1).max(32),
};

// Additive v1 procedure. Chunks keep every request below the existing 1 MiB
// JSON transport limit; random job IDs are owner credentials, never listed.
export const hexVoiceRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup") }),
  z.object({ action: z.literal("install") }),
  z.object({ action: z.literal("cancel_install") }),
  z.object({ action: z.literal("remove_engine") }),
  z.object({ action: z.literal("list"), language: z.string().min(1).max(32) }),
  z.object({ action: z.literal("prepare"), ...selection }),
  z.object({ action: z.literal("begin"), ...selection }),
  z.object({
    action: z.literal("append"),
    id,
    offset: z.number().int().min(0).max(HEX_VOICE_MAX_AUDIO_BYTES),
    audioBase64: z
      .string()
      .min(4)
      .max((HEX_VOICE_CHUNK_BYTES / 3) * 4)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  }),
  z.object({ action: z.literal("finish"), id }),
  z.object({ action: z.literal("status"), id }),
  z.object({ action: z.literal("cancel"), id }),
]);

export const hexVoiceModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  installed: z.boolean(),
  verified: z.boolean(),
  downloadBytes: z.number().nullable(),
  languages: z.array(z.string()),
  supportsLanguageDetection: z.boolean(),
});

export const hexVoiceErrorSchema = z.enum([
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
]);

export const hexVoicePreparationSchema = z.object({
  id,
  model: z.string().min(1).max(128),
  language: z.string().min(1).max(32),
  phase: z.enum(["preparing", "done", "error"]),
  progress: z.number().min(0).max(100).optional(),
  error: hexVoiceErrorSchema.optional(),
});

export const hexVoiceSetupSchema = z.object({
  hostName: z.string(),
  platform: z.string(),
  arch: z.string(),
  engine: z.object({
    state: z.enum(["missing", "installed", "installing", "unsupported", "error"]),
    source: z.enum(["managed", "external"]).nullable(),
    version: z.string().nullable(),
    availableVersion: z.string(),
    downloadBytes: z.number().nullable(),
    progress: z.number().min(0).max(100).optional(),
    error: hexVoiceErrorSchema.optional(),
  }),
  preparation: hexVoicePreparationSchema.nullable(),
});

export const hexVoiceJobSchema = z.object({
  id,
  phase: z.enum(["uploading", "preparing", "loading", "transcribing", "done"]),
  progress: z.number().min(0).max(100).optional(),
  transcript: z.string().optional(),
});

export const hexVoiceResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("setup"), setup: hexVoiceSetupSchema }),
  z.object({ kind: z.literal("catalog"), models: z.array(hexVoiceModelSchema) }),
  z.object({ kind: z.literal("job"), job: hexVoiceJobSchema }),
  z.object({ kind: z.literal("cancelled") }),
  z.object({ kind: z.literal("error"), code: hexVoiceErrorSchema }),
]);

export type HexVoiceRequest = z.infer<typeof hexVoiceRequestSchema>;
export type HexVoiceResponse = z.infer<typeof hexVoiceResponseSchema>;
export type HexVoiceModel = z.infer<typeof hexVoiceModelSchema>;
export type HexVoiceJob = z.infer<typeof hexVoiceJobSchema>;
export type HexVoiceErrorCode = z.infer<typeof hexVoiceErrorSchema>;
export type HexVoiceSetup = z.infer<typeof hexVoiceSetupSchema>;
export type HexVoicePreparation = z.infer<typeof hexVoicePreparationSchema>;
