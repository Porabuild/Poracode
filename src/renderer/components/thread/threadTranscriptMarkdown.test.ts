import { describe, expect, it } from "vitest";
import { resolveThreadTranscriptMarkdownFormatter } from "./threadTranscriptMarkdown";

describe("resolveThreadTranscriptMarkdownFormatter", () => {
  it("hands back the declaring provider's formatter", () => {
    // What it rewrites is the provider's own business — covered in its suite.
    expect(resolveThreadTranscriptMarkdownFormatter("antigravity")).toBeInstanceOf(Function);
  });

  it("leaves providers that declare no rewrite untouched", () => {
    // Chat markdown must stay verbatim for every provider that did not opt in,
    // so prose can quote another agent's payload format without being rewritten.
    for (const kind of ["claude", "codex", "gemini", "cursor"]) {
      expect(resolveThreadTranscriptMarkdownFormatter(kind)).toBeUndefined();
    }
  });

  it("resolves through the base kind for sub-branded providers", () => {
    expect(resolveThreadTranscriptMarkdownFormatter("claude:z-ai")).toBeUndefined();
  });

  it("returns undefined for an unknown provider kind", () => {
    expect(resolveThreadTranscriptMarkdownFormatter("not-a-provider")).toBeUndefined();
  });
});
