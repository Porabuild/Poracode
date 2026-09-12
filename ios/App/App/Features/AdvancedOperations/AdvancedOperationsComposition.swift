import Foundation

/// Feature-local composition seam.
///
/// The later integration step supplies these members from `AppSession` without
/// this feature importing session, navigation, or settings types.
///
/// `access(for:)` must return the *exact* current lease for that procedure's
/// owner shape at the moment the UI reads it, or `nil` when no host owns the
/// surface. Owner shapes are not interchangeable: checkpoint procedures own a
/// thread *with* its project location, subagent and staging procedures own a
/// thread alone, `workflowGetRun` owns a location alone, `workflowAgentChat`
/// owns a location *with* a thread, and the remaining procedures own a project
/// location. The feature never mints a lease itself, and it rejects any request
/// whose derived owner is not identical to the supplied lease owner.
struct AdvancedOperationsComposition: Sendable {
  typealias AccessProvider =
    @MainActor @Sendable (AdvancedOperationProcedure) -> AdvancedOperationSessionAccess?

  let access: AccessProvider
  /// Gateway that revalidates the lease on both sides of the await boundary.
  let gateway: any AdvancedOperationsGateway
  /// Requests an authoritative refresh of host state after an ambiguous
  /// delivery. Implementations must re-read authoritative state; they must
  /// never repeat the mutation.
  let requestAuthoritativeRefresh:
    @MainActor @Sendable (AdvancedOperationProcedure, AdvancedOperationLease) -> Void

  init(
    access: @escaping AccessProvider,
    gateway: any AdvancedOperationsGateway,
    requestAuthoritativeRefresh:
      @escaping @MainActor @Sendable (
        AdvancedOperationProcedure, AdvancedOperationLease
      ) -> Void
  ) {
    self.access = access
    self.gateway = gateway
    self.requestAuthoritativeRefresh = requestAuthoritativeRefresh
  }
}

/// Identity that invalidates every in-flight operation when it changes.
///
/// The probes cover all four distinct owner shapes, so a project, thread,
/// location, or host generation change moves at least one member.
struct AdvancedOperationsActivationID: Hashable, Sendable {
  static let probes: [AdvancedOperationProcedure] = [
    .createFileCheckpoint, .subagentSubscribe, .workflowGetRun, .workflowAgentChat,
    .readAbsoluteFile,
  ]

  private let leases: [AdvancedOperationLease?]
  private let flags: [Bool]
  private let scopes: [[String]]

  @MainActor
  init(_ composition: AdvancedOperationsComposition?) {
    let accesses = Self.probes.map { composition?.access($0) }
    leases = accesses.map { $0?.lease }
    flags = accesses.flatMap {
      [$0?.isOnline == true, $0?.isReady == true, $0?.isForeground == true]
    }
    scopes = accesses.map { ($0?.scopes ?? []).map(\.rawValue).sorted() }
  }
}

extension AdvancedOperationSessionAccess {
  /// Whether the surface may dispatch anything at all right now.
  var isUsable: Bool { lease.isValid && isOnline && isReady && isForeground }

  /// The first blocking availability reason, if any.
  var unavailability: AdvancedOperationAvailability? {
    if !isOnline { return .offline }
    if !isReady { return .notReady }
    if !isForeground { return .background }
    return nil
  }

  func permits(_ scope: AdvancedOperationScope) -> Bool { scopes.contains(scope) }
}
