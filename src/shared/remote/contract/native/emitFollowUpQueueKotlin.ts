import {
  FOLLOW_UP_QUEUE_MACHINE_SPEC,
  validateFollowUpQueueMachineSpec,
} from "../followUpQueueMachineSpec";

const HEADER = [
  "// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.",
  "// Follow-up queue reduce machine rendered from the declarative spec in",
  `// src/shared/remote/contract/followUpQueueMachineSpec.ts (spec version ${FOLLOW_UP_QUEUE_MACHINE_SPEC.specVersion}).`,
  "package com.poracode.remote.v3.generated",
  "",
];

export function emitKotlinFollowUpQueueMachine(
  spec: typeof FOLLOW_UP_QUEUE_MACHINE_SPEC = FOLLOW_UP_QUEUE_MACHINE_SPEC,
): string {
  const errors = validateFollowUpQueueMachineSpec(spec);
  if (errors.length > 0) {
    throw new Error(`follow-up queue spec is invalid: ${errors.join("; ")}`);
  }
  const rules = spec.rules
    .map((rule) => {
      const predicates = [
        rule.sameThread ? "sameThread" : "!sameThread",
        rule.queueKeyPresent ? "queueKeyPresent" : "!queueKeyPresent",
      ];
      if (rule.queueIsNull) predicates.push("queueIsNull");
      const action = rule.action[0]!.toUpperCase() + rule.action.slice(1);
      return `        if (${predicates.join(" && ")}) return RemoteFollowUpQueueReduceAction.${action}`;
    })
    .join("\n");
  return `${HEADER.join("\n")}
enum class RemoteFollowUpQueueReduceAction { ${spec.actions.map((action) => action[0]!.toUpperCase() + action.slice(1)).join(", ")} }

object RemoteFollowUpQueueReduce {
    fun action(
        sameThread: Boolean,
        queueKeyPresent: Boolean,
        queueIsNull: Boolean,
    ): RemoteFollowUpQueueReduceAction {
${rules}
        return RemoteFollowUpQueueReduceAction.Ignore
    }
}
`;
}
