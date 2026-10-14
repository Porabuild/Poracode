import { msg } from "@lingui/core/macro";
import type { ScheduledTaskRun } from "@/shared/contracts";

export const scheduleRunStatusMessages = {
  running: msg`Running`,
  "waiting-for-approval": msg`Waiting for approval`,
  succeeded: msg`Succeeded`,
  failed: msg`Failed`,
  cancelled: msg`Cancelled`,
  skipped: msg`Skipped`,
  interrupted: msg`Interrupted`,
} satisfies Record<ScheduledTaskRun["status"], ReturnType<typeof msg>>;
