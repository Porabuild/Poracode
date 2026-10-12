import { describe, expect, it } from "vitest";
import { resolveThreadTitlePrompt } from "@/shared/threadTitle";
import { museDefaultCapabilities } from "../detection";

import { isMuseCompactCommand, museGoalCommandMethod, parseMuseGoalCommand } from "./localCommands";

describe("isMuseCompactCommand", () => {
  it("matches the bare gesture regardless of case and padding", () => {
    expect(isMuseCompactCommand("/compact")).toBe(true);
    expect(isMuseCompactCommand("  /compact  ")).toBe(true);
    expect(isMuseCompactCommand("/COMPACT")).toBe(true);
  });

  it("does not match prompts that merely mention it", () => {
    expect(isMuseCompactCommand("/compact now")).toBe(false);
    expect(isMuseCompactCommand("please run /compact")).toBe(false);
    expect(isMuseCompactCommand("compact")).toBe(false);
    expect(isMuseCompactCommand("")).toBe(false);
  });
});

describe("parseMuseGoalCommand", () => {
  it("parses the bare view gesture", () => {
    expect(parseMuseGoalCommand("/goal")).toEqual({ kind: "view" });
    expect(parseMuseGoalCommand("  /GOAL  ")).toEqual({ kind: "view" });
  });

  it("sets any other text as the objective", () => {
    expect(parseMuseGoalCommand("/goal Ship the feature")).toEqual({
      kind: "set",
      objective: "Ship the feature",
    });
  });

  it("parses bare verbs case-insensitively", () => {
    expect(parseMuseGoalCommand("/goal pause")).toEqual({ kind: "pause" });
    expect(parseMuseGoalCommand("/goal RESUME")).toEqual({ kind: "resume" });
    expect(parseMuseGoalCommand("/goal Clear")).toEqual({ kind: "clear" });
    expect(parseMuseGoalCommand("/goal reset")).toEqual({ kind: "clear" });
  });

  it("parses edit with an objective and flags a bare edit", () => {
    expect(parseMuseGoalCommand("/goal edit Ship it faster")).toEqual({
      kind: "edit",
      objective: "Ship it faster",
    });
    expect(parseMuseGoalCommand("/goal edit")).toEqual({ kind: "editUsage" });
    expect(parseMuseGoalCommand("/goal edit   ")).toEqual({ kind: "editUsage" });
  });

  it("keeps objectives that start with a verb word as set", () => {
    expect(parseMuseGoalCommand("/goal pause for thought")).toEqual({
      kind: "set",
      objective: "pause for thought",
    });
    expect(parseMuseGoalCommand("/goal clear the backlog")).toEqual({
      kind: "set",
      objective: "clear the backlog",
    });
  });

  it("ignores non-goal prompts", () => {
    expect(parseMuseGoalCommand("/compact")).toBeUndefined();
    expect(parseMuseGoalCommand("please /goal")).toBeUndefined();
    expect(parseMuseGoalCommand("goal")).toBeUndefined();
    expect(parseMuseGoalCommand("")).toBeUndefined();
  });
});

describe("museGoalCommandMethod", () => {
  it("maps parsed gestures and dock controls to goal RPCs", () => {
    expect(museGoalCommandMethod("set")).toBe("goal/set");
    expect(museGoalCommandMethod("edit")).toBe("goal/edit");
    expect(museGoalCommandMethod("pause")).toBe("goal/pause");
    expect(museGoalCommandMethod("resume")).toBe("goal/resume");
    expect(museGoalCommandMethod("clear")).toBe("goal/clear");
    expect(museGoalCommandMethod("view")).toBeUndefined();
    expect(museGoalCommandMethod("editUsage")).toBeUndefined();
  });
});

describe("Muse /goal thread titles", () => {
  const prompts = [
    "/goal Reply with a haiku",
    "/GOAL   reply with a haiku ",
    "/goal edit Ship the fix",
    "/goal edit pause",
    "/goal pause for thought",
    "/goal editorial pass",
    "/goal",
    "/goal edit",
    "/goal pause",
    "/goal Resume",
    "/goal clear",
    "/goal reset",
    "/goal off",
    "/goal none",
    "/goals are nice",
    "/compact",
    "Explain the build",
  ];

  it.each(prompts)(
    "titles %j from exactly what the goal parser treats as the objective",
    (prompt) => {
      const command = parseMuseGoalCommand(prompt);
      const expected =
        command?.kind === "set" || command?.kind === "edit" ? command.objective : prompt;
      expect(resolveThreadTitlePrompt(prompt, museDefaultCapabilities.threadTitleCommands)).toBe(
        expected,
      );
    },
  );
});
