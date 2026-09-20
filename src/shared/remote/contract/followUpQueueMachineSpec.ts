/**
 * THE follow-up queue reduce spec (V6 E.3).
 *
 * Replace-on-event / null-clear / wrong-thread ignore for the replayable
 * `thread-follow-up-queue` broadcast was hand-triplicated across
 * TS/Swift/Kotlin. This module is the one declarative source. Native emitters
 * render it into the generated bundles; `followUpQueueMachine.ts` is the
 * executable TS reference.
 *
 * Scope: the pure decision machine only. JSON decoding, item shape, buffering
 * during history load, and UI stay hand-written coordinators. The wire
 * protocol is unchanged — `buildRemoteV3IrDocument()` never reads this file.
 */

export const FOLLOW_UP_QUEUE_MACHINE_ID = "followUpQueue" as const;
export const FOLLOW_UP_QUEUE_MACHINE_SPEC_VERSION = 1 as const;

export const FOLLOW_UP_QUEUE_EVENTS = ["thread-follow-up-queue"] as const;
export type FollowUpQueueEvent = (typeof FOLLOW_UP_QUEUE_EVENTS)[number];

export const FOLLOW_UP_QUEUE_ACTIONS = ["ignore", "replace", "clear"] as const;
export type FollowUpQueueAction = (typeof FOLLOW_UP_QUEUE_ACTIONS)[number];

export type FollowUpQueueRule = {
  readonly sameThread: boolean;
  readonly queueKeyPresent: boolean;
  readonly queueIsNull?: true;
  readonly action: FollowUpQueueAction;
};

/**
 * Ordered first-match table. A foreign thread or a missing `queue` key is
 * ignored so one bad/stale frame cannot clobber another transcript. `queue:
 * null` clears (no queue). A present object replaces, including empty+paused.
 */
export const FOLLOW_UP_QUEUE_RULES: readonly FollowUpQueueRule[] = [
  { sameThread: false, queueKeyPresent: true, action: "ignore" },
  { sameThread: false, queueKeyPresent: false, action: "ignore" },
  { sameThread: true, queueKeyPresent: false, action: "ignore" },
  { sameThread: true, queueKeyPresent: true, queueIsNull: true, action: "clear" },
  { sameThread: true, queueKeyPresent: true, action: "replace" },
];

export const FOLLOW_UP_QUEUE_MACHINE_SPEC = {
  id: FOLLOW_UP_QUEUE_MACHINE_ID,
  specVersion: FOLLOW_UP_QUEUE_MACHINE_SPEC_VERSION,
  events: FOLLOW_UP_QUEUE_EVENTS,
  actions: FOLLOW_UP_QUEUE_ACTIONS,
  rules: FOLLOW_UP_QUEUE_RULES,
} as const;

export function validateFollowUpQueueMachineSpec(
  spec: typeof FOLLOW_UP_QUEUE_MACHINE_SPEC,
): readonly string[] {
  const errors: string[] = [];
  if (spec.rules.length === 0) errors.push("rules must not be empty");
  const actions = new Set(spec.actions);
  for (const [index, rule] of spec.rules.entries()) {
    if (!actions.has(rule.action)) errors.push(`rule ${index} unknown action ${rule.action}`);
  }
  if (!spec.rules.some((rule) => rule.sameThread === false && rule.action === "ignore")) {
    errors.push("foreign thread must ignore");
  }
  if (
    !spec.rules.some(
      (rule) =>
        rule.sameThread && rule.queueKeyPresent && rule.queueIsNull && rule.action === "clear",
    )
  ) {
    errors.push("null queue must clear");
  }
  return errors;
}
