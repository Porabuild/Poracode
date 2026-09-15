import CryptoKit
import Foundation

/// Stable identity of one live session, derived from non-secret identity bytes.
///
/// The digest covers the exact host connection, desktop, endpoint, protocol
/// version, and work generation. Two different live sessions therefore never
/// share it, while repeated reads of the same session always produce the same
/// value. No credential material takes part in the derivation.
enum AdvancedOperationsSessionIdentity {
  static func make(
    connectionID: ClientConnectionID,
    desktopID: String,
    endpoint: String,
    protocolVersion: Int,
    generation: UInt64
  ) -> UUID {
    let material = [
      "poracode.advancedOperations.session",
      connectionID.rawValue,
      desktopID,
      endpoint,
      String(protocolVersion),
      String(generation),
    ]
    .joined(separator: "\u{1F}")
    var bytes = Array(SHA256.hash(data: Data(material.utf8)).prefix(16))
    bytes[6] = (bytes[6] & 0x0F) | 0x50
    bytes[8] = (bytes[8] & 0x3F) | 0x80
    return bytes.withUnsafeBufferPointer { buffer in
      NSUUID(uuidBytes: buffer.baseAddress) as UUID
    }
  }
}

/// Dispatches each procedure to a gateway bound to that procedure's own owner
/// shape. One shared gateway cannot do this: the seventeen procedures mint four
/// different owner shapes and therefore four different leases at any instant.
struct AdvancedOperationsSessionGateway: AdvancedOperationsGateway {
  private let gateways: [AdvancedOperationProcedure: SelectedAdvancedOperationsGateway]

  @MainActor
  init(source: AdvancedOperationsSelectionSource) {
    var built: [AdvancedOperationProcedure: SelectedAdvancedOperationsGateway] = [:]
    for procedure in AdvancedOperationProcedure.allCases {
      built[procedure] = SelectedAdvancedOperationsGateway {
        @MainActor [weak source] in source?.selection(for: procedure)
      }
    }
    gateways = built
  }

  func call(
    _ request: AdvancedOperationRequest,
    lease: AdvancedOperationLease
  ) async throws -> AdvancedOperationResult {
    guard let gateway = gateways[request.procedure] else {
      throw AdvancedOperationFailure.invalidRequest
    }
    return try await gateway.call(request, lease: lease)
  }
}

extension AppSession {
  func makeAdvancedOperationsSelectionSource(
    surface: AdvancedOperationsSurface
  ) -> AdvancedOperationsSelectionSource {
    AdvancedOperationsSelectionSource(session: self, surface: surface)
  }

  func makeAdvancedOperationsTransportSource(
    source: AdvancedOperationsSelectionSource
  ) -> AdvancedOperationsExactHostTransportSource {
    AdvancedOperationsExactHostTransportSource(
      credentials: deps.hostCatalog,
      bindingProvider: { @MainActor [weak source] in source?.binding }
    )
  }

  /// Production composition. Access is per procedure, the gateway revalidates
  /// the lease on both sides of every await, and an ambiguous delivery asks for
  /// an authoritative re-read instead of a second attempt.
  func makeAdvancedOperationsComposition(
    source: AdvancedOperationsSelectionSource
  ) -> AdvancedOperationsComposition {
    AdvancedOperationsComposition(
      access: { @MainActor [weak source] procedure in source?.access(for: procedure) },
      gateway: AdvancedOperationsSessionGateway(source: source),
      requestAuthoritativeRefresh: { @MainActor [weak self, weak source] _, lease in
        guard let self, let source, source.isCurrent(lease),
          !self.state.liveLifecycle.isInBackground
        else { return }
        // Owned by the selection source, not detached: dismissing the surface,
        // backgrounding, or switching host cancels it, and the lease is
        // re-checked after the task starts so a stale refresh is dropped.
        source.scheduleAuthoritativeRefresh(lease: lease) {
          @MainActor [weak self, weak source] lease in
          await self?.refreshAdvancedOperationsAuthoritativeState(lease: lease, source: source)
        }
      }
    )
  }

  /// Re-reads the host state the ambiguous mutation could have touched. It
  /// never repeats the mutation, and a completion that arrives after the host,
  /// session, or owner moved is dropped before it can change what is visible.
  func refreshAdvancedOperationsAuthoritativeState(
    lease: AdvancedOperationLease,
    source: AdvancedOperationsSelectionSource?
  ) async {
    guard let source, source.isCurrent(lease), !state.liveLifecycle.isInBackground else {
      return
    }
    await refreshSnapshot()
    guard source.isCurrent(lease), !state.liveLifecycle.isInBackground else { return }
    guard let threadID = lease.owner.threadID,
      let suite = activeRichChatSuite,
      suite.scope.target?.threadID == threadID
    else { return }
    await suite.refreshAuthoritativeHistory()
  }
}
