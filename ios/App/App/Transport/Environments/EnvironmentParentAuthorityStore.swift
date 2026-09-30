import Foundation

/// Resolves the parent authority for locally paired environments.
///
/// The parent token lives in the parent record's vault slot. The child grant
/// never substitutes for it: `mintParentWebSocketTicket` builds a parent-bound
/// client from the parent record's endpoint/token only, and a missing or
/// unreadable parent fails closed without a dial.
actor EnvironmentParentAuthorityStore {
    static let shared = EnvironmentParentAuthorityStore(catalog: .shared)

    private let catalog: HostCatalog
    private var tokenCache: [ClientConnectionID: String] = [:]

    init(catalog: HostCatalog) {
        self.catalog = catalog
    }

    func token(for parentConnectionId: ClientConnectionID) async -> String? {
        if let cached = tokenCache[parentConnectionId], !cached.isEmpty {
            return cached
        }
        guard let token = try? await catalog.token(for: parentConnectionId), !token.isEmpty else {
            return nil
        }
        tokenCache[parentConnectionId] = token
        return token
    }

    /// Mint the parent environment-bound WS upgrade ticket through the parent's
    /// own management route. Never proxied, never derived from a child grant.
    func mintParentWebSocketTicket(
        parentConnectionId: ClientConnectionID,
        environmentId: String
    ) async throws -> String {
        guard let snapshot = try? await catalog.snapshot(),
              let parent = snapshot.document.host(id: parentConnectionId),
              parent.isDirectConnection
        else {
            throw EnvironmentTransportError.parentNotPaired()
        }
        guard let token = await token(for: parentConnectionId), !token.isEmpty else {
            throw EnvironmentTransportError.parentNeedsRepair()
        }
        let client = RemoteAPIClient(endpoint: parent.httpBaseURL, accessToken: token)
        return try await client.environmentWebSocketTicket(environmentId: environmentId)
    }

    func noteParentToken(_ token: String, for parentConnectionId: ClientConnectionID) {
        guard !token.isEmpty else {
            tokenCache.removeValue(forKey: parentConnectionId)
            return
        }
        tokenCache[parentConnectionId] = token
    }

    func invalidate(parentConnectionId: ClientConnectionID) {
        tokenCache.removeValue(forKey: parentConnectionId)
    }


    func resetForTests() {
        tokenCache.removeAll()
    }
}
