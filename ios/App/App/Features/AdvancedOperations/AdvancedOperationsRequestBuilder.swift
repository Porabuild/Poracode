import Foundation

/// Draft plus captured lease owner becomes one immutable request.
///
/// The builder never invents owner values and never rewrites user input. Every
/// produced request is checked to own exactly the supplied owner, which is the
/// same comparison the gateway performs before touching the transport.
enum AdvancedOperationsRequestBuilder {
  static func request(
    _ draft: AdvancedOperationDraft,
    owner: AdvancedOperationOwner
  ) throws -> AdvancedOperationRequest {
    guard owner.kind == draft.procedure.metadata.owner else {
      throw AdvancedFormValidationError.ownerMismatch
    }
    let request = try build(draft, owner: owner)
    guard request.owner == owner else { throw AdvancedFormValidationError.ownerMismatch }
    return request
  }

  private static func build(
    _ draft: AdvancedOperationDraft,
    owner: AdvancedOperationOwner
  ) throws -> AdvancedOperationRequest {
    switch draft.procedure {
    case .createFileCheckpoint:
      return .createFileCheckpoint(
        AdvancedCreateFileCheckpointRequest(
          threadId: try threadID(owner),
          checkpointItemId: try text(draft, .checkpointItemId),
          projectLocation: try location(owner)
        )
      )
    case .finalizeFileCheckpoint:
      return .finalizeFileCheckpoint(
        AdvancedFinalizeFileCheckpointRequest(
          threadId: try threadID(owner),
          checkpointItemId: try text(draft, .checkpointItemId),
          baseCheckpointItemId: try text(draft, .baseCheckpointItemId),
          projectLocation: try location(owner)
        )
      )
    case .subagentSubscribe:
      return .subagentSubscribe(try subscription(draft, owner: owner))
    case .subagentUnsubscribe:
      return .subagentUnsubscribe(try subscription(draft, owner: owner))
    case .stageThreadInput:
      return .stageThreadInput(
        AdvancedStageThreadInputRequest(
          threadId: try threadID(owner),
          prompt: try text(draft, .prompt),
          segments: draft.includesSegments
            ? try AdvancedSegmentBuilder.segments(draft.segments) : nil
        )
      )
    case .workflowGetRun:
      return .workflowGetRun(
        AdvancedWorkflowGetRunRequest(
          manifestPath: try text(draft, .manifestPath),
          location: try location(owner),
          includeAgentChats: draft.flag(.includeAgentChats).value,
          transcriptDir: optional(draft, .transcriptDir)
        )
      )
    case .workflowAgentChat:
      return .workflowAgentChat(
        AdvancedWorkflowAgentChatRequest(
          threadId: try threadID(owner),
          transcriptDir: try text(draft, .transcriptDir),
          agentId: try text(draft, .agentId),
          agentFinished: draft.flag(.agentFinished) == .on,
          location: try location(owner)
        )
      )
    case .readAbsoluteFile:
      return .readAbsoluteFile(try externalRead(draft, owner: owner))
    case .readExternalFile:
      return .readExternalFile(try externalRead(draft, owner: owner))
    case .writeExternalFile:
      return .writeExternalFile(
        AdvancedWriteExternalFileRequest(
          projectLocation: try location(owner),
          absolutePath: try text(draft, .absolutePath),
          content: try text(draft, .content),
          baseModifiedAtMs: try AdvancedInputParsing.milliseconds(
            draft.value(.baseModifiedAtMs), .baseModifiedAtMs)
        )
      )
    case .createProjectEntry:
      return .createProjectEntry(
        AdvancedCreateProjectEntryRequest(
          projectLocation: try location(owner),
          path: try text(draft, .path),
          entryType: draft.entryType
        )
      )
    case .renameProjectEntry:
      return .renameProjectEntry(
        AdvancedRenameProjectEntryRequest(
          projectLocation: try location(owner),
          path: try text(draft, .path),
          nextName: try text(draft, .nextName)
        )
      )
    case .moveProjectEntry:
      return .moveProjectEntry(
        AdvancedMoveProjectEntryRequest(
          projectLocation: try location(owner),
          path: try text(draft, .path),
          nextParentPath: optional(draft, .nextParentPath)
        )
      )
    case .deleteProjectEntry:
      return .deleteProjectEntry(
        AdvancedDeleteProjectEntryRequest(
          projectLocation: try location(owner),
          path: try text(draft, .path)
        )
      )
    case .generateCommitMessage:
      return .generateCommitMessage(
        AdvancedGenerateCommitMessageRequest(
          projectLocation: try location(owner),
          agentKind: try text(draft, .agentKind),
          effort: optional(draft, .effort),
          fast: draft.flag(.fast).value,
          language: optional(draft, .language),
          model: optional(draft, .model)
        )
      )
    case .generateTitle:
      return .generateTitle(
        AdvancedGenerateTitleRequest(
          projectLocation: try location(owner),
          agentKind: try text(draft, .agentKind),
          prompt: try text(draft, .prompt),
          effort: optional(draft, .effort),
          fast: draft.flag(.fast).value,
          language: optional(draft, .language),
          model: optional(draft, .model)
        )
      )
    case .generatePrSummary:
      return .generatePrSummary(
        AdvancedGeneratePrSummaryRequest(
          projectLocation: try location(owner),
          agentKind: try text(draft, .agentKind),
          branch: try text(draft, .branch),
          baseBranch: try text(draft, .baseBranch),
          effort: optional(draft, .effort),
          language: optional(draft, .language),
          model: optional(draft, .model)
        )
      )
    }
  }

  private static func subscription(
    _ draft: AdvancedOperationDraft,
    owner: AdvancedOperationOwner
  ) throws -> AdvancedSubagentSubscriptionRequest {
    AdvancedSubagentSubscriptionRequest(
      threadId: try threadID(owner),
      parentItemId: try text(draft, .parentItemId)
    )
  }

  private static func externalRead(
    _ draft: AdvancedOperationDraft,
    owner: AdvancedOperationOwner
  ) throws -> AdvancedReadExternalFileRequest {
    AdvancedReadExternalFileRequest(
      projectLocation: try location(owner),
      absolutePath: try text(draft, .absolutePath)
    )
  }

  private static func threadID(_ owner: AdvancedOperationOwner) throws -> String {
    guard let threadID = owner.threadID, !threadID.isEmpty else {
      throw AdvancedFormValidationError.ownerMismatch
    }
    return threadID
  }

  private static func location(_ owner: AdvancedOperationOwner) throws -> ProjectLocation {
    guard let location = owner.location else {
      throw AdvancedFormValidationError.missingOwnerLocation
    }
    return location
  }

  private static func text(
    _ draft: AdvancedOperationDraft,
    _ key: AdvancedFormFieldKey
  ) throws -> String {
    try AdvancedInputParsing.required(draft.value(key), key)
  }

  private static func optional(
    _ draft: AdvancedOperationDraft,
    _ key: AdvancedFormFieldKey
  ) -> String? {
    AdvancedInputParsing.optional(draft.value(key))
  }
}
