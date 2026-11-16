import { describe, expect, it } from "vitest";
import {
  THREAD_LAUNCH_FAILED_REFUSAL_CODE,
  ThreadLaunchFailedRefusalError,
  isThreadLaunchFailedRefusal,
  isThreadLaunchFailedRefusalCode,
} from "./threadLaunchRefusal";

describe("thread launch failed refusal", () => {
  it("marks the carrier with the neutral code and preserves the message verbatim", () => {
    const error = new ThreadLaunchFailedRefusalError("Failed to start provider session");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Failed to start provider session");
    expect(error.code).toBe(THREAD_LAUNCH_FAILED_REFUSAL_CODE);
    expect(isThreadLaunchFailedRefusal(error)).toBe(true);
    expect(isThreadLaunchFailedRefusalCode(error.code)).toBe(true);
  });

  it("classifies a rehydrated duck-typed reply error without importing the runtime class", () => {
    expect(isThreadLaunchFailedRefusal({ code: THREAD_LAUNCH_FAILED_REFUSAL_CODE })).toBe(true);
    expect(isThreadLaunchFailedRefusalCode(THREAD_LAUNCH_FAILED_REFUSAL_CODE)).toBe(true);
  });

  it("never classifies plain errors, other codes, or non-errors", () => {
    expect(isThreadLaunchFailedRefusal(new Error("Failed to start provider session"))).toBe(false);
    expect(isThreadLaunchFailedRefusal({ code: "command_outcome_uncertain" })).toBe(false);
    expect(isThreadLaunchFailedRefusal({ code: "host_resource_busy" })).toBe(false);
    expect(isThreadLaunchFailedRefusal(null)).toBe(false);
    expect(isThreadLaunchFailedRefusal(THREAD_LAUNCH_FAILED_REFUSAL_CODE)).toBe(false);
    expect(isThreadLaunchFailedRefusal(undefined)).toBe(false);
    expect(isThreadLaunchFailedRefusalCode("thread_launch_failed ")).toBe(false);
    expect(isThreadLaunchFailedRefusalCode(undefined)).toBe(false);
  });
});
