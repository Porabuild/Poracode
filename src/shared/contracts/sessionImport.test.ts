import { describe, expect, it } from "vitest";
import {
  importableSessionSchema,
  importSessionTranscriptPayloadSchema,
  listImportableSessionsPayloadSchema,
  threadImportedFromSchema,
} from "./sessionImport";
import { threadConfigSchema } from "./config";

describe("importableSessionSchema", () => {
  it("parses a discovered Codex session", () => {
    const parsed = importableSessionSchema.parse({
      id: "codex:01a0bc7b-6665-7473-bad7-4d7866c20dea",
      provider: "codex",
      agentKind: "codex:work",
      providerSessionId: "01a0bc7b-6665-7473-bad7-4d7866c20dea",
      path: "C:\\Users\\demo\\.codex\\sessions\\2026\\09\\20\\rollout-x.jsonl",
      cwd: "F:\\repo",
      startedAt: "2026-09-20T04:43:18.000Z",
      preview: "fix the race condition",
      cwdExists: true,
    });
    expect(parsed.provider).toBe("codex");
    expect(parsed.importedThreadId).toBeUndefined();
  });

  it("keeps a provider id for a future import adapter", () => {
    expect(
      importableSessionSchema.parse({
        id: "gemini:1",
        provider: "gemini",
        agentKind: "gemini",
        providerSessionId: "1",
        path: "/tmp/x.jsonl",
        preview: "",
        cwdExists: false,
      }).provider,
    ).toBe("gemini");
  });
});

describe("import payloads", () => {
  it("accepts an empty filter and a provider filter", () => {
    expect(listImportableSessionsPayloadSchema.parse({})).toEqual({});
    expect(listImportableSessionsPayloadSchema.parse({ provider: "claude" }).provider).toBe(
      "claude",
    );
  });

  it("requires a thread, provider, and path to import", () => {
    expect(() => importSessionTranscriptPayloadSchema.parse({ threadId: "t1" })).toThrow(Error);
    expect(
      importSessionTranscriptPayloadSchema.parse({
        threadId: "t1",
        provider: "codex",
        path: "/tmp/x.jsonl",
      }).threadId,
    ).toBe("t1");
  });
});

describe("thread config importedFrom", () => {
  it("round-trips the import marker on a thread config", () => {
    const config = threadConfigSchema.parse({
      model: "gpt-5.5",
      importedFrom: {
        provider: "codex",
        path: "/tmp/x.jsonl",
        importedAt: "2026-09-20T10:00:00.000Z",
      },
    });
    expect(config.importedFrom?.provider).toBe("codex");
    expect(threadImportedFromSchema.parse(config.importedFrom)).toEqual(config.importedFrom);
  });

  it("leaves importedFrom absent for a normal config", () => {
    expect(threadConfigSchema.parse({ model: "gpt-5.5" }).importedFrom).toBeUndefined();
  });
});
