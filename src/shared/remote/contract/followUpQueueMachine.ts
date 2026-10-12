/**
 * Executable TS reference for the follow-up queue reduce spec.
 * Native Swift/Kotlin sources are rendered from the same tables.
 */

import {
  FOLLOW_UP_QUEUE_MACHINE_SPEC,
  validateFollowUpQueueMachineSpec,
  type FollowUpQueueAction,
} from "./followUpQueueMachineSpec";

export function followUpQueueReduceAction(input: {
  readonly sameThread: boolean;
  readonly queueKeyPresent: boolean;
  readonly queueIsNull: boolean;
}): FollowUpQueueAction {
  const errors = validateFollowUpQueueMachineSpec(FOLLOW_UP_QUEUE_MACHINE_SPEC);
  if (errors.length > 0) throw new Error(`follow-up queue spec invalid: ${errors.join("; ")}`);
  for (const rule of FOLLOW_UP_QUEUE_MACHINE_SPEC.rules) {
    if (rule.sameThread !== input.sameThread) continue;
    if (rule.queueKeyPresent !== input.queueKeyPresent) continue;
    if (rule.queueIsNull === true && !input.queueIsNull) continue;
    return rule.action;
  }
  return "ignore";
}
