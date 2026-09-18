import Foundation

struct AdvancedRuntimeEvent: Codable, Equatable, Sendable {
  let fields: [String: AdvancedJSONValue]

  var type: String? { fields["type"]?.stringValue }
  var threadID: String? { fields["threadId"]?.stringValue }

  init(fields: [String: AdvancedJSONValue]) {
    self.fields = fields
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    fields = try container.decode([String: AdvancedJSONValue].self)
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(fields)
  }
}

struct AdvancedFileCheckpoint: Codable, Equatable, Sendable {
  let threadId: String
  let checkpointItemId: String
  let ref: String
  let commit: String
  let capturedAt: String
}

struct AdvancedFileChange: Codable, Equatable, Sendable {
  let path: String
  let oldPath: String?
  let status: String
}

struct AdvancedFinalizedFileCheckpoint: Codable, Equatable, Sendable {
  let threadId: String
  let checkpointItemId: String
  let ref: String
  let commit: String
  let capturedAt: String
  let baseCheckpointItemId: String
  let baseRef: String
  let changedFiles: [AdvancedFileChange]
}

struct AdvancedCreateFileCheckpointResult: Codable, Equatable, Sendable {
  let checkpoint: AdvancedFileCheckpoint
}

struct AdvancedFinalizeFileCheckpointResult: Codable, Equatable, Sendable {
  let checkpoint: AdvancedFinalizedFileCheckpoint
}

struct AdvancedSubagentSubscribeResult: Codable, Equatable, Sendable {
  let history: [AdvancedRuntimeEvent]
}

struct AdvancedWorkflowAgentChatResult: Codable, Equatable, Sendable {
  let events: [AdvancedRuntimeEvent]
}

enum AdvancedWorkflowChatRole: String, Codable, Sendable {
  case user
  case assistant
  case tool
}

struct AdvancedWorkflowChatEntry: Codable, Equatable, Sendable {
  let role: AdvancedWorkflowChatRole
  let text: String?
  let timestamp: String?
  let title: String?
}

enum AdvancedWorkflowAgentState: String, Codable, Sendable {
  case queued
  case running
  case done
  case failed
  case cancelled
}

struct AdvancedWorkflowAgent: Codable, Equatable, Identifiable, Sendable {
  let agentId: String
  let label: String
  let attempt: Int64?
  let chat: [AdvancedWorkflowChatEntry]?
  let durationMs: Int64?
  let lastProgressAt: Int64?
  let lastToolName: String?
  let model: String?
  let phaseIndex: Int64?
  let phaseTitle: String?
  let promptPreview: String?
  let queuedAt: Int64?
  let resultPreview: String?
  let startedAt: Int64?
  let state: AdvancedWorkflowAgentState?
  let tokens: Int64?
  let toolCalls: Int64?

  var id: String { agentId }
}

struct AdvancedWorkflowPhase: Codable, Equatable, Sendable {
  let title: String
  let agents: [AdvancedWorkflowAgent]
  let detail: String?
}

enum AdvancedWorkflowRunStatus: String, Codable, Sendable {
  case running
  case completed
  case failed
  case cancelled
  case unknown
}

struct AdvancedWorkflowRun: Codable, Equatable, Identifiable, Sendable {
  let runId: String
  let status: AdvancedWorkflowRunStatus
  let agentCount: Int64
  let phases: [AdvancedWorkflowPhase]
  let unphasedAgents: [AdvancedWorkflowAgent]
  let defaultModel: String?
  let durationMs: Int64?
  let scriptPath: String?
  let startTime: Int64?
  let summary: String?
  let taskId: String?
  let totalTokens: Int64?
  let totalToolCalls: Int64?
  let workflowName: String?

  var id: String { runId }
}

struct AdvancedWorkflowGetRunResult: Codable, Equatable, Sendable {
  let run: AdvancedWorkflowRun?
  let mtimeMs: Double?
}

enum AdvancedFileReadStatus: String, Codable, Sendable {
  case ready
  case binary
  case tooLarge = "too_large"
  case unsupported
  case missing
}

enum AdvancedLineEnding: String, Codable, Sendable {
  case lf
  case crlf
}

struct AdvancedAbsoluteFileResult: Codable, Equatable, Sendable {
  let status: AdvancedFileReadStatus
  let content: String?
  let modifiedAtMs: Double?
}

struct AdvancedExternalFileResult: Codable, Equatable, Sendable {
  let path: String
  let status: AdvancedFileReadStatus
  let modifiedAtMs: Double
  let content: String?
  let contentBase64: String?
  let hasBom: Bool?
  let lineEnding: AdvancedLineEnding?
}

struct AdvancedWriteExternalFileResult: Codable, Equatable, Sendable {
  let modifiedAtMs: Double
}

struct AdvancedGeneratedCommitMessage: Codable, Equatable, Sendable {
  let message: String
}

struct AdvancedGeneratedTitle: Codable, Equatable, Sendable {
  let title: String
}

struct AdvancedGeneratedPrSummary: Codable, Equatable, Sendable {
  let title: String
  let description: String
}

enum AdvancedOperationResult: Equatable, Sendable {
  case createFileCheckpoint(AdvancedCreateFileCheckpointResult)
  case finalizeFileCheckpoint(AdvancedFinalizeFileCheckpointResult)
  case subagentSubscribe(AdvancedSubagentSubscribeResult)
  case workflowGetRun(AdvancedWorkflowGetRunResult)
  case workflowAgentChat(AdvancedWorkflowAgentChatResult)
  case readAbsoluteFile(AdvancedAbsoluteFileResult)
  case readExternalFile(AdvancedExternalFileResult)
  case writeExternalFile(AdvancedWriteExternalFileResult)
  case generatedCommitMessage(AdvancedGeneratedCommitMessage)
  case generatedTitle(AdvancedGeneratedTitle)
  case generatedPrSummary(AdvancedGeneratedPrSummary)
  case omitted
}
