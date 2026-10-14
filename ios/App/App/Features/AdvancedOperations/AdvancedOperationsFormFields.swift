import Foundation

/// Every free-text input this feature can present.
enum AdvancedFormFieldKey: String, CaseIterable, Identifiable, Sendable {
  case checkpointItemId
  case baseCheckpointItemId
  case parentItemId
  case prompt
  case manifestPath
  case transcriptDir
  case agentId
  case absolutePath
  case content
  case baseModifiedAtMs
  case path
  case nextName
  case nextParentPath
  case agentKind
  case branch
  case baseBranch
  case effort
  case language
  case model

  var id: String { rawValue }
}

/// Inputs whose wire type is a boolean.
enum AdvancedFormFlagKey: String, CaseIterable, Identifiable, Sendable {
  case includeAgentChats
  case agentFinished
  case fast

  var id: String { rawValue }
}

enum AdvancedFormFieldKind: Equatable, Sendable {
  /// Command or request identifier: submitted byte-for-byte.
  case identifier
  /// Filesystem location: POSIX, Windows, and WSL text all pass through.
  case location
  case singleLine
  case multiline
  /// Non-negative millisecond timestamp.
  case milliseconds
}

struct AdvancedFormFieldDescriptor: Identifiable, Equatable, Sendable {
  let key: AdvancedFormFieldKey
  let kind: AdvancedFormFieldKind
  let isRequired: Bool

  var id: AdvancedFormFieldKey { key }
  var title: String { AdvancedOperationsStrings.field(key) }
  var accessibilityIdentifier: String { "advancedOperations.field.\(key.rawValue)" }
}

struct AdvancedFormFlagDescriptor: Identifiable, Equatable, Sendable {
  let key: AdvancedFormFlagKey
  /// Optional flags keep an explicit "not sent" state.
  let isOptional: Bool

  var id: AdvancedFormFlagKey { key }
  var title: String { AdvancedOperationsStrings.flag(key) }
  var accessibilityIdentifier: String { "advancedOperations.flag.\(key.rawValue)" }
}

/// Static form shape per procedure. Owner-bound values (thread id, project
/// location) are never editable here: they come from the captured lease.
enum AdvancedOperationsForm {
  static func fields(for procedure: AdvancedOperationProcedure) -> [AdvancedFormFieldDescriptor] {
    switch procedure {
    case .createFileCheckpoint:
      [required(.checkpointItemId, .identifier)]
    case .finalizeFileCheckpoint:
      [required(.checkpointItemId, .identifier), required(.baseCheckpointItemId, .identifier)]
    case .subagentSubscribe, .subagentUnsubscribe:
      [required(.parentItemId, .identifier)]
    case .stageThreadInput:
      [required(.prompt, .multiline)]
    case .workflowGetRun:
      [required(.manifestPath, .location), optional(.transcriptDir, .location)]
    case .workflowAgentChat:
      [required(.transcriptDir, .location), required(.agentId, .identifier)]
    case .readAbsoluteFile, .readExternalFile:
      [required(.absolutePath, .location)]
    case .writeExternalFile:
      [
        required(.absolutePath, .location), required(.content, .multiline),
        required(.baseModifiedAtMs, .milliseconds),
      ]
    case .createProjectEntry, .deleteProjectEntry:
      [required(.path, .location)]
    case .renameProjectEntry:
      [required(.path, .location), required(.nextName, .singleLine)]
    case .moveProjectEntry:
      [required(.path, .location), optional(.nextParentPath, .location)]
    case .generateCommitMessage:
      [
        required(.agentKind, .identifier), optional(.effort, .singleLine),
        optional(.language, .singleLine), optional(.model, .identifier),
      ]
    case .generateTitle:
      [
        required(.agentKind, .identifier), required(.prompt, .multiline),
        optional(.effort, .singleLine), optional(.language, .singleLine),
        optional(.model, .identifier),
      ]
    case .generatePrSummary:
      [
        required(.agentKind, .identifier), required(.branch, .singleLine),
        required(.baseBranch, .singleLine), optional(.effort, .singleLine),
        optional(.language, .singleLine), optional(.model, .identifier),
      ]
    }
  }

  static func flags(for procedure: AdvancedOperationProcedure) -> [AdvancedFormFlagDescriptor] {
    switch procedure {
    case .workflowGetRun:
      [AdvancedFormFlagDescriptor(key: .includeAgentChats, isOptional: true)]
    case .workflowAgentChat:
      [AdvancedFormFlagDescriptor(key: .agentFinished, isOptional: false)]
    case .generateCommitMessage, .generateTitle:
      [AdvancedFormFlagDescriptor(key: .fast, isOptional: true)]
    default:
      []
    }
  }

  static func usesEntryType(_ procedure: AdvancedOperationProcedure) -> Bool {
    procedure == .createProjectEntry
  }

  static func usesSegments(_ procedure: AdvancedOperationProcedure) -> Bool {
    procedure == .stageThreadInput
  }

  private static func required(
    _ key: AdvancedFormFieldKey,
    _ kind: AdvancedFormFieldKind
  ) -> AdvancedFormFieldDescriptor {
    AdvancedFormFieldDescriptor(key: key, kind: kind, isRequired: true)
  }

  private static func optional(
    _ key: AdvancedFormFieldKey,
    _ kind: AdvancedFormFieldKind
  ) -> AdvancedFormFieldDescriptor {
    AdvancedFormFieldDescriptor(key: key, kind: kind, isRequired: false)
  }
}
