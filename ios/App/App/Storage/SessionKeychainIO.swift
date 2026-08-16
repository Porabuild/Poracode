import Foundation
import Security

// MARK: - Raw Keychain I/O seam

protocol RawKeychainIO: Sendable {
    func save(account: String, data: Data) throws
    func load(account: String) throws -> Data?
    func delete(account: String) throws
    func deleteAll() throws
}

// MARK: - Pure update/add policy (testable without SecItem)

/// Crash-safe Keychain mutation policy: update-first, add only on notFound,
/// and if add returns duplicate, retry update. Never delete-before-add.
enum KeychainSavePolicy {
    enum Step: Sendable, Equatable {
        case update
        case add
        case updateAfterDuplicateAdd
    }

    enum Decision: Sendable, Equatable {
        case succeeded
        case performAdd
        case retryUpdateAfterDuplicate
        case failed(OSStatus)
    }

    /// First-step result after SecItemUpdate.
    static func afterUpdate(_ status: OSStatus) -> Decision {
        if status == errSecSuccess { return .succeeded }
        if status == errSecItemNotFound { return .performAdd }
        return .failed(status)
    }

    /// Second-step result after SecItemAdd (only when update reported notFound).
    static func afterAdd(_ status: OSStatus) -> Decision {
        if status == errSecSuccess { return .succeeded }
        if status == errSecDuplicateItem { return .retryUpdateAfterDuplicate }
        return .failed(status)
    }

    /// Third-step result after the duplicate-add recovery update.
    static func afterDuplicateRecoveryUpdate(_ status: OSStatus) -> Decision {
        if status == errSecSuccess { return .succeeded }
        return .failed(status)
    }
}

/// Injectable SecItem syscall surface for deterministic policy tests.
protocol KeychainSyscall: Sendable {
    func update(account: String, service: String, data: Data, accessibility: CFString) -> OSStatus
    func add(account: String, service: String, data: Data, accessibility: CFString) -> OSStatus
    func copyMatching(account: String, service: String) -> (OSStatus, Data?)
    func delete(account: String, service: String) -> OSStatus
    func deleteAll(service: String) -> OSStatus
}

struct SystemKeychainSyscall: KeychainSyscall {
    func update(account: String, service: String, data: Data, accessibility: CFString) -> OSStatus {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: accessibility,
        ]
        return SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    }

    func add(account: String, service: String, data: Data, accessibility: CFString) -> OSStatus {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: accessibility,
        ]
        return SecItemAdd(query as CFDictionary, nil)
    }

    func copyMatching(account: String, service: String) -> (OSStatus, Data?) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return (status, nil) }
        guard status == errSecSuccess, let data = item as? Data else {
            return (status, nil)
        }
        return (status, data)
    }

    func delete(account: String, service: String) -> OSStatus {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        return SecItemDelete(query as CFDictionary)
    }

    func deleteAll(service: String) -> OSStatus {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
        ]
        return SecItemDelete(query as CFDictionary)
    }
}

/// Production Keychain I/O: SecItemUpdate when present, SecItemAdd only on not-found,
/// duplicate-add retries update. Accessible: WhenUnlockedThisDeviceOnly.
struct SystemKeychainIO: RawKeychainIO {
    static let service = "com.lightcodeapp.mobile.remote"
    static let credentialsAccount = "session-credentials"
    static let legacyTokenAccount = "access-token"

    let service: String
    let syscall: any KeychainSyscall

    init(
        service: String = SystemKeychainIO.service,
        syscall: any KeychainSyscall = SystemKeychainSyscall()
    ) {
        self.service = service
        self.syscall = syscall
    }

    private var accessibility: CFString {
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    }

    func save(account: String, data: Data) throws {
        let accessibility = self.accessibility
        let updateStatus = syscall.update(
            account: account,
            service: service,
            data: data,
            accessibility: accessibility
        )
        switch KeychainSavePolicy.afterUpdate(updateStatus) {
        case .succeeded:
            return
        case .failed(let status):
            throw KeychainError.unhandled(status)
        case .retryUpdateAfterDuplicate:
            // Unreachable from afterUpdate; treat as failure.
            throw KeychainError.unhandled(updateStatus)
        case .performAdd:
            let addStatus = syscall.add(
                account: account,
                service: service,
                data: data,
                accessibility: accessibility
            )
            switch KeychainSavePolicy.afterAdd(addStatus) {
            case .succeeded:
                return
            case .failed(let status):
                throw KeychainError.unhandled(status)
            case .performAdd:
                throw KeychainError.unhandled(addStatus)
            case .retryUpdateAfterDuplicate:
                let retry = syscall.update(
                    account: account,
                    service: service,
                    data: data,
                    accessibility: accessibility
                )
                switch KeychainSavePolicy.afterDuplicateRecoveryUpdate(retry) {
                case .succeeded:
                    return
                case .failed(let status):
                    throw KeychainError.unhandled(status)
                case .performAdd, .retryUpdateAfterDuplicate:
                    throw KeychainError.unhandled(retry)
                }
            }
        }
    }

    func load(account: String) throws -> Data? {
        let (status, data) = syscall.copyMatching(account: account, service: service)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data else {
            throw KeychainError.unhandled(status)
        }
        return data
    }

    func delete(account: String) throws {
        let status = syscall.delete(account: account, service: service)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandled(status)
        }
    }

    func deleteAll() throws {
        let status = syscall.deleteAll(service: service)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandled(status)
        }
    }
}

/// Namespace aliases for existing call sites / tests.
enum SessionKeychainIO {
    static let service = SystemKeychainIO.service
    static let credentialsAccount = SystemKeychainIO.credentialsAccount
    static let legacyTokenAccount = SystemKeychainIO.legacyTokenAccount

    static func save(account: String, data: Data) throws {
        try SystemKeychainIO().save(account: account, data: data)
    }

    static func load(account: String) throws -> Data? {
        try SystemKeychainIO().load(account: account)
    }

    static func delete(account: String) throws {
        try SystemKeychainIO().delete(account: account)
    }
}

// MARK: - In-memory keychain (tests)

/// Injectable memory-backed Keychain for deterministic tests (no SecItem races).
final class InMemoryKeychainIO: RawKeychainIO, @unchecked Sendable {
    private var storage: [String: Data] = [:]
    private let lock = NSLock()
    /// When set, next `save` throws and does not mutate storage.
    var failNextSave: Error?
    /// When set, next `delete` throws and does not mutate storage.
    var failNextDelete: Error?
    /// One-shot per-account delete faults (consumed on use).
    var failDeleteForAccount: [String: Error] = [:]
    /// Synchronous side-effect before applying a save (ownership stays one actor turn when used under actor).
    var beforeSaveSync: (@Sendable () -> Void)?
    /// Synchronous side-effect before applying a delete.
    var beforeDeleteSync: (@Sendable (String) -> Void)?

    func save(account: String, data: Data) throws {
        lock.lock()
        defer { lock.unlock() }
        beforeSaveSync?()
        if let failNextSave {
            self.failNextSave = nil
            throw failNextSave
        }
        storage[account] = data
    }

    func load(account: String) throws -> Data? {
        lock.lock()
        defer { lock.unlock() }
        return storage[account]
    }

    func delete(account: String) throws {
        lock.lock()
        defer { lock.unlock() }
        beforeDeleteSync?(account)
        if let error = failDeleteForAccount[account] {
            throw error
        }
        if let failNextDelete {
            self.failNextDelete = nil
            throw failNextDelete
        }
        storage.removeValue(forKey: account)
    }

    func deleteAll() throws {
        lock.lock()
        defer { lock.unlock() }
        beforeDeleteSync?("*")
        if let failNextDelete {
            self.failNextDelete = nil
            throw failNextDelete
        }
        storage.removeAll()
    }

    func rawBytes(account: String) -> Data? {
        lock.lock()
        defer { lock.unlock() }
        return storage[account]
    }
}
