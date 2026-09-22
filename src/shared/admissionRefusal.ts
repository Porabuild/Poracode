interface AdmissionRefusalLike {
  readonly retryAfterMs?: unknown;
}

/** Carry only a nonnegative safe-integer retry hint across trust boundaries. */
export function admissionRetryAfterMsOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = (error as AdmissionRefusalLike).retryAfterMs;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
