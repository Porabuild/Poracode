import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseClaudeTranscript } from "./transcript";
import { MAX_IMPORTED_MESSAGE_CHARS } from "@/shared/sessionImport/transcript";

function writeLog(lines: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-claude-transcript-"));
  const path = join(dir, "9f1c6b22-0000-4000-8000-000000000001.jsonl");
  writeFileSync(path, lines.map((line) => JSON.stringify(line)).join("\n"), "utf8");
  return path;
}

const USER_TEXT = {
  type: "user",
  sessionId: "9f1c6b22-0000-4000-8000-000000000001",
  cwd: "F:\\repo",
  timestamp: "2026-09-20T05:00:00.000Z",
  message: { role: "user", content: "fix the bug" },
};

const ASSISTANT_TEXT = {
  type: "assistant",
  timestamp: "2026-09-20T05:00:10.000Z",
  message: {
    role: "assistant",
    content: [
      { type: "thinking", thinking: "hidden" },
      { type: "text", text: "on it" },
      { type: "tool_use", id: "toolu_1", name: "Read", input: {} },
    ],
  },
};

describe("parseClaudeTranscript", () => {
  it("keeps string and text-array content, dropping thinking and tool_use", () => {
    const path = writeLog([USER_TEXT, ASSISTANT_TEXT]);
    expect(parseClaudeTranscript(path).messages).toEqual([
      { role: "user", text: "fix the bug", at: "2026-09-20T05:00:00.000Z" },
      { role: "assistant", text: "on it", at: "2026-09-20T05:00:10.000Z" },
    ]);
  });

  it("drops Claude Code's own interruption markers", () => {
    const path = writeLog([
      { type: "user", message: { role: "user", content: "[Request interrupted by user]" } },
      {
        type: "user",
        message: { role: "user", content: "[Request interrupted by user for tool use]" },
      },
      USER_TEXT,
    ]);
    expect(parseClaudeTranscript(path).messages.map((m) => m.text)).toEqual(["fix the bug"]);
  });

  it("drops an interruption marker that shares its turn with injected context", () => {
    // Claude Code writes the marker into a turn that can already carry a
    // system reminder. Tested against the raw text the anchored pattern
    // fails, and the turn then strips down to the bare marker and is
    // replayed as if the user had typed it.
    const path = writeLog([
      {
        type: "user",
        message: {
          role: "user",
          content:
            "<system-reminder>Codebase instructions…</system-reminder>[Request interrupted by user]",
        },
      },
      USER_TEXT,
    ]);
    expect(parseClaudeTranscript(path).messages.map((m) => m.text)).toEqual(["fix the bug"]);
  });

  it("takes session metadata only from records that legitimately carry it", () => {
    // The scan gates head fields on the same record kinds. Every Claude
    // record carries `cwd` and `timestamp` as plain top-level fields, so a
    // `file-history-snapshot` either side of the conversation would
    // otherwise decide what folder and session the thread believes in.
    const path = writeLog([
      {
        type: "file-history-snapshot",
        sessionId: "not-the-session",
        cwd: "F:\\pasted",
        timestamp: "2020-01-01T00:00:00.000Z",
      },
      USER_TEXT,
      { type: "file-history-snapshot", sessionId: "also-not-the-session", cwd: "F:\\pasted" },
    ]);

    const transcript = parseClaudeTranscript(path);
    expect(transcript.cwd).toBe("F:\\repo");
    expect(transcript.startedAt).toBe("2026-09-20T05:00:00.000Z");
    expect(transcript.providerSessionId).toBe("9f1c6b22-0000-4000-8000-000000000001");
  });

  it("drops a user line that only carries tool results", () => {
    const path = writeLog([
      {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }],
        },
      },
      USER_TEXT,
    ]);
    expect(parseClaudeTranscript(path).messages.map((m) => m.text)).toEqual(["fix the bug"]);
  });

  it("drops sub-agent lines and meta line types", () => {
    const path = writeLog([
      { type: "bridge-session", sessionId: "x" },
      { type: "queue-operation", operation: "enqueue" },
      { type: "system", subtype: "stop_hook_summary" },
      { type: "attachment", attachment: { type: "hook_success" } },
      {
        type: "assistant",
        isSidechain: true,
        message: { content: [{ type: "text", text: "sub" }] },
      },
      USER_TEXT,
    ]);
    expect(parseClaudeTranscript(path).messages.map((m) => m.text)).toEqual(["fix the bug"]);
  });

  it("drops a user turn that is only a task notification", () => {
    const path = writeLog([
      {
        type: "user",
        sessionId: "9f1c6b22-0000-4000-8000-000000000001",
        message: {
          role: "user",
          content:
            "<task-notification>\n<task-id>b6v1</task-id>\n<status>completed</status>\n</task-notification>",
        },
      },
      {
        type: "user",
        sessionId: "9f1c6b22-0000-4000-8000-000000000001",
        message: { role: "user", content: "теперь почини импорт" },
      },
    ]);

    expect(parseClaudeTranscript(path).messages.map((m) => m.text)).toEqual([
      "теперь почини импорт",
    ]);
  });

  it("keeps what the user typed around a system reminder", () => {
    const path = writeLog([
      {
        type: "user",
        sessionId: "9f1c6b22-0000-4000-8000-000000000001",
        message: {
          role: "user",
          content: "проверь ветку<system-reminder>Codebase instructions…</system-reminder>",
        },
      },
    ]);

    expect(parseClaudeTranscript(path).messages.map((m) => m.text)).toEqual(["проверь ветку"]);
  });

  it("leaves a task-notification-shaped string in assistant text verbatim", () => {
    // stripInjectedContext only runs on the user role; assistant text is
    // never stripped, even if it happens to contain a wrapper-shaped string.
    const notification =
      "<task-notification>\n<task-id>b6v1</task-id>\n<status>completed</status>\n</task-notification>";
    const path = writeLog([
      {
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: notification }] },
      },
    ]);

    expect(parseClaudeTranscript(path).messages.map((m) => m.text)).toEqual([notification]);
  });

  it("skips malformed lines and caps a runaway message", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-claude-transcript-"));
    const path = join(dir, "sess.jsonl");
    writeFileSync(
      path,
      [
        "{ not json",
        JSON.stringify({
          type: "user",
          message: { role: "user", content: "y".repeat(MAX_IMPORTED_MESSAGE_CHARS + 500) },
        }),
      ].join("\n"),
      "utf8",
    );
    const [only] = parseClaudeTranscript(path).messages;
    expect(only?.text.length).toBeLessThanOrEqual(MAX_IMPORTED_MESSAGE_CHARS);
    expect(only?.text.endsWith("[… truncated on import]")).toBe(true);
  });

  it("handles CRLF line endings and a file with no trailing newline", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-claude-transcript-"));
    const path = join(dir, "sess.jsonl");
    const lines = [
      JSON.stringify({ type: "user", message: { role: "user", content: "first" } }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: "second" } }),
    ];
    // Joined with CRLF, and no trailing newline after the last line.
    writeFileSync(path, lines.join("\r\n"), "utf8");
    expect(parseClaudeTranscript(path).messages.map((m) => m.text)).toEqual(["first", "second"]);
  });

  it("yields every message from a transcript of a few thousand lines, read across chunk boundaries", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-claude-transcript-"));
    const path = join(dir, "sess.jsonl");
    const lineCount = 4000;
    const lines: string[] = [];
    for (let i = 0; i < lineCount; i++) {
      const role = i % 2 === 0 ? "user" : "assistant";
      lines.push(JSON.stringify({ type: role, message: { role, content: `msg-${i}` } }));
    }
    writeFileSync(path, lines.join("\n"), "utf8");
    const messages = parseClaudeTranscript(path).messages;
    expect(messages).toHaveLength(lineCount);
    expect(messages[0]?.text).toBe("msg-0");
    expect(messages[lineCount - 1]?.text).toBe(`msg-${lineCount - 1}`);
  });

  it("decodes a multi-byte character split exactly across the 64 KB read-chunk boundary", () => {
    // readLinesSync reads the file through a fixed 64 KiB buffer and decodes
    // it with StringDecoder specifically so a multi-byte UTF-8 character
    // whose bytes land on either side of that boundary still decodes to one
    // codepoint instead of being corrupted. Build a line whose single
    // two-byte Cyrillic character ("б", 0xD0 0xB1) sits with its first byte
    // as the very last byte of the first 64 KiB chunk and its second byte as
    // the very first byte of the next chunk. NOTE: this test assumes the
    // parser's internal read-chunk size is 64 KiB (65536 bytes); if that
    // constant ever changes, the byte-offset arithmetic below must change
    // with it.
    const READ_CHUNK_BYTES = 64 * 1024;
    const prefix = `{"type":"user","message":{"role":"user","content":"`;
    const marker = "б"; // U+0431, 2-byte UTF-8 sequence
    const suffix = 'END"}}';
    // Everything in `prefix` and the padding is single-byte ASCII, so the
    // character offset of `marker` in the raw file equals its byte offset.
    const padLength = READ_CHUNK_BYTES - 1 - prefix.length;
    expect(padLength).toBeGreaterThan(0);
    const pad = "a".repeat(padLength);
    const raw = prefix + pad + marker + suffix;
    // Sanity-check the arithmetic: marker's first byte must be the last byte
    // of chunk 1 (index READ_CHUNK_BYTES - 1), so its second byte is the
    // first byte of chunk 2.
    const markerByteOffset = Buffer.byteLength(prefix + pad, "utf8");
    expect(markerByteOffset).toBe(READ_CHUNK_BYTES - 1);

    const dir = mkdtempSync(join(tmpdir(), "poracode-claude-transcript-"));
    const path = join(dir, "sess.jsonl");
    writeFileSync(path, raw, "utf8");

    const [only] = parseClaudeTranscript(path).messages;
    expect(only?.text).toBe(pad + marker + "END");
  });
});
