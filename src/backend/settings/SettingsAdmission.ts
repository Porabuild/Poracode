import {
  DEFAULT_SETTINGS_ADMISSION_LIMITS,
  type SettingsAdmissionLimits,
} from "@/shared/settingsTransactions";

export class SettingsAdmission {
  private readonly limits: SettingsAdmissionLimits;
  private pendingTransactions = 0;
  private pendingBytes = 0;

  constructor(limits: Partial<SettingsAdmissionLimits> = {}) {
    this.limits = { ...DEFAULT_SETTINGS_ADMISSION_LIMITS, ...limits };
    if (Object.values(this.limits).some((value) => !Number.isSafeInteger(value) || value < 1))
      throw new Error("Settings admission limits must be positive safe integers.");
  }

  /** Includes the active commit; every reservation is released when its request settles. */
  acquire(bytes: number): { release(): void } | "request-too-large" | "queue-full" {
    if (bytes > this.limits.maxTransactionBytes || bytes > this.limits.maxPendingBytes)
      return "request-too-large";
    if (
      this.pendingTransactions >= this.limits.maxPendingTransactions ||
      this.pendingBytes + bytes > this.limits.maxPendingBytes
    )
      return "queue-full";
    this.pendingTransactions++;
    this.pendingBytes += bytes;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.pendingTransactions--;
        this.pendingBytes -= bytes;
      },
    };
  }
}
