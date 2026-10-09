import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionImportScanner } from "../../sessionImport/scanner";
import { createClaudeSessionImport } from "./sessionImport";

const SESSION_ID = "9f1c6b22-0000-4000-8000-000000000001";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function configDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-claude-import-"));
  dirs.push(dir);
  mkdirSync(join(dir, "projects", "-repo"), { recursive: true });
  return dir;
}

function writeLog(dir: string, name: string, lines: unknown[]): string {
  const path = join(dir, "projects", "-repo", name);
  writeFileSync(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  return path;
}

const user = (content: unknown, extra: Record<string, unknown> = {}) => ({
  type: "user",
  sessionId: SESSION_ID,
  cwd: "/repo",
  timestamp: "2026-09-20T05:00:00.000Z",
  message: { role: "user", content },
  ...extra,
});

const assistant = {
  type: "assistant",
  message: {
    role: "assistant",
    model: "claude-opus-4-8",
    content: [
      { type: "thinking", thinking: "hidden" },
      { type: "text", text: "on it" },
      { type: "tool_use", id: "toolu_1", name: "Read", input: {} },
    ],
  },
};

describe("Claude session import", () => {
  it("summarizes a conversation and replays only what the user saw", async () => {
    const dir = configDir();
    const path = writeLog(dir, `${SESSION_ID}.jsonl`, [
      { type: "file-history-snapshot", cwd: "/elsewhere" },
      user("<system-reminder>injected</system-reminder>[Request interrupted by user]"),
      user("<command-name>/clear</command-name>", { isMeta: true }),
      user("fix the bug"),
      assistant,
      user("sub-agent chatter", { isSidechain: true }),
      { type: "custom-title", customTitle: "Bug hunt", sessionId: SESSION_ID },
    ]);
    const source = createClaudeSessionImport(dir);
    const scanner = new SessionImportScanner(() => [{ agentKind: "claude", source }]);

    const { sessions } = await scanner.list({});

    expect(sessions).toEqual([
      expect.objectContaining({
        providerSessionId: SESSION_ID,
        cwd: "/repo",
        model: "claude-opus-4-8",
        preview: "fix the bug",
        title: "Bug hunt",
      }),
    ]);
    expect(await source.readTranscript(path)).toEqual({
      providerSessionId: SESSION_ID,
      messages: [
        { role: "user", text: "fix the bug" },
        { role: "assistant", text: "on it" },
      ],
    });
  });

  it("does not list sub-agent logs as conversations", async () => {
    const dir = configDir();
    writeLog(dir, "agent-a1b2.jsonl", [user("task")]);
    writeLog(dir, "b2c3d4e5-0000-4000-8000-000000000002.jsonl", [
      user("delegated task", { isSidechain: true }),
    ]);
    const source = createClaudeSessionImport(dir);
    const scanner = new SessionImportScanner(() => [{ agentKind: "claude", source }]);

    expect((await scanner.list({})).sessions).toEqual([]);
  });
});
