import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { readClaudeTitle } from "@/supervisor/agents/claude/sessionImport/titles";
import { readCodexTitles } from "@/supervisor/agents/codex/sessionImport/titles";

function transcript(lines: unknown[]): string {
  const path = join(mkdtempSync(join(tmpdir(), "poracode-title-")), "s.jsonl");
  writeFileSync(path, lines.map((line) => JSON.stringify(line)).join("\n"), "utf8");
  return path;
}

describe("readClaudeTitle", () => {
  it("returns the newest custom title", () => {
    const path = transcript([
      { type: "user", message: { role: "user", content: "hi" } },
      { type: "custom-title", customTitle: "First name", sessionId: "s" },
      { type: "assistant", message: { role: "assistant", content: "hello" } },
      { type: "custom-title", customTitle: "  Renamed later  ", sessionId: "s" },
      { type: "user", message: { role: "user", content: "bye" } },
    ]);
    expect(readClaudeTitle(path)).toBe("Renamed later");
  });

  it("finds a title in a file larger than the tail window", () => {
    const filler = { type: "assistant", message: { role: "assistant", content: "x".repeat(4000) } };
    const path = transcript([
      { type: "custom-title", customTitle: "Early, then buried", sessionId: "s" },
      ...Array.from({ length: 80 }, () => filler),
      { type: "custom-title", customTitle: "Latest", sessionId: "s" },
      ...Array.from({ length: 3 }, () => filler),
    ]);
    expect(readClaudeTitle(path)).toBe("Latest");
  });

  it("returns nothing without a title or for a missing file", () => {
    expect(readClaudeTitle(transcript([{ type: "user", message: {} }]))).toBeUndefined();
    expect(readClaudeTitle(join(tmpdir(), "nope.jsonl"))).toBeUndefined();
  });
});

describe("readCodexTitles", () => {
  it("prefers the user's name over the generated title, from the newest state db", () => {
    const home = mkdtempSync(join(tmpdir(), "poracode-codex-home-"));
    for (const [file, rows] of [
      ["state_4.sqlite", [["old", "Old index", null]]],
      [
        "state_5.sqlite",
        [
          ["named", "My name", "Generated"],
          ["generated", "", "Generated only"],
          ["blank", null, "  "],
          ["handoff", null, "как дела[provider handoff] This thread was being handled by claude."],
        ],
      ],
    ] as const) {
      const db = new Database(join(home, file));
      db.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, name TEXT, title TEXT)");
      const insert = db.prepare("INSERT INTO threads (id, name, title) VALUES (?, ?, ?)");
      for (const row of rows) insert.run(...row);
      db.close();
    }

    const titles = readCodexTitles(home);
    expect(Object.fromEntries(titles)).toEqual({
      named: "My name",
      generated: "Generated only",
      // A generated title that is the first prompt verbatim loses its injected tail.
      handoff: "как дела",
    });
  });

  it("returns nothing when the home has no readable index", () => {
    const home = mkdtempSync(join(tmpdir(), "poracode-codex-empty-"));
    expect(readCodexTitles(home).size).toBe(0);
    writeFileSync(join(home, "state_5.sqlite"), "not a database", "utf8");
    expect(readCodexTitles(home).size).toBe(0);
    expect(readCodexTitles(join(tmpdir(), "missing-home")).size).toBe(0);
  });
});
