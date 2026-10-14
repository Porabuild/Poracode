import {
  BACKGROUND_TASK_REDUCE_SPEC,
  validateBackgroundTaskReduceSpec,
} from "../backgroundTaskReduceSpec";

const HEADER = [
  "// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.",
  "// Background-task reduce machine rendered from the declarative spec in",
  `// src/shared/remote/contract/backgroundTaskReduceSpec.ts (spec version ${BACKGROUND_TASK_REDUCE_SPEC.specVersion}).`,
  "package com.poracode.remote.v3.generated",
  "",
];

export function emitKotlinBackgroundTaskReduce(
  spec: typeof BACKGROUND_TASK_REDUCE_SPEC = BACKGROUND_TASK_REDUCE_SPEC,
): string {
  const errors = validateBackgroundTaskReduceSpec(spec);
  if (errors.length > 0) {
    throw new Error(`background-task reduce spec is invalid: ${errors.join("; ")}`);
  }
  const rules = spec.rules
    .map((rule) => {
      const predicates = [`eventType == ${JSON.stringify(rule.event)}`];
      if (rule.incomingNull) predicates.push("incoming == null");
      if (rule.incomingEmpty) predicates.push("incoming?.isEmpty() == true");
      if (rule.incomingEqual) predicates.push("incoming == previous");
      const action = rule.action[0]!.toUpperCase() + rule.action.slice(1);
      return `        if (${predicates.join(" && ")}) return RemoteBackgroundTaskReduceAction.${action}`;
    })
    .join("\n");
  return `${HEADER.join("\n")}
data class RemoteBackgroundTaskIdentity(
    val taskId: String,
    val kind: String,
    val description: String,
)

enum class RemoteBackgroundTaskReduceAction { ${spec.actions.map((action) => action[0]!.toUpperCase() + action.slice(1)).join(", ")} }

object RemoteBackgroundTaskReduce {
    fun action(
        eventType: String,
        incoming: List<RemoteBackgroundTaskIdentity>?,
        previous: List<RemoteBackgroundTaskIdentity>?,
    ): RemoteBackgroundTaskReduceAction {
${rules}
        return RemoteBackgroundTaskReduceAction.Noop
    }

    fun apply(
        eventType: String,
        incoming: List<RemoteBackgroundTaskIdentity>?,
        previous: List<RemoteBackgroundTaskIdentity>?,
    ): List<RemoteBackgroundTaskIdentity>? = when (
        action(eventType, incoming, previous)
    ) {
        RemoteBackgroundTaskReduceAction.Drain -> null
        RemoteBackgroundTaskReduceAction.Noop -> previous
        RemoteBackgroundTaskReduceAction.Replace -> incoming
    }
}
`;
}
