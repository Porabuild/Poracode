/**
 * THE background-task reduce spec (V6 E.3).
 *
 * Replace / empty-drain / session.exited drain for `background_tasks.changed`
 * was hand-triplicated across TS/Swift/Kotlin. This module is the one
 * declarative source. Native emitters render it into the generated bundles;
 * `backgroundTaskReduce.ts` is the executable TS reference.
 *
 * Scope: the pure decision machine plus the background-task output result
 * vocabulary. JSON decoding and UI stay hand-written coordinators; the emitted
 * DTO only carries the canonical field names and bounds. The wire protocol is
 * unchanged — `buildRemoteV3IrDocument()` never reads this file.
 */

import { BACKGROUND_TASK_OUTPUT_MAX_UTF16_LENGTH } from "../../contracts/runtimeEvent";

export const BACKGROUND_TASK_REDUCE_ID = "backgroundTaskReduce" as const;
// Version 3 stays: category/command/outputAction are additive optional fields.
// Older generated native structs strip them and reduce on the fields they know;
// newer structs compare them too, so a metadata-only change triggers a replace.
export const BACKGROUND_TASK_REDUCE_SPEC_VERSION = 3 as const;

export const BACKGROUND_TASK_REDUCE_EVENTS = [
  "background_tasks.changed",
  "session.exited",
] as const;
export type BackgroundTaskReduceEvent = (typeof BACKGROUND_TASK_REDUCE_EVENTS)[number];

export const BACKGROUND_TASK_REDUCE_ACTIONS = ["replace", "drain", "noop"] as const;
export type BackgroundTaskReduceAction = (typeof BACKGROUND_TASK_REDUCE_ACTIONS)[number];

export const BACKGROUND_TASK_REDUCE_KINDS = ["command", "other"] as const;
export type BackgroundTaskReduceKind = (typeof BACKGROUND_TASK_REDUCE_KINDS)[number];

/** Mirror of `backgroundTaskCategorySchema`; equality compares this field too. */
export const BACKGROUND_TASK_REDUCE_CATEGORIES = [
  "command",
  "monitor",
  "tool",
  "agent",
  "workflow",
  "other",
] as const;
export type BackgroundTaskReduceCategory = (typeof BACKGROUND_TASK_REDUCE_CATEGORIES)[number];

/**
 * `background-task.output.v1` native result vocabulary. Native emitters render
 * this DTO and its bounds; `totalBytes` stays a JS-safe non-negative integer and
 * `output` is capped by UTF-16 code units, matching the shared zod schema.
 */
export const BACKGROUND_TASK_OUTPUT_ACTION_ID = "background-task.output.v1" as const;
export const BACKGROUND_TASK_OUTPUT_RESULT = {
  actionId: BACKGROUND_TASK_OUTPUT_ACTION_ID,
  fields: ["output", "totalBytes", "truncated"] as const,
  maxOutputUtf16Length: BACKGROUND_TASK_OUTPUT_MAX_UTF16_LENGTH,
  maxTotalBytes: Number.MAX_SAFE_INTEGER,
} as const;

export type BackgroundTaskReduceRule = {
  readonly event: BackgroundTaskReduceEvent;
  readonly incomingNull?: true;
  readonly incomingEmpty?: true;
  readonly incomingEqual?: true;
  readonly action: BackgroundTaskReduceAction;
};

/**
 * Ordered first-match table. `session.exited` always drains (the process that
 * reported the work is gone). An empty replacement list drains the key;
 * an identical list is a no-op so structural version stays still; anything
 * else replaces.
 */
export const BACKGROUND_TASK_REDUCE_RULES: readonly BackgroundTaskReduceRule[] = [
  { event: "session.exited", action: "drain" },
  { event: "background_tasks.changed", incomingNull: true, action: "noop" },
  { event: "background_tasks.changed", incomingEmpty: true, action: "drain" },
  { event: "background_tasks.changed", incomingEqual: true, action: "noop" },
  { event: "background_tasks.changed", action: "replace" },
];

export const BACKGROUND_TASK_REDUCE_SPEC = {
  id: BACKGROUND_TASK_REDUCE_ID,
  specVersion: BACKGROUND_TASK_REDUCE_SPEC_VERSION,
  events: BACKGROUND_TASK_REDUCE_EVENTS,
  actions: BACKGROUND_TASK_REDUCE_ACTIONS,
  kinds: BACKGROUND_TASK_REDUCE_KINDS,
  categories: BACKGROUND_TASK_REDUCE_CATEGORIES,
  outputResult: BACKGROUND_TASK_OUTPUT_RESULT,
  rules: BACKGROUND_TASK_REDUCE_RULES,
} as const;

export function validateBackgroundTaskReduceSpec(
  spec: typeof BACKGROUND_TASK_REDUCE_SPEC,
): readonly string[] {
  const errors: string[] = [];
  if (spec.rules.length === 0) errors.push("rules must not be empty");
  const events = new Set(spec.events);
  const actions = new Set(spec.actions);
  for (const [index, rule] of spec.rules.entries()) {
    if (!events.has(rule.event)) errors.push(`rule ${index} unknown event ${rule.event}`);
    if (!actions.has(rule.action)) errors.push(`rule ${index} unknown action ${rule.action}`);
  }
  if (!spec.rules.some((rule) => rule.event === "session.exited" && rule.action === "drain")) {
    errors.push("session.exited must drain");
  }
  return errors;
}
