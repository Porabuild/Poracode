import { describe, expect, it } from "vitest";
import { isMicrophoneAccessDeniedError } from "./voicePermission";

describe("isMicrophoneAccessDeniedError", () => {
  it("is true for a NotAllowedError DOMException", () => {
    expect(isMicrophoneAccessDeniedError(new DOMException("denied", "NotAllowedError"))).toBe(true);
  });

  it("is true for a SecurityError DOMException", () => {
    expect(isMicrophoneAccessDeniedError(new DOMException("blocked", "SecurityError"))).toBe(true);
  });

  it("is false for a NotFoundError DOMException (no device, not a denial)", () => {
    expect(isMicrophoneAccessDeniedError(new DOMException("missing", "NotFoundError"))).toBe(false);
  });

  it("is false for a generic Error", () => {
    expect(isMicrophoneAccessDeniedError(new Error("boom"))).toBe(false);
  });

  it("is false for non-error values", () => {
    expect(isMicrophoneAccessDeniedError("denied")).toBe(false);
    expect(isMicrophoneAccessDeniedError(null)).toBe(false);
  });
});
