import {
  BACKGROUND_TASK_REDUCE_SPEC,
  validateBackgroundTaskReduceSpec,
} from "../backgroundTaskReduceSpec";

const HEADER = [
  "// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.",
  `// Background-task reduce machine rendered from the declarative spec in`,
  `// src/shared/remote/contract/backgroundTaskReduceSpec.ts (spec version ${BACKGROUND_TASK_REDUCE_SPEC.specVersion}).`,
  "import Foundation",
  "",
];

export function emitSwiftBackgroundTaskReduce(
  spec: typeof BACKGROUND_TASK_REDUCE_SPEC = BACKGROUND_TASK_REDUCE_SPEC,
): string {
  const errors = validateBackgroundTaskReduceSpec(spec);
  if (errors.length > 0) {
    throw new Error(`background-task reduce spec is invalid: ${errors.join("; ")}`);
  }
  const rules = spec.rules
    .map((rule) => {
      const predicates = [`eventType == ${JSON.stringify(rule.event)}`];
      if (rule.incomingNull) predicates.push("incoming == nil");
      if (rule.incomingEmpty) predicates.push("incoming?.isEmpty == true");
      if (rule.incomingEqual) predicates.push("incoming == previous");
      const action = rule.action;
      return `    if ${predicates.join(" && ")} { return .${action} }`;
    })
    .join("\n");
  return `${HEADER.join("\n")}
public struct RemoteBackgroundTaskIdentity: Equatable, Sendable {
  public var taskId: String
  public var kind: String
  public var description: String
  public init(taskId: String, kind: String, description: String) {
    self.taskId = taskId
    self.kind = kind
    self.description = description
  }
}

public enum RemoteBackgroundTaskReduceAction: String, Sendable {
${spec.actions.map((action) => `  case ${action}`).join("\n")}
}

public enum RemoteBackgroundTaskReduce {
  public static func action(
    eventType: String,
    incoming: [RemoteBackgroundTaskIdentity]?,
    previous: [RemoteBackgroundTaskIdentity]?
  ) -> RemoteBackgroundTaskReduceAction {
${rules}
    return .noop
  }

  public static func apply(
    eventType: String,
    incoming: [RemoteBackgroundTaskIdentity]?,
    previous: [RemoteBackgroundTaskIdentity]?
  ) -> [RemoteBackgroundTaskIdentity]? {
    switch action(eventType: eventType, incoming: incoming, previous: previous) {
    case .drain: return nil
    case .noop: return previous
    case .replace: return incoming
    }
  }
}
`;
}
