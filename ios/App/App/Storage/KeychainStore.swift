import Foundation
import Security

/// Access-token storage only. Connection metadata must not live here.
/// Live legacy twin of `SystemKeychainIO` — same update-first / duplicate-add policy.
actor KeychainStore {
    static let shared = KeychainStore()

    private let io: SystemKeychainIO
    private let account = SystemKeychainIO.legacyTokenAccount

    init(io: SystemKeychainIO = SystemKeychainIO()) {
        self.io = io
    }

    func saveAccessToken(_ token: String) throws {
        let data = Data(token.utf8)
        // Crash-safe: update in place when present; add only on not-found; never delete-before-add.
        try io.save(account: account, data: data)
    }

    func loadAccessToken() throws -> String? {
        guard let data = try io.load(account: account),
              let token = String(data: data, encoding: .utf8),
              !token.isEmpty
        else {
            return nil
        }
        return token
    }

    func deleteAccessToken() throws {
        try io.delete(account: account)
    }
}

enum KeychainError: LocalizedError {
    case unhandled(OSStatus)

    var errorDescription: String? {
        switch self {
        case .unhandled(let status):
            return "Keychain error (\(status))."
        }
    }
}
