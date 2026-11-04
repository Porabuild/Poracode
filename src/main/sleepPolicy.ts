import type { KeepAwakeCondition, SharedSettings } from "@/shared/settings";

type SleepPolicySettings = Pick<
  SharedSettings,
  "preventSleepWhen" | "preventScreenLockWhen" | "remoteAccessEnabled"
>;

/** Live host signals the keep-awake conditions are evaluated against. */
export interface KeepAwakeActivity {
  /** Threads currently working, Computer Use threads included. */
  workingThreadCount: number;
  /** Whether a working thread has an enabled or acting Computer Use session. */
  computerUseActive: boolean;
}

function anyConditionMet(
  conditions: readonly KeepAwakeCondition[],
  remoteAccessEnabled: boolean,
  activity: KeepAwakeActivity,
): boolean {
  return conditions.some((condition) => {
    switch (condition) {
      case "always":
        return true;
      case "working":
        return activity.workingThreadCount > 0;
      case "computer-use":
        return activity.computerUseActive;
      case "remote-access":
        return remoteAccessEnabled;
    }
  });
}

export function shouldPreventSystemSleep(
  settings: SleepPolicySettings,
  activity: KeepAwakeActivity,
): boolean {
  return anyConditionMet(settings.preventSleepWhen, settings.remoteAccessEnabled, activity);
}

export function shouldPreventScreenLock(
  settings: SleepPolicySettings,
  activity: KeepAwakeActivity,
): boolean {
  return anyConditionMet(settings.preventScreenLockWhen, settings.remoteAccessEnabled, activity);
}
