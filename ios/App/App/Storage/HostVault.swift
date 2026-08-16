import Foundation

/// New Keychain boundary for multi-host secrets.
/// Distinct service from the single-host `session-credentials` item.
struct HostVault: Sendable {
    static let service = "com.lightcodeapp.mobile.remote.hosts"
    static let accountPrefix = "host-vault."
    static let journalAccount = "host-transaction-journal"

    let io: any RawKeychainIO

    init(io: any RawKeychainIO) {
        self.io = io
    }

    static func account(for connectionId: ClientConnectionID) -> String {
        accountPrefix + connectionId.rawValue
    }

    static func connectionId(fromAccount account: String) -> ClientConnectionID? {
        guard account.hasPrefix(accountPrefix) else { return nil }
        return ClientConnectionID(rawValue: String(account.dropFirst(accountPrefix.count)))
    }

    func save(connectionId: ClientConnectionID, token: String) throws {
        guard !token.isEmpty else {
            throw KeychainError.unhandled(errSecParam)
        }
        try save(account: Self.account(for: connectionId), data: Data(token.utf8))
    }

    func save(account: String, data: Data) throws {
        try io.save(account: account, data: data)
    }

    func loadToken(connectionId: ClientConnectionID) throws -> String? {
        guard let data = try load(account: Self.account(for: connectionId)),
              let token = String(data: data, encoding: .utf8),
              !token.isEmpty
        else {
            return nil
        }
        return token
    }

    func load(account: String) throws -> Data? {
        try io.load(account: account)
    }

    func delete(connectionId: ClientConnectionID) throws {
        try delete(account: Self.account(for: connectionId))
    }

    func delete(account: String) throws {
        try io.delete(account: account)
    }

    /// Explicit repair only: delete the complete dedicated host-vault service,
    /// including credentials whose IDs cannot be recovered from a corrupt registry.
    func deleteAll() throws {
        try io.deleteAll()
    }
}
