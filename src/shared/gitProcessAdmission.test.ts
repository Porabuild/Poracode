import { describe, expect, it } from "vitest";
import {
  GIT_ADMISSION_QUEUE_FULL_CODE,
  GitProcessAdmissionRefusalError,
  gitProcessAdmissionRetryAfterMsOf,
  isGitProcessAdmissionRefusal,
  isGitProcessAdmissionRefusalCode,
} from "./gitProcessAdmission";

describe("shared Git process admission refusal", () => {
  it("recognizes only the declared refusal codes and keeps a finite retry hint", () => {
    const error = new GitProcessAdmissionRefusalError("busy", {
      code: GIT_ADMISSION_QUEUE_FULL_CODE,
      retryAfterMs: 250,
    });
    expect(isGitProcessAdmissionRefusal(error)).toBe(true);
    expect(isGitProcessAdmissionRefusalCode(error.code)).toBe(true);
    expect(gitProcessAdmissionRetryAfterMsOf(error)).toBe(250);
    expect(isGitProcessAdmissionRefusal(Object.assign(new Error("no"), { code: "EIO" }))).toBe(
      false,
    );
  });
});
