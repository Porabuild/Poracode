import { describe, expect, it } from "vitest";
import {
  conflictsWith,
  observationsFromUserLines,
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
    const [observation] = observationsFromUserLines("Always use bun");
    expect(observation?.explicit).toBe(true);
    expect(statementKey(observation!.statement)).toBe("always use bun");
  });

  it("flags a contradiction against a strong existing note", () => {
    const [observation] = observationsFromUserLines("Never use bun");
    expect(
      conflictsWith(observation!, entry({ summary: "Never use bun", polarity: "positive" })),
    ).toBe(true);
  });

  it("reads user and assistant lines and drops tool noise", () => {
    const text = transcriptFromItems([
      {
        position: 1,
        type: "user_message",
        payload: JSON.stringify({ text: "Always run bun test" }),
      },
      { position: 2, type: "tool_call", payload: JSON.stringify({ text: "secret output" }) },
    ]);
    expect(text).toContain("Always run bun test");
    expect(text).not.toContain("secret output");
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
});
