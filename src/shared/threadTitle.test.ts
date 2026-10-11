import { describe, expect, it } from "vitest";
import type { ThreadTitleCommand } from "./contracts";
import { isSlashCommandPrompt, resolveThreadTitlePrompt } from "./threadTitle";

const COMMANDS: readonly ThreadTitleCommand[] = [
  { command: "task", argumentSubcommands: ["amend"], controlArguments: ["stop", "Status"] },
];

describe("resolveThreadTitlePrompt", () => {
  it("titles from a declared command's argument", () => {
    expect(resolveThreadTitlePrompt("/task Ship the fix", COMMANDS)).toBe("Ship the fix");
    expect(resolveThreadTitlePrompt("  /TASK   Ship\n the fix ", COMMANDS)).toBe("Ship\n the fix");
    expect(resolveThreadTitlePrompt("/task amend Ship it", COMMANDS)).toBe("Ship it");
    // After a content subcommand, a control word is content.
    expect(resolveThreadTitlePrompt("/task amend stop", COMMANDS)).toBe("stop");
    // A word that merely starts with a subcommand/control verb is content.
    expect(resolveThreadTitlePrompt("/task amendments first", COMMANDS)).toBe("amendments first");
    expect(resolveThreadTitlePrompt("/task stop the leak", COMMANDS)).toBe("stop the leak");
  });

  it("keeps the prompt for control verbs, bare commands, and everything else", () => {
    for (const prompt of [
      "/task",
      "/task   ",
      "/task stop",
      "/task STATUS",
      "/task amend",
      "/tasks Ship it",
      "/other Ship it",
      "Ship it /task x",
      "plain prompt",
    ]) {
      expect(resolveThreadTitlePrompt(prompt, COMMANDS)).toBe(prompt);
    }
    expect(resolveThreadTitlePrompt("/task Ship it", undefined)).toBe("/task Ship it");
    expect(resolveThreadTitlePrompt("/task Ship it", [])).toBe("/task Ship it");
  });
});

describe("isSlashCommandPrompt", () => {
  it("detects a leading slash command only", () => {
    expect(isSlashCommandPrompt("  /task x")).toBe(true);
    expect(isSlashCommandPrompt("/")).toBe(false);
    expect(isSlashCommandPrompt("/ task")).toBe(false);
    expect(isSlashCommandPrompt("path /task")).toBe(false);
  });
});
