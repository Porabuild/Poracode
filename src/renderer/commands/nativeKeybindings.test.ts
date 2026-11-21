import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYBINDINGS,
  keybindingsFileSchema,
  migrateThreadSearchCommand,
} from "@/shared/keybindings";
import { canonicalizeKeybinding, eventToKeybinding, formatKeybinding } from "./keybindingMatcher";
import { evaluateWhenClause } from "./when";

const fixture = JSON.parse(
  readFileSync("protocol/remote/v3/fixtures/client-keyboard-shortcuts.json", "utf8"),
);

describe("native keyboard compatibility vectors", () => {
  it("pins the released file schema, defaults and legacy search migration", () => {
    expect(fixture.formatVersion).toBe(1);
    expect(fixture.documents[0].input).toEqual(DEFAULT_KEYBINDINGS);
    for (const sample of fixture.documents) {
      const parsed = keybindingsFileSchema.safeParse(sample.input);
      const actual = parsed.success ? migrateThreadSearchCommand(parsed.data) : null;
      expect(actual).toEqual(sample.expected);
    }
  });

  it("pins aliases, shifted punctuation, display and real-key event normalization", () => {
    for (const sample of fixture.chords) {
      expect(canonicalizeKeybinding(sample.raw, "darwin") ?? null).toBe(sample.expected);
      expect(formatKeybinding(sample.raw, "darwin")).toBe(sample.display);
    }
    for (const sample of fixture.events) {
      expect(eventToKeybinding(sample.event, "darwin") || null).toBe(sample.expected);
    }
  });

  it("pins every default focus condition and the existing language edge cases", () => {
    for (const sample of fixture.conditions) {
      let actual;
      try {
        actual = {
          expected: evaluateWhenClause(sample.clause ?? undefined, sample.context),
          throws: false,
        };
      } catch {
        actual = { expected: null, throws: true };
      }
      expect(actual).toEqual({ expected: sample.expected, throws: sample.throws });
    }
  });

  it("pins primitive-number comparison coercion", () => {
    for (const sample of fixture.numbers) expect(String(sample.value)).toBe(sample.expected);
  });
});
