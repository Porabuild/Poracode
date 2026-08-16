import Foundation

enum AdvancedOperationRequest: Equatable, Sendable {
  case createFileCheckpoint(AdvancedCreateFileCheckpointRequest)
  case finalizeFileCheckpoint(AdvancedFinalizeFileCheckpointRequest)
  case subagentSubscribe(AdvancedSubagentSubscriptionRequest)
  case subagentUnsubscribe(AdvancedSubagentSubscriptionRequest)
  case stageThreadInput(AdvancedStageThreadInputRequest)
  case workflowGetRun(AdvancedWorkflowGetRunRequest)
  case workflowAgentChat(AdvancedWorkflowAgentChatRequest)
  case readAbsoluteFile(AdvancedReadExternalFileRequest)
  case readExternalFile(AdvancedReadExternalFileRequest)
  case writeExternalFile(AdvancedWriteExternalFileRequest)
  case createProjectEntry(AdvancedCreateProjectEntryRequest)
  case renameProjectEntry(AdvancedRenameProjectEntryRequest)
  case moveProjectEntry(AdvancedMoveProjectEntryRequest)
  case deleteProjectEntry(AdvancedDeleteProjectEntryRequest)
  case generateCommitMessage(AdvancedGenerateCommitMessageRequest)
  case generateTitle(AdvancedGenerateTitleRequest)
  case generatePrSummary(AdvancedGeneratePrSummaryRequest)

  var procedure: AdvancedOperationProcedure {
    switch self {
    case .createFileCheckpoint: .createFileCheckpoint
    case .finalizeFileCheckpoint: .finalizeFileCheckpoint
    case .subagentSubscribe: .subagentSubscribe
    case .subagentUnsubscribe: .subagentUnsubscribe
    case .stageThreadInput: .stageThreadInput
    case .workflowGetRun: .workflowGetRun
    case .workflowAgentChat: .workflowAgentChat
    case .readAbsoluteFile: .readAbsoluteFile
    case .readExternalFile: .readExternalFile
    case .writeExternalFile: .writeExternalFile
    case .createProjectEntry: .createProjectEntry
    case .renameProjectEntry: .renameProjectEntry
    case .moveProjectEntry: .moveProjectEntry
    case .deleteProjectEntry: .deleteProjectEntry
    case .generateCommitMessage: .generateCommitMessage
    case .generateTitle: .generateTitle
    case .generatePrSummary: .generatePrSummary
    }
  }

  var owner: AdvancedOperationOwner {
    switch self {
    case .createFileCheckpoint(let value):
      .thread(threadID: value.threadId, projectLocation: value.projectLocation)
    case .finalizeFileCheckpoint(let value):
      .thread(threadID: value.threadId, projectLocation: value.projectLocation)
    case .subagentSubscribe(let value), .subagentUnsubscribe(let value):
      .thread(threadID: value.threadId, projectLocation: nil)
    case .stageThreadInput(let value):
      .thread(threadID: value.threadId, projectLocation: nil)
    case .workflowGetRun(let value):
      .location(value.location, threadID: nil)
    case .workflowAgentChat(let value):
      .location(value.location, threadID: value.threadId)
    case .readAbsoluteFile(let value), .readExternalFile(let value):
      .projectLocation(value.projectLocation)
    case .writeExternalFile(let value):
      .projectLocation(value.projectLocation)
    case .createProjectEntry(let value):
      .projectLocation(value.projectLocation)
    case .renameProjectEntry(let value):
      .projectLocation(value.projectLocation)
    case .moveProjectEntry(let value):
      .projectLocation(value.projectLocation)
    case .deleteProjectEntry(let value):
      .projectLocation(value.projectLocation)
    case .generateCommitMessage(let value):
      .projectLocation(value.projectLocation)
    case .generateTitle(let value):
      .projectLocation(value.projectLocation)
    case .generatePrSummary(let value):
      .projectLocation(value.projectLocation)
    }
  }
}
