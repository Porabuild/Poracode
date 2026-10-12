import Foundation

enum AdvancedOperationScope: String, CaseIterable, Sendable {
  case sessionRead = "session:read"
  case sessionOperate = "session:operate"
  case projectsManage = "projects:manage"
}

enum AdvancedOperationOwnerKind: String, Sendable {
  case thread
  case location
  case projectLocation
}

enum AdvancedOperationResultKind: String, Sendable {
  case json
  case omitted
}

enum AdvancedOperationTimeout: String, Sendable {
  case standard
  case long
}

enum AdvancedOperationDelivery: Sendable {
  case readOnly
  case singleAttempt
}

struct AdvancedOperationMetadata: Equatable, Sendable {
  let scope: AdvancedOperationScope
  let owner: AdvancedOperationOwnerKind
  let resultKind: AdvancedOperationResultKind
  let timeout: AdvancedOperationTimeout
  let delivery: AdvancedOperationDelivery
}

enum AdvancedOperationProcedure: String, CaseIterable, Codable, Sendable {
  case createFileCheckpoint
  case finalizeFileCheckpoint
  case subagentSubscribe
  case subagentUnsubscribe
  case stageThreadInput
  case workflowGetRun
  case workflowAgentChat
  case readAbsoluteFile
  case readExternalFile
  case writeExternalFile
  case createProjectEntry
  case renameProjectEntry
  case moveProjectEntry
  case deleteProjectEntry
  case generateCommitMessage
  case generateTitle
  case generatePrSummary
}

extension AdvancedOperationProcedure {
  var metadata: AdvancedOperationMetadata {
    switch self {
    case .createFileCheckpoint, .finalizeFileCheckpoint:
      AdvancedOperationMetadata(
        scope: .sessionOperate,
        owner: .thread,
        resultKind: .json,
        timeout: .standard,
        delivery: .singleAttempt
      )
    case .subagentSubscribe:
      AdvancedOperationMetadata(
        scope: .sessionRead,
        owner: .thread,
        resultKind: .json,
        timeout: .standard,
        delivery: .singleAttempt
      )
    case .subagentUnsubscribe:
      AdvancedOperationMetadata(
        scope: .sessionRead,
        owner: .thread,
        resultKind: .omitted,
        timeout: .standard,
        delivery: .singleAttempt
      )
    case .stageThreadInput:
      AdvancedOperationMetadata(
        scope: .sessionOperate,
        owner: .thread,
        resultKind: .omitted,
        timeout: .standard,
        delivery: .singleAttempt
      )
    case .workflowGetRun, .workflowAgentChat:
      AdvancedOperationMetadata(
        scope: .sessionRead,
        owner: .location,
        resultKind: .json,
        timeout: .standard,
        delivery: .readOnly
      )
    case .readAbsoluteFile, .readExternalFile:
      AdvancedOperationMetadata(
        scope: .projectsManage,
        owner: .projectLocation,
        resultKind: .json,
        timeout: .standard,
        delivery: .readOnly
      )
    case .writeExternalFile:
      AdvancedOperationMetadata(
        scope: .projectsManage,
        owner: .projectLocation,
        resultKind: .json,
        timeout: .standard,
        delivery: .singleAttempt
      )
    case .createProjectEntry, .renameProjectEntry, .moveProjectEntry,
      .deleteProjectEntry:
      AdvancedOperationMetadata(
        scope: .sessionOperate,
        owner: .projectLocation,
        resultKind: .omitted,
        timeout: .standard,
        delivery: .singleAttempt
      )
    case .generateCommitMessage, .generateTitle, .generatePrSummary:
      AdvancedOperationMetadata(
        scope: .sessionOperate,
        owner: .projectLocation,
        resultKind: .json,
        timeout: .long,
        delivery: .singleAttempt
      )
    }
  }
}
