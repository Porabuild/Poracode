import { describe, expect, it } from "vitest";
import {
  HEX_VOICE_CHUNK_BYTES,
  HEX_VOICE_MAX_AUDIO_BYTES,
  hexVoiceRequestSchema,
  hexVoiceResponseSchema,
} from "./hexVoice";

const id = "11111111-1111-4111-8111-111111111111";

describe("Hex voice contracts", () => {
  it("accepts each operation and rejects malformed IDs, offsets, and non-canonical base64", () => {
    for (const request of [
      { action: "setup" },
      { action: "install" },
      { action: "cancel_install" },
      { action: "remove_engine" },
      { action: "list", language: "en" },
      { action: "prepare", id, model: "parakeet_v3", language: "en" },
      { action: "begin", id, model: "parakeet_v3", language: "en" },
      { action: "append", id, offset: 0, audioBase64: "AA==" },
      { action: "finish", id },
      { action: "status", id },
      { action: "cancel", id },
    ]) {
      expect(hexVoiceRequestSchema.safeParse(request).success).toBe(true);
    }
    expect(hexVoiceRequestSchema.safeParse({ action: "status", id: "not-a-uuid" }).success).toBe(
      false,
    );
    expect(
      hexVoiceRequestSchema.safeParse({ action: "append", id, offset: -1, audioBase64: "AA==" })
        .success,
    ).toBe(false);
    expect(
      hexVoiceRequestSchema.safeParse({ action: "append", id, offset: 0, audioBase64: "AA=A" })
        .success,
    ).toBe(false);
    expect(HEX_VOICE_CHUNK_BYTES).toBe(192 * 1024);
    expect(HEX_VOICE_MAX_AUDIO_BYTES).toBe(9_600_044);
  });

  it("validates complete response shapes", () => {
    expect(
      hexVoiceResponseSchema.safeParse({
        kind: "setup",
        setup: {
          hostName: "host",
          platform: "linux",
          arch: "x64",
          engine: {
            state: "installed",
            source: "managed",
            version: "3.1.1",
            availableVersion: "3.1.1",
            downloadBytes: 69_129_928,
          },
          preparation: null,
        },
      }).success,
    ).toBe(true);
    expect(
      hexVoiceResponseSchema.safeParse({
        kind: "job",
        job: { id, phase: "done", progress: 100, transcript: "words" },
      }).success,
    ).toBe(true);
    expect(
      hexVoiceResponseSchema.safeParse({
        kind: "job",
        job: { id, phase: "done", progress: 101 },
      }).success,
    ).toBe(false);
    expect(
      hexVoiceResponseSchema.safeParse({
        kind: "job",
        job: { id, phase: "loading", progress: 50 },
      }).success,
    ).toBe(true);
  });
});
