import Foundation

/// One request-authorization seam for every transport bound to a host-owned
/// environment.
///
/// The child grant stays the client's own `Authorization` bearer. This type
/// only carries the parent authority: the per-request parent header and the
/// fail-closed rule when the parent is not paired or unreadable. A direct
/// record resolves to no context and no header at all, so a parent token can
/// never leak to a non-environment endpoint.
struct EnvironmentParentAuthority: Sendable {
    private let parentTokenProvider: (@Sendable () async -> String?)?

    init(context: RemoteEnvironmentContext?) {
        parentTokenProvider = context?.parentAuthorizationToken
    }

    init(parentTokenProvider: (@Sendable () async -> String?)?) {
        self.parentTokenProvider = parentTokenProvider
    }

    /// No environment authority (direct host).
    static let direct = EnvironmentParentAuthority(parentTokenProvider: nil)

    var isEnvironmentBound: Bool { parentTokenProvider != nil }

    /// Parent bearer for the protocol header, or nil for a direct host.
    /// Throws the fail-closed `environment_parent_not_paired` error on an
    /// environment transport whose parent token is missing/empty — before any
    /// dial.
    func parentAuthorizationToken() async throws -> String? {
        guard let parentTokenProvider else { return nil }
        guard let token = await parentTokenProvider(), !token.isEmpty else {
            throw EnvironmentTransportError.parentNotPaired()
        }
        return token
    }

    /// Sets the parent authority header on a request. No-op for a direct host.
    func authorize(_ request: inout URLRequest) async throws {
        guard let token = try await parentAuthorizationToken() else { return }
        request.setValue(
            "Bearer \(token)",
            forHTTPHeaderField: ProtocolConstants.environmentAuthorizationHeader
        )
    }
}

extension HostCatalog {
    /// Transport context for one exact record, resolved from the durable
    /// catalog at credential-resolution time — not from whichever host is
    /// currently selected or foreground. Nil for a direct record; a known
    /// environment record with a missing/non-direct parent resolves to a
    /// fail-closed context (no dial, no header).
    func environmentTransportContext(for record: HostRecord) async -> RemoteEnvironmentContext? {
        guard let reference = record.environment else { return nil }
        let document = (try? snapshot())?.document
        guard document?.host(id: reference.parentConnectionId)?.isDirectConnection == true else {
            return .parentMissing(environmentId: reference.environmentId)
        }
        return EnvironmentParentAuthorityStore(catalog: self).makeContext(reference: reference)
    }

    /// Parent-header-only authority for a dispatch that must reach an
    /// environment proxy after the local environment record is gone (push
    /// unregister on removal). Nil for a direct host route; fail-closed when
    /// the parent record itself is missing or not direct.
    func parentHeaderContext(
        parentConnectionId: ClientConnectionID?
    ) async -> RemoteEnvironmentContext? {
        guard let parentConnectionId else { return nil }
        let document = (try? snapshot())?.document
        guard document?.host(id: parentConnectionId)?.isDirectConnection == true else {
            return .parentMissing(environmentId: "")
        }
        return .parentHeaderOnly(
            parentConnectionId: parentConnectionId,
            authorityStore: EnvironmentParentAuthorityStore(catalog: self)
        )
    }
}

extension EnvironmentParentAuthorityStore {
    /// Context whose parent authority is read from this store's catalog for the
    /// reference's parent connection. Nonisolated so credential repositories
    /// can build it while already inside the catalog actor.
    nonisolated func makeContext(reference: EnvironmentHostReference) -> RemoteEnvironmentContext {
        let parentConnectionId = reference.parentConnectionId
        let environmentId = reference.environmentId
        return RemoteEnvironmentContext(
            environmentId: environmentId,
            expectedChildDesktopId: reference.childDesktopId,
            parentAuthorizationToken: { [self] in
                await token(for: parentConnectionId)
            },
            mintParentWebSocketTicket: { [self] in
                try await mintParentWebSocketTicket(
                    parentConnectionId: parentConnectionId,
                    environmentId: environmentId
                )
            }
        )
    }
}
