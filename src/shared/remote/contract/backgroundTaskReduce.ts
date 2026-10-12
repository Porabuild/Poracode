/**
 * Executable TS reference for the background-task reduce spec.
 * Native Swift/Kotlin sources are rendered from the same tables.
 */

import {
  BACKGROUND_TASK_REDUCE_SPEC,
  validateBackgroundTaskReduceSpec,
  type BackgroundTaskReduceAction,
  type BackgroundTaskReduceKind,
} from "./backgroundTaskReduceSpec";

export type BackgroundTaskIdentity = {
  readonly taskId: string;
  readonly kind: BackgroundTaskReduceKind;
  readonly description: string;
};

export function backgroundTasksEqual(
  left: readonly BackgroundTaskIdentity[] | null | undefined,
  right: readonly BackgroundTaskIdentity[] | null | undefined,
): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  if (left.length !== right.length) return false;
  return left.every(
    (task, index) =>
      task.taskId === right[index]!.taskId &&
      task.kind === right[index]!.kind &&
      task.description === right[index]!.description,
  );
}

export function backgroundTaskReduceAction(input: {
  readonly eventType: string;
  readonly incoming: readonly BackgroundTaskIdentity[] | null;
  readonly previous: readonly BackgroundTaskIdentity[] | null;
}): BackgroundTaskReduceAction {
  const errors = validateBackgroundTaskReduceSpec(BACKGROUND_TASK_REDUCE_SPEC);
  if (errors.length > 0)
    throw new Error(`background-task reduce spec invalid: ${errors.join("; ")}`);
  for (const rule of BACKGROUND_TASK_REDUCE_SPEC.rules) {
    if (rule.event !== input.eventType) continue;
    if (rule.incomingNull === true && input.incoming !== null) continue;
    if (rule.incomingEmpty === true && (input.incoming == null || input.incoming.length > 0)) {
      continue;
    }
    if (rule.incomingEqual === true && !backgroundTasksEqual(input.previous, input.incoming)) {
      continue;
    }
    return rule.action;
  }
  return "noop";
}

export function applyBackgroundTaskReduce(input: {
  readonly eventType: string;
  readonly incoming: readonly BackgroundTaskIdentity[] | null;
  readonly previous: readonly BackgroundTaskIdentity[] | null;
}): readonly BackgroundTaskIdentity[] | null {
  const action = backgroundTaskReduceAction(input);
  if (action === "drain") return null;
  if (action === "noop") return input.previous;
  return input.incoming === null ? input.previous : [...input.incoming];
}
