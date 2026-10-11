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
      if statusCode == 403, code == "git_procedure_not_allowed" {
        // The host's procedure allowlist rejected the verb — not a scope
        // denial. Keeping the code lets the session-action inventory hide
        // quietly for an old host while everything else stays visible.
        return .rejected(statusCode: statusCode, code: code)
      }
      if statusCode == 403 { return .authorizationDenied }
      return .rejected(statusCode: statusCode, code: code)
    }
  }

  /// The paired host's procedure allowlist predates the session-action seam
  /// (HTTP 403 `git_procedure_not_allowed` from the `/api/git/call`
  /// passthrough) — the only inventory failure that hides without an error.
  /// Every other failure must surface instead of masquerading as "no actions".
  var isSessionActionSeamUnsupported: Bool {
    if case .rejected(let statusCode, let code) = self {
      return statusCode == 403 && code == "git_procedure_not_allowed"
    }
    return false
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
  case transcriptInvalidated
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

  @discardableResult
  func launch(
    _ operation: @escaping @MainActor @Sendable () async -> Void
  ) -> Task<Void, Never> {
    cancel()
    generation &+= 1
    let owner = generation
    let launched = Task { @MainActor [weak self] in
      await operation()
      self?.clear(owner: owner)
    }
    task = launched
    return launched
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
