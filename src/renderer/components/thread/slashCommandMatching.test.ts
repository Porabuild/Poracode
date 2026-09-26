import { describe, expect, it } from "vitest";
import type { AgentSlashCommand } from "@/shared/contracts";
import { slashCommandMatch } from "./slashCommandMatching";

function command(id: string, extra: Partial<AgentSlashCommand> = {}): AgentSlashCommand {
  return { id, label: id, ...extra };
}

describe("slashCommandMatch", () => {
  it("matches a name that starts with the query", () => {
    expect(slashCommandMatch(command("auto-mode-setup"), "auto")).toEqual({
      tier: "prefix",
      highlight: { start: 0, end: 4 },
    });
  });

  it("matches a query at the start of a later word", () => {
    expect(slashCommandMatch(command("auto-mode-setup"), "s")).toEqual({
      tier: "wordStart",
      highlight: { start: 10, end: 11 },
    });
  });

  it.each(["run_tests", "run:tests", "run.tests", "run/tests"])(
    "treats the separator in %s as a word boundary",
    (id) => {
      expect(slashCommandMatch(command(id), "te")).toEqual({
        tier: "wordStart",
        highlight: { start: 4, end: 6 },
      });
    },
  );

  it("lets a word-start match run across separators", () => {
    expect(slashCommandMatch(command("auto-mode-setup"), "mode-s")).toEqual({
      tier: "wordStart",
      highlight: { start: 5, end: 11 },
    });
  });

  it("falls back to a match inside a word", () => {
    expect(slashCommandMatch(command("auto-mode-setup"), "tup")).toEqual({
      tier: "substring",
      highlight: { start: 12, end: 15 },
    });
  });

  it("matches every name with an empty query", () => {
    expect(slashCommandMatch(command("auto-mode-setup"), "")).toEqual({
      tier: "prefix",
      highlight: { start: 0, end: 0 },
    });
  });

  it("returns null when the query does not appear in the name", () => {
    expect(slashCommandMatch(command("auto-mode-setup"), "ams")).toBeNull();
  });

  describe("skills", () => {
    const skill = command("skill:simplify", { section: "skills", skillName: "simplify" });

    it("matches and highlights the displayed skill name", () => {
      expect(slashCommandMatch(skill, "sim")).toEqual({
        tier: "prefix",
        highlight: { start: 0, end: 3 },
      });
    });

    it("matches the wire id without highlighting the displayed name", () => {
      expect(slashCommandMatch(skill, "skill:s")).toEqual({ tier: "prefix", highlight: null });
    });
  });

  it("ignores case", () => {
    expect(slashCommandMatch(command("Auto-Mode-Setup"), "SET")).toEqual({
      tier: "wordStart",
      highlight: { start: 10, end: 13 },
    });
  });
});
