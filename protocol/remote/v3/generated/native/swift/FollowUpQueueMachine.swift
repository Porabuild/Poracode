// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.
// Follow-up queue reduce machine rendered from the declarative spec in
// src/shared/remote/contract/followUpQueueMachineSpec.ts (spec version 1).
import Foundation

public enum RemoteFollowUpQueueReduceAction: String, Sendable {
  case ignore
  case replace
  case clear
}

public enum RemoteFollowUpQueueReduce {
  public static func action(
    sameThread: Bool,
    queueKeyPresent: Bool,
    queueIsNull: Bool
  ) -> RemoteFollowUpQueueReduceAction {
    if !sameThread && queueKeyPresent { return .ignore }
    if !sameThread && !queueKeyPresent { return .ignore }
    if sameThread && !queueKeyPresent { return .ignore }
    if sameThread && queueKeyPresent && queueIsNull { return .clear }
    if sameThread && queueKeyPresent { return .replace }
    return .ignore
  }
}
