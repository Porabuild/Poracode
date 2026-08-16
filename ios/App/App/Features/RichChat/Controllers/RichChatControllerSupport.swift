import Foundation

enum RichChatControllerFailure: Error, Equatable, Sendable {
  case unavailable
  case offline
  case notReady
  case busy
  case capabilityMissing(RichChatCapability)
  case authenticationExpired
  case authorizationMissingScope(String?)
  case authorizationDenied
  case invalidRequest
  case invalidResponse
  case rawTransportUnavailable
  case ambiguousOutcome
  case rejected(statusCode: Int, code: String?)
  case transport
}

extension RichChatControllerFailure {
  static func map(_ error: any Error) -> Self {
    guard let error = error as? RichChatGatewayError else { return .transport }
    switch error {
    case .unavailable:
      return .unavailable
    case .invalidRequest:
      return .invalidRequest
    case .invalidResponse:
      return .invalidResponse
    case .rawTransportUnavailable:
      return .rawTransportUnavailable
    case .ambiguousOutcome:
      return .ambiguousOutcome
    case .transport:
      return .transport
    case .http(let statusCode, let code, let missingScope):
      if statusCode == 401 { return .authenticationExpired }
      if statusCode == 403, code == "missing_scope" {
        return .authorizationMissingScope(missingScope)
      }
      if statusCode == 403 { return .authorizationDenied }
      return .rejected(statusCode: statusCode, code: code)
    }
  }
}

extension RichChatSessionAccess {
  func controllerGate(_ capability: RichChatCapability) -> RichChatControllerFailure? {
    guard isOnline else { return .offline }
    guard isReady else { return .notReady }
    guard capabilities.contains(capability) else { return .capabilityMissing(capability) }
    return nil
  }
}

enum RichChatAuthoritativeRefreshReason: Equatable, Sendable {
  case ambiguousMutation
  case conversationChanged
  case terminalCursorInvalidated
}

protocol RichChatAuthoritativeRefreshRequesting: Sendable {
  func requestRichChatRefresh(
    target: RichChatThreadTarget,
    reason: RichChatAuthoritativeRefreshReason
  ) async
}

struct RichChatNoopRefreshRequester: RichChatAuthoritativeRefreshRequesting {
  func requestRichChatRefresh(
    target _: RichChatThreadTarget,
    reason _: RichChatAuthoritativeRefreshReason
  ) async {}
}

/// A replacement-safe task owner. All work remains child work of a controller-owned task,
/// and a completed predecessor can never clear a newer replacement.
@MainActor
final class RichChatControllerTaskSlot {
  private var task: Task<Void, Never>?
  private var generation: UInt64 = 0

  var isRunning: Bool { task != nil }

  func launch(
    _ operation: @escaping @MainActor @Sendable () async -> Void
  ) {
    cancel()
    generation &+= 1
    let owner = generation
    task = Task { @MainActor [weak self] in
      await operation()
      self?.clear(owner: owner)
    }
  }

  func cancel() {
    generation &+= 1
    task?.cancel()
    task = nil
  }

  func wait() async {
    let current = task
    await withTaskCancellationHandler {
      await current?.value
    } onCancel: {
      current?.cancel()
    }
  }

  private func clear(owner: UInt64) {
    guard owner == generation else { return }
    task = nil
  }
}

@MainActor
func richChatOwns(
  target: RichChatThreadTarget,
  revision: UInt64,
  currentTarget: RichChatThreadTarget?,
  currentRevision: UInt64,
  isBackgrounded: Bool
) -> Bool {
  !isBackgrounded && target == currentTarget && revision == currentRevision
}
