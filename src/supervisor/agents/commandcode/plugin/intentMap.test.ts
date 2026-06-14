import { describe, expect, it } from "vitest";
import { commandCodeIntentFor } from "./intentMap";

describe("commandCodeIntentFor", () => {
  it("maps tool-use events to session.turn_started (working)", () => {
    expect(commandCodeIntentFor("PreToolUse")).toBe("session.turn_started");
    expect(commandCodeIntentFor("PostToolUse")).toBe("session.turn_started");
  });

  it("maps Stop to session.turn_finished (idle)", () => {
    expect(commandCodeIntentFor("Stop")).toBe("session.turn_finished");
  });

  it("prefers payload.hook_event_name over the argv eventName", () => {
    expect(commandCodeIntentFor("PreToolUse", { hook_event_name: "Stop" })).toBe(
      "session.turn_finished",
    );
    expect(commandCodeIntentFor("anything", { hook_event_name: "PostToolUse" })).toBe(
      "session.turn_started",
    );
  });

  it("returns undefined for unmapped events", () => {
    // Command Code validates only PreToolUse / PostToolUse / Stop. Anything
    // else (incl. would-be UserPromptSubmit / Notification) is unmapped.
    expect(commandCodeIntentFor("UserPromptSubmit")).toBeUndefined();
    expect(commandCodeIntentFor("Notification")).toBeUndefined();
    expect(commandCodeIntentFor("SessionStart")).toBeUndefined();
    expect(commandCodeIntentFor("")).toBeUndefined();
  });
});
