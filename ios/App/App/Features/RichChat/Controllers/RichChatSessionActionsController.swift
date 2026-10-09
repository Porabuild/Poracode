import Foundation
import Observation

/// Owner identity for live session actions: every field that distinguishes
/// "the same live session this thread is showing" — thread row id, provider
/// kind and instance, presentation mode, and the supervisor's `SessionRef`
/// (provider session id + execution identity). A change in any axis means a
/// new owner: in-flight results are dropped and the panel state resets.
/// `status` is deliberately absent — working→idle is the same session and
/// must not invalidate an invocation it accepted.
struct RichChatSessionActionOwner: Equatable, Sendable {
  var threadID: String
  var agentKind: String?
  var agentInstanceID: String?
  var presentationMode: String?
  var sessionRefID: String?
  var executionIdentity: String?
}

/// Neutral live session-action state for one selected conversation.
struct RichChatSessionActionsControllerState: Equatable, Sendable {
  var access: RichChatSessionAccess?
  var target: RichChatThreadTarget?
  var owner: RichChatSessionActionOwner?
  /// Ids the live structured session currently declares. Controls render only
  /// for these; the typed old-host answer collapses the list so nothing dead
  /// is advertised.
  var actionIDs: [String] = []
  var inventoryRefreshing = false
  /// The last inventory read failure when it must stay visible. Only the
  /// typed old-host answer hides quietly; an outage, an authentication
  /// rejection, or a malformed answer surfaces here so the user can retry
  /// instead of mistaking it for "no actions".
  var inventoryFailure: RichChatControllerFailure?
  /// The action id with a single-attempt invoke in flight, if any.
  var pendingActionID: String?
  var failure: RichChatControllerFailure?
  var requiresAuthoritativeRefresh = false
}

/// Owns the neutral session-action seam for the open thread: one inventory
/// read at a time and one single-attempt invoke, each fenced by the exact
/// selected host lease, owner identity, and activation revision before and
/// after the await. Deselect, host switches, session replacements, and
/// backgrounding cancel the owned work so a stale result can never land in a
/// newer session's state.
///
/// Read-only listings take no exclusive slot: they may run alongside a
/// pending mutation, mirroring the desktop contract, and their failures stay
/// local to the listing panel instead of becoming thread-level failures.
@MainActor
@Observable
final class RichChatSessionActionsController {
  private(set) var state = RichChatSessionActionsControllerState()

  private let gateway: any RichChatSessionActionsGateway
  private let inventoryTask = RichChatControllerTaskSlot()
  private let mutationTask = RichChatControllerTaskSlot()
  private let listingTask = RichChatControllerTaskSlot()
  private var revision: UInt64 = 0
  private var isBackgrounded = false

  init(gateway: any RichChatSessionActionsGateway) {
    self.gateway = gateway
  }

  func activate(access: RichChatSessionAccess, threadID: String) {
    inventoryTask.cancel()
    mutationTask.cancel()
    listingTask.cancel()
    revision &+= 1
    isBackgrounded = false
    state = RichChatSessionActionsControllerState(
      access: access,
      target: RichChatThreadTarget(lease: access.lease, threadID: threadID)
    )
  }

  /// Adopts the live owner identity. A change invalidates every in-flight
  /// attempt for the previous owner so a retired result can never publish,
  /// and clears the previous owner's inventory — the new session's list is
  /// read fresh, never inherited.
  func updateOwner(_ owner: RichChatSessionActionOwner?) {
    guard state.owner != owner else { return }
    inventoryTask.cancel()
    mutationTask.cancel()
    listingTask.cancel()
    revision &+= 1
    state.owner = owner
    state.actionIDs = []
    state.inventoryFailure = nil
    state.pendingActionID = nil
    state.inventoryRefreshing = false
  }

  func updateAccess(_ access: RichChatSessionAccess) {
    guard state.target?.lease == access.lease else {
      deactivate()
      return
    }
    state.access = access
  }

  func deactivate() {
    inventoryTask.cancel()
    mutationTask.cancel()
    listingTask.cancel()
    revision &+= 1
    isBackgrounded = false
    state = RichChatSessionActionsControllerState()
  }

  func enterBackground() {
    inventoryTask.cancel()
    mutationTask.cancel()
    listingTask.cancel()
    revision &+= 1
    isBackgrounded = true
    state.pendingActionID = nil
    state.inventoryRefreshing = false
  }

  func leaveBackground(access: RichChatSessionAccess) {
    guard state.target?.lease == access.lease else { return }
    state.access = access
    isBackgrounded = false
  }

  func acknowledgeAuthoritativeRefresh() {
    state.requiresAuthoritativeRefresh = false
    if state.failure == .ambiguousOutcome || state.failure == .offline {
      state.failure = nil
    }
  }

  /// One inventory read, never stacked, never retried. The typed old-host
  /// answer empties the inventory quietly; every other failure empties it and
  /// stays visible for retry. Only inventory fields are ever written — a
  /// concurrent invoke's busy or ambiguity state is never wiped.
  func refreshInventory() async {
    guard !state.inventoryRefreshing else { return }
    guard let context = operationContext(capability: .sessionRead) else { return }
    state.inventoryRefreshing = true
    inventoryTask.launch { [weak self] in
      guard let self else { return }
      do {
        let ids = try await self.gateway.listRichSessionActions(target: context.target)
        try Task.checkCancellation()
        self.finishInventory(context: context, failure: nil, ids: ids)
      } catch is CancellationError {
        self.finishInventory(context: context, failure: nil, ids: nil)
      } catch {
        self.finishInventory(context: context, failure: .map(error), ids: nil)
      }
    }
    await inventoryTask.wait()
  }

  private func finishInventory(
    context: OperationContext,
    failure: RichChatControllerFailure?,
    ids: [String]?
  ) {
    guard owns(context) else { return }
    state.inventoryRefreshing = false
    guard let ids else {
      if let failure {
        if failure.isSessionActionSeamUnsupported {
          state.inventoryFailure = nil
        } else {
          state.inventoryFailure = failure
        }
        state.actionIDs = []
      }
      return
    }
    state.actionIDs = ids
    state.inventoryFailure = nil
  }

  /**
   * One mutation attempt for an id the live inventory listed. Resolves with
   * the provider's record, or nil when the invoke failed — ambiguous
   * deliveries surface as failures and are never retried. Read-only listings
   * pass `exclusive: false`: they skip the one-pending slot, may run
   * alongside a pending mutation, and never write thread-level failure
   * state. The outcome is a per-attempt box, so a retired or replaced
   * attempt can neither read nor clear a newer generation's result.
   */
  @discardableResult
  func invoke(
    actionID: String,
    payload: [String: RichJSON],
    exclusive: Bool = true
  ) async -> [String: RichJSON]? {
    if exclusive {
      guard state.pendingActionID == nil else {
        state.failure = .busy
        return nil
      }
    }
    guard !actionID.isEmpty, state.actionIDs.contains(actionID) else {
      // Only live-listed ids are invokable; an unknown id is a caller bug and
      // must not reach the host.
      state.failure = .invalidRequest
      return nil
    }
    guard let context = operationContext(capability: .sessionOperate) else { return nil }
    if exclusive {
      state.failure = nil
      state.pendingActionID = actionID
    }
    let outcome = InvokeOutcome()
    let slot = exclusive ? mutationTask : listingTask
    let attempt = slot.launch { [weak self] in
      guard let self else { return }
      do {
        let result = try await self.gateway.invokeRichSessionAction(
          target: context.target, actionID: actionID, payload: payload
        )
        try Task.checkCancellation()
        guard self.owns(context) else { return }
        if exclusive { self.state.pendingActionID = nil }
        outcome.value = result
      } catch is CancellationError {
        guard self.owns(context) else { return }
        if exclusive { self.state.pendingActionID = nil }
      } catch {
        guard self.owns(context) else { return }
        let failure = RichChatControllerFailure.map(error)
        if exclusive {
          self.state.pendingActionID = nil
          self.state.failure = failure
          if failure == .ambiguousOutcome {
            self.state.requiresAuthoritativeRefresh = true
          }
        }
      }
    }
    await attempt.value
    return outcome.value
  }

  /// Per-attempt hand-off from the launched task. Only this attempt's closure
  /// ever writes it, so an overlapping retired invoke can never consume or
  /// clear a newer generation's result.
  private final class InvokeOutcome: @unchecked Sendable {
    var value: [String: RichJSON]?
  }

  private struct OperationContext: Sendable {
    let target: RichChatThreadTarget
    let owner: RichChatSessionActionOwner?
    let revision: UInt64
  }

  private func operationContext(capability: RichChatCapability) -> OperationContext? {
    guard !isBackgrounded, let target = state.target, let access = state.access else {
      state.failure = .unavailable
      return nil
    }
    if let failure = access.controllerGate(capability) {
      state.failure = failure
      return nil
    }
    return OperationContext(target: target, owner: state.owner, revision: revision)
  }

  private func owns(_ context: OperationContext) -> Bool {
    richChatOwns(
      target: context.target,
      revision: context.revision,
      currentTarget: state.target,
      currentRevision: revision,
      isBackgrounded: isBackgrounded
    ) && context.owner == state.owner
  }
}
