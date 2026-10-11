import { admissionRetryAfterMsOf } from "./admissionRefusal";

export const GIT_ADMISSION_QUEUE_FULL_CODE = "git_admission_queue_full" as const;
export const GIT_ADMISSION_WAIT_TIMEOUT_CODE = "git_admission_wait_timeout" as const;
export const GIT_ADMISSION_CANCELLED_CODE = "git_admission_cancelled" as const;

export const GIT_PROCESS_ADMISSION_REFUSAL_CODES = [
  GIT_ADMISSION_QUEUE_FULL_CODE,
  GIT_ADMISSION_WAIT_TIMEOUT_CODE,
  GIT_ADMISSION_CANCELLED_CODE,
] as const;

export type GitProcessAdmissionRefusalCode = (typeof GIT_PROCESS_ADMISSION_REFUSAL_CODES)[number];

interface GitAdmissionRefusalLike {
  readonly code?: unknown;
}

export function isGitProcessAdmissionRefusalCode(
  value: unknown,
): value is GitProcessAdmissionRefusalCode {
  return (GIT_PROCESS_ADMISSION_REFUSAL_CODES as readonly unknown[]).includes(value);
}

export function isGitProcessAdmissionRefusal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    isGitProcessAdmissionRefusalCode((error as GitAdmissionRefusalLike).code)
  );
}

export const gitProcessAdmissionRetryAfterMsOf = admissionRetryAfterMsOf;

/** Host-side carrier for a typed Git refusal received over supervisor IPC. */
export class GitProcessAdmissionRefusalError extends Error {
  readonly code: GitProcessAdmissionRefusalCode;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options: { code: GitProcessAdmissionRefusalCode; retryAfterMs?: number },
  ) {
    super(message);
    this.name = "GitProcessAdmissionRefusalError";
    this.code = options.code;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}
