import { describe, expect, it } from "vitest";
import {
  THREAD_SESSION_ABSENCE_REFUSAL_CODE,
  ThreadSessionAbsenceRefusalError,
  isThreadSessionAbsenceRefusal,
  isThreadSessionAbsenceRefusalCode,
} from "./threadSessionRefusal";

describe("thread session absence refusal", () => {
  it("marks the carrier with the neutral code and preserves the message verbatim", () => {
    const error = new ThreadSessionAbsenceRefusalError("Unknown thread session: t1");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Unknown thread session: t1");
    expect(error.code).toBe(THREAD_SESSION_ABSENCE_REFUSAL_CODE);
    expect(isThreadSessionAbsenceRefusal(error)).toBe(true);
    expect(isThreadSessionAbsenceRefusalCode(error.code)).toBe(true);
  });

  it("classifies a rehydrated duck-typed reply error without importing the runtime class", () => {
    expect(isThreadSessionAbsenceRefusal({ code: THREAD_SESSION_ABSENCE_REFUSAL_CODE })).toBe(true);
    expect(isThreadSessionAbsenceRefusalCode(THREAD_SESSION_ABSENCE_REFUSAL_CODE)).toBe(true);
  });

  it("never classifies message-only prose, other codes, or non-errors", () => {
    // A plain error that merely mentions an unknown session: the historical
    // shape every legacy client produces. No code, no typed refusal.
    expect(isThreadSessionAbsenceRefusal(new Error("Unknown thread session: t1"))).toBe(false);
    expect(isThreadSessionAbsenceRefusal(new Error("provider said: unknown session gone"))).toBe(
      false,
    );
    expect(isThreadSessionAbsenceRefusal({ code: "command_outcome_uncertain" })).toBe(false);
    expect(isThreadSessionAbsenceRefusal({ code: "host_resource_busy" })).toBe(false);
    expect(isThreadSessionAbsenceRefusal(null)).toBe(false);
    expect(isThreadSessionAbsenceRefusal("unknown_thread_session")).toBe(false);
    expect(isThreadSessionAbsenceRefusal(undefined)).toBe(false);
    expect(isThreadSessionAbsenceRefusalCode("unknown_thread_session ")).toBe(false);
    expect(isThreadSessionAbsenceRefusalCode(undefined)).toBe(false);
  });
});
