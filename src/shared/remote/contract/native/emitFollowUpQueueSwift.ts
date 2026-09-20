import {
  FOLLOW_UP_QUEUE_MACHINE_SPEC,
  validateFollowUpQueueMachineSpec,
} from "../followUpQueueMachineSpec";

const HEADER = [
  "// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.",
  `// Follow-up queue reduce machine rendered from the declarative spec in`,
  `// src/shared/remote/contract/followUpQueueMachineSpec.ts (spec version ${FOLLOW_UP_QUEUE_MACHINE_SPEC.specVersion}).`,
  "import Foundation",
  "",
];

export function emitSwiftFollowUpQueueMachine(
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
      const action = rule.action;
      return `    if ${predicates.join(" && ")} { return .${action} }`;
    })
    .join("\n");
  return `${HEADER.join("\n")}
public enum RemoteFollowUpQueueReduceAction: String, Sendable {
${spec.actions.map((action) => `  case ${action}`).join("\n")}
}

public enum RemoteFollowUpQueueReduce {
  public static func action(
    sameThread: Bool,
    queueKeyPresent: Bool,
    queueIsNull: Bool
  ) -> RemoteFollowUpQueueReduceAction {
${rules}
    return .ignore
  }
}
`;
}
