import { describe, expect, it } from "vitest";
import {
  isStaleCodexTurnCompletion,
  nextCodexInterruptTurnId,
  parseCodexActiveTurnMismatch,
} from "./turnInterrupt";

describe("isStaleCodexTurnCompletion", () => {
  it("ignores a previous turn completing after a newer turn has started", () => {
    expect(
      isStaleCodexTurnCompletion({ turn: { id: "turn-old", status: "completed" } }, "turn-new"),
    ).toBe(true);
  });

  it("treats a matching or unknown completion as current", () => {
    expect(isStaleCodexTurnCompletion({ turn: { id: "turn-1" } }, "turn-1")).toBe(false);
    expect(isStaleCodexTurnCompletion({ threadId: "t" }, "turn-1")).toBe(false);
    expect(isStaleCodexTurnCompletion({ turn: { id: "turn-1" } }, undefined)).toBe(false);
  });
});

describe("parseCodexActiveTurnMismatch", () => {
  it("reads the ids from the app-server interrupt rejection", () => {
    expect(
      parseCodexActiveTurnMismatch(
        new Error(
          "expected active turn id 019ff68d-724b-73f2-a9d9-b850dceb285e but found 208b2edd-284d-40c0-9414-5dafb52f8362",
        ),
      ),
    ).toEqual({
      expected: "019ff68d-724b-73f2-a9d9-b850dceb285e",
      found: "208b2edd-284d-40c0-9414-5dafb52f8362",
    });
  });

  it("returns undefined for unrelated interrupt errors", () => {
    expect(parseCodexActiveTurnMismatch(new Error("no active turn to interrupt"))).toBeUndefined();
  });
});

describe("nextCodexInterruptTurnId", () => {
  it("retries with the id we did not just send", () => {
    const error = new Error("expected active turn id turn-live but found turn-stale");
    expect(nextCodexInterruptTurnId("turn-stale", error)).toBe("turn-live");
    expect(nextCodexInterruptTurnId("turn-live", error)).toBe("turn-stale");
  });

  it("does not invent a retry when the error is not a mismatch", () => {
    expect(
      nextCodexInterruptTurnId("turn-1", new Error("no active turn to interrupt")),
    ).toBeUndefined();
  });
});
