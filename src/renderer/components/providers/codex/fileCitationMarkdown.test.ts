import { describe, expect, it } from "vitest";
import { formatFileCitationMarkdown } from "./fileCitationMarkdown";
import { parsePathRefUrl } from "../../thread/ChatPane/parts/items/markdownPathRefs";
import { resolveThreadTranscriptMarkdownFormatter } from "../../thread/threadTranscriptMarkdown";

describe("Codex file citation markdown", () => {
  it("registers through the provider manifest for existing and new transcripts", () => {
    expect(resolveThreadTranscriptMarkdownFormatter("codex")).toBe(formatFileCitationMarkdown);
  });

  it.each([
    "/tmp/report.pdf",
    "D:/OneDrive - Institute/Robotics (Review)/figures/source/workflow_3.pptx",
    String.raw`C:\Users\me\My Documents\draft.docx`,
    String.raw`\\server\share\report.xlsx`,
    "/tmp/日本語 [draft](50%)_v2).pdf",
    "/tmp/file{with}braces.pdf",
    "/tmp/no-extension",
  ])("retains the entire explicit file path: %s", (path) => {
    const formatted = formatFileCitationMarkdown(
      `Created :codex-file-citation{path="${path}" purpose="output"}.`,
    );
    const href = formatted.match(/\]\((https:\/\/[^)]+)\)/)?.[1];
    expect(href).toBeDefined();
    expect(parsePathRefUrl(href!)).toEqual({ kind: "file", path });
    expect(formatted).not.toContain(":codex-file-citation");
    expect(formatted).toMatch(/^Created \[.*\]\(.*\)\.$/);
  });

  it("accepts reordered attributes and source locators without treating them as code lines", () => {
    const text =
      ':codex-file-citation{purpose="source" artifact_kind="workbook" sheet="Revenue Model" range="C27" path="/tmp/book.xlsx"}';
    const href = formatFileCitationMarkdown(text).match(/\]\(([^)]+)\)/)?.[1];
    expect(parsePathRefUrl(href!)).toEqual({ kind: "file", path: "/tmp/book.xlsx" });
  });

  it("supports quoted attribute values and preserves literal Windows backslashes", () => {
    const text = String.raw`:codex-file-citation{path='C:\notes\today\report.pdf' purpose='output'}`;
    const href = formatFileCitationMarkdown(text).match(/\]\(([^)]+)\)/)?.[1];
    expect(parsePathRefUrl(href!)).toEqual({
      kind: "file",
      path: String.raw`C:\notes\today\report.pdf`,
    });
  });

  const citation = ':codex-file-citation{path="/tmp/report.pdf" purpose="output"}';

  it.each([
    `\`${citation}\``,
    `\`\`${citation}\`\``,
    `\`\`\`text\n${citation}\n\`\`\``,
    `~~~text\n${citation}\n~~~`,
    `\`\`\`\`markdown\n\`\`\`\n${citation}\n\`\`\`\``,
    `> \`\`\`text\n> ${citation}\n> \`\`\``,
    `    ${citation}`,
    `\\${citation}`,
    `\`\`\`text\n${citation}`,
  ])("does not rewrite a literal example: %s", (text) => {
    expect(formatFileCitationMarkdown(text)).toBe(text);
  });

  it("resumes after literal code and converts multiple citations without changing surrounding prose", () => {
    const text = `\`${citation}\`\n\nCreated ${citation}, with matching ${citation}.`;
    const formatted = formatFileCitationMarkdown(text);
    expect(formatted).toBe(
      `\`${citation}\`\n\nCreated ${formatFileCitationMarkdown(citation)}, with matching ${formatFileCitationMarkdown(citation)}.`,
    );
    expect(formatFileCitationMarkdown(formatted)).toBe(formatted);
  });

  it.each([
    ':codex-file-citation{purpose="output"}',
    ':codex-file-citation{path=""}',
    ':codex-file-citation{path="/a.pdf" path="/b.pdf"}',
    ':codex-file-citation{path="/a.pdf" broken}',
    ':codex-file-citation{path="javascript:alert(1)"}',
    ':codex-file-citation{path="https://example.test/report.pdf"}',
    ':codex-file-citation{path="/tmp/\u0000.pdf"}',
  ])("leaves malformed or non-file input visible: %s", (text) => {
    expect(formatFileCitationMarkdown(text)).toBe(text);
  });

  it("handles every streamed prefix without corrupting or losing incomplete text", () => {
    for (let length = 0; length < citation.length; length++) {
      const text = `Created ${citation.slice(0, length)}`;
      expect(formatFileCitationMarkdown(text)).toBe(text);
    }
    expect(formatFileCitationMarkdown(`Created ${citation}`)).not.toContain(":codex-file-citation");
  });
});
