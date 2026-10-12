import Foundation
import Observation

/// Which real surface the Advanced Operations composition was opened from.
///
/// The surface only names the thing the user selected. Every owner value the
/// feature acts on is re-derived from the current authoritative snapshot, so a
/// project that moves or a thread that disappears removes the owner instead of
/// leaving a stale one behind.
enum AdvancedOperationsSurface: Equatable, Hashable, Sendable {
  /// Project workspace surface: the project identity plus the location the
  /// surface was entered with. A relocation invalidates the surface.
  case project(ProjectIdentity, expectedLocation: ProjectLocation)
  /// Rich chat surface: the open thread. Its project location is derived from
  /// the snapshot (including worktree overlay), never supplied by the caller.
  case thread(threadID: String)
}

/// The owner components currently derivable for a surface.
struct AdvancedOperationsOwnerKey: Equatable, Hashable, Sendable {
  let projectLocation: ProjectLocation?
  let threadID: String?

  static let none = AdvancedOperationsOwnerKey(projectLocation: nil, threadID: nil)

  var isEmpty: Bool { projectLocation == nil && threadID == nil }
}

/// Keeps one Advanced Operations presentation bound to exactly one host,
/// session generation, and owner.
///
/// Access is minted per procedure because the seventeen procedures do not share
/// an owner shape. A procedure whose owner components are unavailable gets no
/// access at all — the surface stays visibly disabled rather than inventing a
/// project, location, or thread to make a button tappable.
@MainActor
@Observable
final class AdvancedOperationsSelectionSource {
  @ObservationIgnored private weak var session: AppSession?
  let surface: AdvancedOperationsSurface

  private(set) var ownerGeneration: UInt64 = 1
  private(set) var boundOwnerKey = AdvancedOperationsOwnerKey.none
  private(set) var resolvedHost: AdvancedOperationsResolvedHost?
  private var isBackgrounded = false

  /// Identity-safe slot for the single piece of foreground work this surface
  /// owns: the authoritative re-read that follows an ambiguous mutation.
  /// Installing cancels the previous occupant, so a superseded refresh can
  /// never outlive the lease it was scheduled for.
  @ObservationIgnored private var authoritativeRefreshTask = OwnedTaskSlot()

  init(session: AppSession, surface: AdvancedOperationsSurface) {
    self.session = session
    self.surface = surface
    boundOwnerKey = Self.ownerKey(session: session, surface: surface)
  }

  // MARK: - Host binding

  /// Exact selected-host identity. A registry/profile mismatch during a host
  /// switch yields no binding at all instead of the previous host's identity.
  var binding: AdvancedOperationsHostBinding? {
    guard let session,
      let connectionID = session.state.selectedConnectionId,
      let record = session.state.hosts.first(where: { $0.connectionId == connectionID }),
      let profile = session.state.profile,
      !record.desktopId.isEmpty,
      profile.desktopId == record.desktopId,
      profile.httpBaseURL == record.httpBaseURL,
      profile.protocolVersion == record.protocolVersion,
      record.protocolVersion == ProtocolConstants.remoteProtocolVersion
    else { return nil }

    let generation = UInt64(max(0, session.state.workGeneration))
    return AdvancedOperationsHostBinding(
      host: AdvancedOperationHostIdentity(
        connectionID: connectionID,
        desktopID: record.desktopId
      ),
      sessionID: AdvancedOperationsSessionIdentity.make(
        connectionID: connectionID,
        desktopID: record.desktopId,
        endpoint: record.httpBaseURL,
        protocolVersion: record.protocolVersion,
        generation: generation
      ),
      sessionGeneration: generation,
      endpoint: record.httpBaseURL,
      protocolVersion: record.protocolVersion,
      profileScopes: Set(profile.scopes).intersection(record.scopes)
    )
  }

  // MARK: - Owner derivation

  /// Owner components as they exist in the authoritative snapshot right now.
  var ownerKey: AdvancedOperationsOwnerKey {
    guard let session else { return .none }
    return Self.ownerKey(session: session, surface: surface)
  }

  private static func ownerKey(
    session: AppSession,
    surface: AdvancedOperationsSurface
  ) -> AdvancedOperationsOwnerKey {
    switch surface {
    case .project(let identity, let expectedLocation):
      guard session.state.selectedConnectionId == identity.connectionId,
        let project = session.state.snapshot?.projects.first(where: {
          $0.id == identity.projectId
        }),
        project.location == expectedLocation
      else { return .none }
      return AdvancedOperationsOwnerKey(projectLocation: project.location, threadID: nil)
    case .thread(let threadID):
      guard !threadID.isEmpty, session.richChatThread(id: threadID) != nil else {
        return .none
      }
      return AdvancedOperationsOwnerKey(
        projectLocation: session.richChatProjectLocation(threadID: threadID),
        threadID: threadID
      )
    }
  }

  /// Adopts a newly derived owner. Any change advances the owner generation, so
  /// every capture taken under the previous owner becomes stale immediately.
  func synchronize() {
    let key = ownerKey
    guard key != boundOwnerKey else { return }
    boundOwnerKey = key
    ownerGeneration &+= 1
    if ownerGeneration == 0 { ownerGeneration = 1 }
    // The previous owner's pending refresh is now stale by construction.
    authoritativeRefreshTask.cancelCurrent()
  }

  // MARK: - Owned foreground work

  /// Schedules the authoritative re-read that follows an ambiguous mutation.
  ///
  /// The work is owned by this surface: it is cancelled when the owner moves,
  /// when the host binding is dropped, and when the surface is dismissed or
  /// backgrounded. The lease is re-checked both before the task is installed
  /// and after it starts, so a completion that outran a host switch, a session
  /// generation bump, or an owner change cannot mutate anything.
  func scheduleAuthoritativeRefresh(
    lease: AdvancedOperationLease,
    operation: @escaping @MainActor @Sendable (AdvancedOperationLease) async -> Void
  ) {
    guard !isBackgrounded, isCurrent(lease) else { return }
    var installToken: UInt64 = 0
    let task = Task { @MainActor [weak self] in
      guard let self else { return }
      defer { self.authoritativeRefreshTask.clearIfCurrent(installToken) }
      guard !Task.isCancelled, !self.isBackgrounded, self.isCurrent(lease) else { return }
      await operation(lease)
    }
    installToken = authoritativeRefreshTask.install(task)
  }

  /// Cancels every piece of foreground work this surface owns.
  func cancelOwnedWork() {
    authoritativeRefreshTask.cancelCurrent()
  }

  /// Joins the pending refresh so tests observe a settled surface without
  /// sleeping or depending on scheduling order.
  func joinOwnedWorkForTests() async {
    await authoritativeRefreshTask.current?.join()
  }

  // MARK: - Access

  func access(
    for procedure: AdvancedOperationProcedure
  ) -> AdvancedOperationSessionAccess? {
    guard let session, let binding, !isBackgrounded,
      let owner = Self.owner(for: procedure, key: boundOwnerKey), boundOwnerKey == ownerKey
    else { return nil }

    let lease = AdvancedOperationLease(
      host: binding.host,
      sessionID: binding.sessionID,
      sessionGeneration: binding.sessionGeneration,
      ownerGeneration: ownerGeneration,
      owner: owner
    )
    guard lease.isValid, owner.kind == procedure.metadata.owner else { return nil }

    let isForeground = !session.state.liveLifecycle.isInBackground
    // Online means the selected host's own socket is carrying traffic right
    // now. An API object plus a non-error phase only proves a transport was
    // built once; while the socket is reconnecting, suspended, or failed no
    // procedure may be dispatched.
    let isOnline =
      session.state.api != nil
      && session.state.socketState == .online
      && isForeground
      && session.state.phase != .needsPairing
      && session.state.phase != .sessionExpired
      && session.state.phase != .protocolIncompatible
      && session.state.phase != .localStoreInconsistent
    return AdvancedOperationSessionAccess(
      lease: lease,
      isOnline: isOnline,
      isReady: isOnline && session.state.phase == .ready,
      isForeground: isForeground,
      scopes: Set(binding.profileScopes.compactMap(AdvancedOperationScope.init(rawValue:)))
    )
  }

  /// Mandatory owner matrix. The shapes are not interchangeable and a missing
  /// component is never substituted.
  nonisolated static func owner(
    for procedure: AdvancedOperationProcedure,
    key: AdvancedOperationsOwnerKey
  ) -> AdvancedOperationOwner? {
    switch procedure {
    case .createFileCheckpoint, .finalizeFileCheckpoint:
      guard let threadID = key.threadID, let location = key.projectLocation else { return nil }
      return .thread(threadID: threadID, projectLocation: location)
    case .subagentSubscribe, .subagentUnsubscribe, .stageThreadInput:
      guard let threadID = key.threadID else { return nil }
      return .thread(threadID: threadID, projectLocation: nil)
    case .workflowGetRun:
      guard let location = key.projectLocation else { return nil }
      return .location(location, threadID: nil)
    case .workflowAgentChat:
      guard let location = key.projectLocation, let threadID = key.threadID else { return nil }
      return .location(location, threadID: threadID)
    case .readAbsoluteFile, .readExternalFile, .writeExternalFile, .createProjectEntry,
      .renameProjectEntry, .moveProjectEntry, .deleteProjectEntry, .generateCommitMessage,
      .generateTitle, .generatePrSummary:
      guard let location = key.projectLocation else { return nil }
      return .projectLocation(location)
    }
  }

  // MARK: - Transport selection

  /// Synchronous selection read by the gateway on both sides of every await.
  /// The cached host must still be the current binding, and granted scopes are
  /// intersected once more against the vault-backed registry record.
  func selection(
    for procedure: AdvancedOperationProcedure
  ) -> AdvancedOperationsTransportSelection? {
    guard let access = access(for: procedure), let resolved = resolvedHost,
      resolved.binding == binding
    else { return nil }
    let exact = AdvancedOperationSessionAccess(
      lease: access.lease,
      isOnline: access.isOnline,
      isReady: access.isReady,
      isForeground: access.isForeground,
      scopes: access.scopes.intersection(resolved.grantedScopes)
    )
    return AdvancedOperationsTransportSelection(access: exact, api: resolved.api)
  }

  func adoptResolvedHost(_ resolved: AdvancedOperationsResolvedHost?) {
    guard let resolved else {
      resolvedHost = nil
      return
    }
    guard resolved.binding == binding else { return }
    resolvedHost = resolved
  }

  // MARK: - Lifecycle

  func enterBackground() {
    isBackgrounded = true
    resolvedHost = nil
    authoritativeRefreshTask.cancelCurrent()
  }

  func leaveBackground() {
    isBackgrounded = false
  }

  func invalidateHost() {
    resolvedHost = nil
    authoritativeRefreshTask.cancelCurrent()
  }

  /// Whether the lease still names the current host, session, and owner.
  func isCurrent(_ lease: AdvancedOperationLease) -> Bool {
    guard let binding else { return false }
    return lease.host == binding.host
      && lease.sessionID == binding.sessionID
      && lease.sessionGeneration == binding.sessionGeneration
      && lease.ownerGeneration == ownerGeneration
  }
}
