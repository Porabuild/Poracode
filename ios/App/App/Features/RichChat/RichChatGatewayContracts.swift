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
}

protocol RichChatRequestGateway: Sendable {
  func resolveRichRequest(
    target: RichChatThreadTarget,
    resolution: RichChatRequestResolution
  ) async throws
}

protocol RichChatTerminalGateway: Sendable {
  func watchRichTerminal(
    target: RichChatThreadTarget,
    terminalID: String,
    watchID: String
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
  RichChatTerminalGateway
{}
