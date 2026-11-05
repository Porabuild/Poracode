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

  /// Read-only lifecycle epoch (activation, owner, lease, or background
  /// transition). Callers capture it before an await and treat a change as
  /// cancellation, never as a transport failure.
  var lifecycleRevision: UInt64 { revision }

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

// MARK: - Background task details

/// Deterministic fence for one background-task read/stop. It carries the
/// current host lease, the entire live session-action owner scope, the task id,
/// and the whole opaque action descriptor with payload pairs sorted. Provider
/// keys are never interpreted; re-encoding the same map cannot restart a read,
/// while any owner/run/action change always fences the previous attempt.
struct RichChatBackgroundTaskReadKey: Equatable, Sendable {
  let value: String

  init(
    lease: RichChatHostLease?,
    owner: RichChatSessionActionOwner?,
    taskID: String,
    action: RemoteBackgroundTaskStopAction
  ) {
    var parts: [String] = []
    func append(_ part: String) {
      parts.append("\(part.utf8.count):\(part)")
    }
    append(lease?.connectionID.rawValue ?? "")
    append(lease.map { String($0.generation) } ?? "")
    append(owner?.threadID ?? "")
    append(owner?.agentKind ?? "")
    append(owner?.agentInstanceID ?? "")
    append(owner?.presentationMode ?? "")
    append(owner?.sessionRefID ?? "")
    append(owner?.executionIdentity ?? "")
    append(taskID)
    append(action.id)
    for key in action.payload.keys.sorted() {
      append(key)
      append(action.payload[key] ?? "")
    }
    value = parts.joined()
  }
}

/// Decodes the neutral read result through the shared JSON codecs and then
/// applies the generated output bounds. Never inspects the opaque payload.
enum RichChatBackgroundTaskOutputDecoding {
  static func decode(_ result: [String: RichJSON]) -> RemoteBackgroundTaskOutput? {
    guard let data = try? JSONEncoder().encode(RichJSON.object(result)),
      let output = try? JSONDecoding.decode(RemoteBackgroundTaskOutput.self, from: data),
      output.isValid
    else { return nil }
    return output
  }
}

/// One selected task's read lifecycle. Scoped to the single visible details
/// surface (never a second global reader): it serializes reads for exactly one
/// identity at a time, restarts only when that identity changes, and keeps the
/// independent Stop attempt state separate from the output state.
@MainActor
@Observable
final class RichChatBackgroundTaskDetailsController {
  enum OutputState: Equatable, Sendable {
    case idle
    case loading
    case ready(RemoteBackgroundTaskOutput)
    case failed
  }

  struct StopState: Equatable, Sendable {
    let identity: String
    var isPending: Bool
    var failure: RichChatControllerFailure?
  }

  private(set) var output: OutputState = .idle
  private(set) var outputIdentity: String?
  private(set) var stopState: StopState?

  private let sessionActions: RichChatSessionActionsController
  private let pollInterval: Duration
  private var readTask: Task<Void, Never>?

  /// The single transport read this reader may have in flight. The generic
  /// session-action invoke owns an unstructured listing task, so cancelling the
  /// poll loop alone cannot cancel the request. Keeping the attempt here lets a
  /// same-identity close/reopen reuse it and makes an identity switch await it
  /// before issuing the next read: at most one actual read is in flight.
  private struct InFlightRead {
    let id: UInt64
    let identity: String
    let task: Task<[String: RichJSON]?, Never>
  }

  private var inFlightRead: InFlightRead?
  private var nextReadID: UInt64 = 0

  init(
    sessionActions: RichChatSessionActionsController,
    pollInterval: Duration = .seconds(2)
  ) {
    self.sessionActions = sessionActions
    self.pollInterval = pollInterval
  }

  /// Old output is hidden immediately when the owner/task/action identity
  /// changes — even when a provider reuses the same task id.
  func displayedOutput(for identity: String?) -> OutputState {
    guard let identity, outputIdentity == identity else { return .idle }
    return output
  }

  func displayedStopState(for identity: String?) -> StopState? {
    guard let identity, stopState?.identity == identity else { return nil }
    return stopState
  }

  /// Starts (or keeps) the single polling loop. A different identity cancels
  /// the previous loop and drops its output before the first new read.
  func startReading(
    identity: RichChatBackgroundTaskReadKey,
    action: RemoteBackgroundTaskStopAction
  ) {
    if readTask != nil, outputIdentity == identity.value { return }
    readTask?.cancel()
    readTask = nil
    outputIdentity = identity.value
    output = .loading
    readTask = Task { @MainActor [weak self] in
      guard let self else { return }
      await self.poll(identity: identity, action: action)
    }
  }

  func stopReading() {
    readTask?.cancel()
    readTask = nil
    outputIdentity = nil
    output = .idle
  }

  func retry(
    identity: RichChatBackgroundTaskReadKey,
    action: RemoteBackgroundTaskStopAction
  ) {
    readTask?.cancel()
    readTask = nil
    outputIdentity = nil
    output = .idle
    startReading(identity: identity, action: action)
  }

  /// One exclusive session-action attempt. Pending/failure state is fenced to
  /// the stop identity and is never cleared by output-read activity.
  func stop(
    identity: RichChatBackgroundTaskReadKey,
    action: RemoteBackgroundTaskStopAction
  ) async {
    if let current = stopState, current.identity == identity.value, current.isPending {
      return
    }
    let lifecycleRevision = sessionActions.lifecycleRevision
    stopState = StopState(identity: identity.value, isPending: true, failure: nil)
    let result = await sessionActions.invoke(
      actionID: action.id,
      payload: Self.richPayload(action.payload),
      exclusive: true
    )
    guard let current = stopState, current.identity == identity.value else { return }
    // Background/lease/owner/activation changes cancel the owned invoke. The
    // nil result is then lifecycle cancellation, not a transport failure, so
    // clear only this identity's pending state without inventing an error.
    if sessionActions.lifecycleRevision != lifecycleRevision {
      stopState = StopState(identity: identity.value, isPending: false, failure: nil)
      return
    }
    let failure = result == nil ? (sessionActions.state.failure ?? .transport) : nil
    stopState = StopState(identity: identity.value, isPending: false, failure: failure)
  }

  private func poll(
    identity: RichChatBackgroundTaskReadKey,
    action: RemoteBackgroundTaskStopAction
  ) async {
    while !Task.isCancelled {
      let result = await read(identity: identity, action: action)
      guard !Task.isCancelled, outputIdentity == identity.value else { return }
      guard let result, let decoded = RichChatBackgroundTaskOutputDecoding.decode(result) else {
        output = .failed
        readTask = nil
        return
      }
      output = .ready(decoded)
      do {
        try await Task.sleep(for: pollInterval)
      } catch {
        return
      }
    }
  }

  /// Serializes this reader's actual transport reads. A retained attempt is
  /// awaited and reused for the same identity (close/reopen while in flight) and
  /// awaited then discarded before a different identity starts its own read.
  /// The attempt is deliberately not tied to the poll task's cancellation: the
  /// generic invoke owns an unstructured listing task, so awaiting is the only
  /// way to guarantee one read at a time.
  private func read(
    identity: RichChatBackgroundTaskReadKey,
    action: RemoteBackgroundTaskStopAction
  ) async -> [String: RichJSON]? {
    if let existing = inFlightRead {
      let result = await existing.task.value
      if inFlightRead?.id == existing.id { inFlightRead = nil }
      if existing.identity == identity.value { return result }
      // A newer poll/identity won while this attempt was awaited. Only the
      // current identity may start the next transport read, so superseded polls
      // cannot fan out concurrent reads after the retained attempt settles.
      guard !Task.isCancelled, outputIdentity == identity.value else { return nil }
    }
    guard !Task.isCancelled, outputIdentity == identity.value else { return nil }
    nextReadID &+= 1
    let readID = nextReadID
    let sessionActions = self.sessionActions
    let actionID = action.id
    let payload = Self.richPayload(action.payload)
    let task = Task { @MainActor in
      await sessionActions.invoke(actionID: actionID, payload: payload, exclusive: false)
    }
    inFlightRead = InFlightRead(id: readID, identity: identity.value, task: task)
    let result = await task.value
    if inFlightRead?.id == readID { inFlightRead = nil }
    return result
  }

  private static func richPayload(_ payload: [String: String]) -> [String: RichJSON] {
    payload.mapValues { .string($0) }
  }
}
