import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCodexTranscript } from "./transcript";
import { MAX_IMPORTED_MESSAGE_CHARS } from "@/shared/sessionImport/transcript";

function writeRollout(lines: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-codex-transcript-"));
  const path = join(dir, "rollout-test.jsonl");
  writeFileSync(path, lines.map((line) => JSON.stringify(line)).join("\n"), "utf8");
  return path;
}

const META = {
  type: "session_meta",
  payload: {
    session_id: "01a0bc7b-6665-7473-bad7-4d7866c20dea",
    cwd: "F:\\repo",
    timestamp: "2026-09-20T04:43:18.000Z",
  },
};

function message(role: string, text: string, kind = "input_text") {
  return {
    type: "response_item",
    timestamp: "2026-09-20T04:44:00.000Z",
    payload: { type: "message", role, content: [{ type: kind, text }] },
  };
}

describe("parseCodexTranscript", () => {
  it("keeps user and assistant text in order", () => {
    const path = writeRollout([
      META,
      message("user", "fix the bug"),
      message("assistant", "done", "output_text"),
      message("user", "thanks"),
    ]);
    const transcript = parseCodexTranscript(path);
    expect(transcript.providerSessionId).toBe("01a0bc7b-6665-7473-bad7-4d7866c20dea");
    expect(transcript.cwd).toBe("F:\\repo");
    expect(transcript.messages).toEqual([
      { role: "user", text: "fix the bug", at: "2026-09-20T04:44:00.000Z" },
      { role: "assistant", text: "done", at: "2026-09-20T04:44:00.000Z" },
      { role: "user", text: "thanks", at: "2026-09-20T04:44:00.000Z" },
    ]);
  });

  it("drops developer messages, tool calls, and reasoning", () => {
    const path = writeRollout([
      META,
      message("developer", "You are Codex"),
      { type: "response_item", payload: { type: "reasoning", summary: [] } },
      { type: "response_item", payload: { type: "custom_tool_call", id: "ctc_1" } },
      { type: "event_msg", payload: { type: "task_started" } },
      message("user", "real prompt"),
    ]);
    expect(parseCodexTranscript(path).messages).toEqual([
      { role: "user", text: "real prompt", at: "2026-09-20T04:44:00.000Z" },
    ]);
  });

  it("drops a user message that is only injected context", () => {
    const path = writeRollout([
      META,
      message("user", "<recommended_plugins>\n- Airtable\n</recommended_plugins>"),
      message("user", "<environment_context>cwd=F:\\repo</environment_context>"),
      message("user", "<user_instructions>be brief</user_instructions>"),
      message("user", "actual question"),
    ]);
    expect(parseCodexTranscript(path).messages.map((m) => m.text)).toEqual(["actual question"]);
  });

  it("joins multi-part content and skips malformed lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-codex-transcript-"));
    const path = join(dir, "rollout-test.jsonl");
    writeFileSync(
      path,
      [
        JSON.stringify(META),
        "{ not json",
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [
              { type: "output_text", text: "part one " },
              { type: "output_text", text: "part two" },
            ],
          },
        }),
        "",
      ].join("\n"),
      "utf8",
    );
    expect(parseCodexTranscript(path).messages).toEqual([
      { role: "assistant", text: "part one part two" },
    ]);
  });

  it("caps a runaway message", () => {
    const path = writeRollout([
      META,
      message("user", "x".repeat(MAX_IMPORTED_MESSAGE_CHARS + 500)),
    ]);
    const [only] = parseCodexTranscript(path).messages;
    expect(only?.text.length).toBeLessThanOrEqual(MAX_IMPORTED_MESSAGE_CHARS);
    expect(only?.text.endsWith("[… truncated on import]")).toBe(true);
  });
});
