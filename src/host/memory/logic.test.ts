import { describe, expect, it } from "vitest";
import {
  conflictsWith,
  observationsFromUserLines,
  parseDreamConsolidation,
  parseModelObservations,
  redactSecrets,
  renderMemoryPrompt,
  skillSlug,
  statementKey,
  transcriptFromItems,
} from "./logic";
import type { MemoryEntry } from "@/shared/memory";
import { defaultMemorySettings } from "@/shared/memory";

const entry = (patch: Partial<MemoryEntry>): MemoryEntry => ({
  id: "m1",
  scope: "global",
  projectId: null,
  category: "feedback",
  summary: "Always use bun",
  body: "Always use bun",
  confidence: 0.8,
  polarity: "positive",
  quote: "Always use bun",
  lockedByUser: false,
  pinned: false,
  archived: false,
  usageCount: 0,
  lastUsedAt: null,
  createdAt: "2026-11-16T00:00:00.000Z",
  updatedAt: "2026-11-16T00:00:00.000Z",
  source: "learned",
  ...patch,
});

describe("memory logic", () => {
  it("redacts secrets and ignores injected memory", () => {
    const text = observationsFromUserLines(
      "<poracode_memory>\n- old\n</poracode_memory>\nUser: Always use bun. The key is sk-abcdefghijklmnopqrstuvwxyz",
    );
    expect(text[0]?.statement).toContain("Always use bun");
    expect(text[0]?.statement).toContain("[REDACTED]");
    expect(text[0]?.statement).not.toContain("sk-abc");
  });

  it("scores an explicit preference high enough to fast-track", () => {
    const [observation] = observationsFromUserLines("User: Always use bun");
    expect(observation?.explicit).toBe(true);
    expect(statementKey(observation!.statement)).toBe("always use bun");
  });

  it("does not learn an assistant line as a user preference", () => {
    expect(observationsFromUserLines("Assistant: Always use bun")).toEqual([]);
  });

  it("redacts hyphenated keys and assigned secrets", () => {
    const [observation] = observationsFromUserLines(
      "User: Always keep sk-ant-api03-abcdefghijklmnopqrstuvwxyz and github_pat_abcdefghijklmnopqrstuvwxyz out, password: hunter2",
    );
    expect(observation?.statement).not.toContain("sk-ant-");
    expect(observation?.statement).not.toContain("github_pat_");
    expect(observation?.statement).not.toContain("hunter2");
  });

  it("flags a contradiction against a strong existing note", () => {
    const [observation] = observationsFromUserLines("User: Never use bun");
    expect(
      conflictsWith(observation!, entry({ summary: "Never use bun", polarity: "positive" })),
    ).toBe(true);
  });

  it("reads user and assistant lines, ignores metadata fields, and drops tool noise", () => {
    const text = transcriptFromItems([
      {
        position: 1,
        type: "user_message",
        payload: JSON.stringify({
          content: [
            { kind: "text", text: "Always run bun test" },
            { kind: "file", path: "/secret/never-use-this-path" },
          ],
        }),
      },
      { position: 2, type: "tool_call", payload: JSON.stringify({ text: "secret output" }) },
    ]);
    expect(text).toBe("User: Always run bun test");
    expect(text).not.toContain("never-use-this-path");
    expect(text).not.toContain("secret output");
  });

  it("marks architecture and repo rules as project-scoped instead of global", () => {
    const [observation] = observationsFromUserLines(
      "User: We use PostgreSQL with Drizzle in this repo",
    );
    expect(observation).toMatchObject({ scope: "project", category: "project" });
  });

  it("does not turn a question into a preference", () => {
    expect(observationsFromUserLines("User: Do you always use bun?")).toEqual([]);
  });

  it("parses model observations and renders a bounded prompt", () => {
    const parsed = parseModelObservations(
      'note {"observations":[{"scope":"global","category":"user","statement":"Prefer short commits","quote":"Prefer short commits","polarity":"positive","explicit":true}]}',
    );
    expect(parsed).toHaveLength(1);
    const prompt = renderMemoryPrompt(
      [entry({ summary: "Prefer short commits", updatedAt: "2026-11-01T00:00:00.000Z" })],
      { ...defaultMemorySettings, sessionTokenBudget: 2000 },
      Date.parse("2026-11-16T00:00:00.000Z"),
    );
    expect(prompt).toContain("<poracode_memory>");
    expect(prompt).toContain("Prefer short commits");
    expect(prompt).toContain("old");
    expect(skillSlug("Prefer short commits")).toBe("prefer-short-commits");
  });

  it("redacts a bearer token", () => {
    expect(redactSecrets("Authorization: Bearer abcdefghijklmnop")).toContain("[REDACTED]");
  });

  it("rejects multi-question prompts and one-off turn directives in deterministic capture", () => {
    expect(
      observationsFromUserLines(
        "User: Without running tools, answer: 1) What test command should we use? 2) Port? If you don't know, reply UNKNOWN.",
      ),
    ).toEqual([]);
    expect(observationsFromUserLines("User: Do not run tools. Reply only with OK_TAUGHT.")).toEqual(
      [],
    );
  });

  it("reads streamed assistant text when payload is null and avoids duplicating payload text", () => {
    const streamed = transcriptFromItems([
      { position: 0, type: "user_message", payload: JSON.stringify({ text: "Hi" }) },
      { position: 1, type: "assistant_message", payload: null, streamText: "Streamed reply" },
      {
        position: 2,
        type: "assistant_message",
        payload: JSON.stringify({ content: [{ kind: "text", text: "Payload reply" }] }),
        streamText: "Payload reply",
      },
    ]);
    expect(streamed).toBe("User: Hi\nAssistant: Streamed reply\nAssistant: Payload reply");
  });

  it("parses retireIds alongside consolidated dream observations", () => {
    const parsed = parseDreamConsolidation(
      JSON.stringify({
        observations: [
          {
            scope: "project",
            projectId: "p1",
            category: "project",
            statement: "Staging server runs on port 4180",
            quote: null,
            polarity: "fact",
            explicit: true,
          },
        ],
        retireIds: ["old-bloated-1"],
      }),
    );
    expect(parsed.observations).toHaveLength(1);
    expect(parsed.retireIds).toEqual(["old-bloated-1"]);
  });
});
