import { describe, expect, it } from "vitest";
import { qoderIntentFor } from "./intentMap";

describe("qoderIntentFor", () => {
  it("maps turn lifecycle events to working and finished states", () => {
    expect(qoderIntentFor("UserPromptSubmit", undefined)).toBe("session.turn_started");
    expect(qoderIntentFor("Stop", undefined)).toBe("session.turn_finished");
    expect(qoderIntentFor("StopFailure", undefined)).toBe("session.turn_errored");
  });

  it("maps permission and tool events to approval-aware states", () => {
    expect(qoderIntentFor("PermissionRequest", undefined)).toBe("session.needs_approval");
    expect(qoderIntentFor("PostToolUse", undefined)).toBe("session.turn_started");
    expect(qoderIntentFor("PostToolUseFailure", undefined)).toBe("session.turn_started");
  });

  it("maps only idle_prompt notifications to needs_reply", () => {
    expect(qoderIntentFor("Notification", { notification_type: "idle_prompt" })).toBe(
      "session.needs_reply",
    );
    expect(
      qoderIntentFor("Notification", { notification_type: "permission_prompt" }),
    ).toBeUndefined();
    expect(qoderIntentFor("Notification", undefined)).toBeUndefined();
  });

  it("maps declined or cancelled elicitations to turn_finished", () => {
    expect(qoderIntentFor("ElicitationResult", { action: "decline" })).toBe(
      "session.turn_finished",
    );
    expect(qoderIntentFor("ElicitationResult", { action: "cancel" })).toBe("session.turn_finished");
    expect(qoderIntentFor("ElicitationResult", { action: "accept" })).toBeUndefined();
  });

  it("maps session start and ignores unknown events", () => {
    expect(qoderIntentFor("SessionStart", undefined)).toBe("session.started");
    expect(qoderIntentFor("PreCompact", undefined)).toBeUndefined();
  });
});
