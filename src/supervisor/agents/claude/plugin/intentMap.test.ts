import { describe, expect, it } from "vitest";
import { claudeIntentFor } from "./intentMap";

describe("claudeIntentFor", () => {
  it("maps workflow task lifecycle events to active and finished states", () => {
    expect(claudeIntentFor("TaskCreated", undefined)).toBe("session.turn_started");
    expect(claudeIntentFor("TaskCompleted", undefined)).toBe("session.turn_finished");
  });
});
