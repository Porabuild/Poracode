import Foundation

enum RichChatCapability: String, CaseIterable, Hashable, Sendable {
  case sessionRead = "session:read"
  case sessionOperate = "session:operate"
  case terminalRead = "terminal:read"
  case terminalOperate = "terminal:operate"
  case requestsResolve = "requests:resolve"
}

struct RichChatHostLease: Hashable, Sendable {
  let connectionID: ClientConnectionID
  let generation: UInt64
}

struct RichChatThreadTarget: Hashable, Sendable {
  let lease: RichChatHostLease
  let threadID: String
}

struct RichChatSessionAccess: Equatable, Sendable {
  let lease: RichChatHostLease
  let isOnline: Bool
  let isReady: Bool
  let capabilities: Set<RichChatCapability>
  /// B1: the selected authority advertised durable runtime history notices on
  /// its latest handshake and the client declared them. Gates the gap
  /// descriptor read and the acknowledgement action only; transcript reads
  /// carry the declaration independently.
  var runtimeHistoryNotices = false
}

enum RichChatGatewayError: Error, Equatable, Sendable {
  case unavailable
  case invalidRequest
  case http(statusCode: Int, code: String?, missingScope: String?)
  case invalidResponse
  case rawTransportUnavailable
  case ambiguousOutcome
  case transport
}

protocol RichChatHistoryGateway: Sendable {
  func loadRichHistory(
    target: RichChatThreadTarget,
    targetEntryCount: Int?
  ) async throws -> RemoteThreadSnapshot

  func loadRichHistoryPage(
    target: RichChatThreadTarget,
    beforePosition: Int?,
    limit: Int,
    targetEntryCount: Int?
  ) async throws -> RemoteRuntimeItemsPage

  /// B4: one `ct1.` older-completed-turn page. Declared-only: a host without
  /// the capability is an `unavailable` terminal (no silent downgrade), and
  /// the transcript simply keeps no older-turn continuation.
  func loadRichTurns(
    target: RichChatThreadTarget,
    cursor: String,
    limit: Int
  ) async throws -> RemoteBoundedTurnsPage

  func loadLocalRichImage(
    target: RichChatThreadTarget,
    path: String
  ) async throws -> RichChatBinaryPayload

  func loadRuntimeRichImage(
    target: RichChatThreadTarget,
    reference: RichRemoteImageReference
  ) async throws -> RichChatBinaryPayload

  func listRichCheckpoints(
    target: RichChatThreadTarget,
    projectLocation: ProjectLocation
  ) async throws -> RichChatCheckpointCollection
}

protocol RichChatConversationGateway: Sendable {
  func sendRichInput(target: RichChatThreadTarget, input: RichChatSendInput) async throws
  func interruptRichThread(target: RichChatThreadTarget) async throws
  func closeRichThread(target: RichChatThreadTarget) async throws
  func truncateRichRuntime(target: RichChatThreadTarget, after itemID: String) async throws
  func runRichThreadCommand(
    target: RichChatThreadTarget, command: RichChatThreadCommand
  ) async throws
  func updateRichGoal(target: RichChatThreadTarget, update: RichChatGoalUpdate) async throws
  func setRichSteer(target: RichChatThreadTarget, input: RichSetPendingSteerInput) async throws
  func clearRichSteer(target: RichChatThreadTarget) async throws
  func queueRichFollowUp(
    target: RichChatThreadTarget, input: RichSetPendingSteerInput
  ) async throws
  func removeRichQueuedFollowUp(target: RichChatThreadTarget, id: String) async throws
  func reorderRichQueuedFollowUp(
    target: RichChatThreadTarget, id: String, beforeID: String?
  ) async throws
  func editRichQueuedFollowUp(
    target: RichChatThreadTarget, edit: RichQueuedFollowUpEdit
  ) async throws
  func steerRichQueuedFollowUp(target: RichChatThreadTarget, id: String) async throws
  func pauseRichFollowUps(target: RichChatThreadTarget, id: String) async throws
  func resumeRichFollowUps(target: RichChatThreadTarget) async throws
  func uploadRichAttachment(
    target: RichChatThreadTarget, attachment: RichChatAttachment
  ) async throws -> String
  func stageRichInput(
    target: RichChatThreadTarget, prompt: String, segments: [RichPromptSegment]?
  ) async throws
  func rollbackRichConversation(
    target: RichChatThreadTarget, turnCount: Int, config: [String: RichJSON]?
  ) async throws
  func createRichCheckpoint(
    target: RichChatThreadTarget,
    itemID: String,
    projectLocation: ProjectLocation
  ) async throws -> RichCheckpoint
  func finalizeRichCheckpoint(
    target: RichChatThreadTarget,
    itemID: String,
    baseItemID: String,
    projectLocation: ProjectLocation
  ) async throws -> RichCheckpoint
  func restoreRichCheckpoint(
    target: RichChatThreadTarget,
    itemID: String,
    projectLocation: ProjectLocation
  ) async throws
  /// WS2 stage 4: one-call compound checkpoint revert. Throws when the server
  /// reports a failed compound or an ambiguous provider state.
  func checkpointRevert(
    target: RichChatThreadTarget, itemID: String, operationKey: String
  ) async throws
}

protocol RichChatRequestGateway: Sendable {
  func resolveRichRequest(
    target: RichChatThreadTarget,
    resolution: RichChatRequestResolution
  ) async throws
}

/// B1 durable history notices. Declared-only routes; a host without the
/// capability throws `unavailable` and the surface shows nothing new.
protocol RichChatNoticeGateway: Sendable {
  /// Capability-gated descriptor read: the current unacknowledged episode plus
  /// the retained durable notice. Never inferred, never preloaded.
  func loadRichRuntimeGap(target: RichChatThreadTarget) async throws -> RemoteHistoryGapRead
  /// Explicit acknowledgement of one exact episode. `commandID` is the
  /// caller's stable idempotency key for an uncertain retry.
  func acknowledgeRichRuntimeGap(
    target: RichChatThreadTarget,
    episodeToken: String,
    commandID: String
  ) async throws -> RemoteHistoryGapAcknowledgeOutcome
}

extension RichChatNoticeGateway {
  func loadRichRuntimeGap(target _: RichChatThreadTarget) async throws -> RemoteHistoryGapRead {
    throw RichChatGatewayError.unavailable
  }

  func acknowledgeRichRuntimeGap(
    target _: RichChatThreadTarget,
    episodeToken _: String,
    commandID _: String
  ) async throws -> RemoteHistoryGapAcknowledgeOutcome {
    throw RichChatGatewayError.unavailable
  }
}

protocol RichChatTerminalGateway: Sendable {
  func watchRichTerminal(
    target: RichChatThreadTarget,
    terminalID: String,
    watchID: String,
    resume: RichChatTerminalWatchResume?
  ) async throws
  func unwatchRichTerminal(
    target: RichChatThreadTarget,
    terminalID: String
  ) async throws
  func startRichTerminal(target: RichChatThreadTarget, input: RichChatTerminalStartInput)
    async throws
  func writeRichTerminal(target: RichChatThreadTarget, data: String) async throws
  func resizeRichTerminal(target: RichChatThreadTarget, size: RichChatTerminalSize) async throws
  func closeRichTerminal(target: RichChatThreadTarget) async throws
  func richTerminalEvents(target: RichChatThreadTarget) async throws
    -> AsyncStream<RichChatTerminalTransportEvent>
  func stopRichTerminalTransport(target: RichChatThreadTarget) async
}

extension RichChatHistoryGateway {
  func loadRichTurns(
    target _: RichChatThreadTarget,
    cursor _: String,
    limit _: Int
  ) async throws -> RemoteBoundedTurnsPage {
    throw RichChatGatewayError.unavailable
  }
}

extension RichChatTerminalGateway {
  func richTerminalEvents(target _: RichChatThreadTarget) async throws
    -> AsyncStream<RichChatTerminalTransportEvent>
  {
    AsyncStream { $0.finish() }
  }

  func stopRichTerminalTransport(target _: RichChatThreadTarget) async {}
}

protocol RichChatSessionGateway:
  RichChatHistoryGateway,
  RichChatConversationGateway,
  RichChatRequestGateway,
  RichChatTerminalGateway,
  RichChatNoticeGateway
{}
