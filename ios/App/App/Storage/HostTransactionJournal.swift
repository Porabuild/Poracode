import Foundation

/// Secret-bearing transaction journal. Lives on the host-vault Keychain boundary.
/// Stores exact target registry / vault bytes so crash recovery is idempotent.
enum HostTransactionJournal {
    /// v2 captures exact legacy-source bytes so an interrupted explicit removal
    /// can resume without deleting credentials written after the operation began.
    /// v3 adds a metadata-only rename operation without changing registry shape.
    /// v4 allows one removal to delete additional dependent vault accounts
    /// (an environment's locally paired child records when their parent is
    /// removed) in the same crash-atomic operation.
    static let currentVersion = 4
    static let account = HostVault.journalAccount

    enum Kind: String, Codable, Sendable, Equatable {
        case add
        /// Adds one environment record without changing the selected host.
        case addEnvironment
        case switchSelected
        case rename
        case remove
    }

    enum Phase: String, Codable, Sendable, Equatable {
        /// Intent recorded; target bytes not yet applied (or apply interrupted).
        case intent
        /// Vault mutation applied (save or delete). Registry not yet confirmed.
        case vaultApplied
        /// Registry exact bytes applied. Journal may still exist until deleted.
        case registryApplied
    }

    struct Record: Codable, Sendable, Equatable {
        var version: Int
        var operationId: UInt64
        var kind: Kind
        var connectionId: ClientConnectionID
        var phase: Phase
        /// Exact bytes to land in `registry.json`. Recovery writes these, never re-encodes.
        var targetRegistryBytes: Data
        var targetVaultAccount: String?
        /// Exact vault payload. Recovery writes these bytes when present.
        var targetVaultBytes: Data?
        var deleteVaultAccount: String?
        /// Additional dependent vault accounts to delete with the primary one
        /// (v4). Never holds the primary `deleteVaultAccount`.
        var deleteVaultAccounts: [String]?
        /// Exact legacy source slots observed before an explicit imported-host removal.
        var legacySource: LegacyHostSourceSnapshot?
        /// Exact tombstone bytes, written only when every source slot was unchanged.
        var targetTombstoneBytes: Data?
    }

    enum Decode: Sendable, Equatable {
        case current(Record)
        case future
        case corrupt
    }

    /// Test-only crash/restart seams.
    enum Stage: Sendable, Equatable {
        case afterIntent
        case afterVaultApply
        case afterRegistryApply
    }

    static func encode(_ record: Record) throws -> Data {
        try HostRegistryCoding.encode(record)
    }

    static func decode(_ data: Data) -> Decode {
        do {
            guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let version = root["version"] as? Int
            else {
                return .corrupt
            }
            if version > currentVersion { return .future }
            if version == 1 {
                let legacy = try HostRegistryCoding.decode(LegacyRecordV1.self, from: data)
                return validated(
                    Record(
                        version: currentVersion,
                        operationId: legacy.operationId,
                        kind: legacy.kind,
                        connectionId: legacy.connectionId,
                        phase: legacy.phase,
                        targetRegistryBytes: legacy.targetRegistryBytes,
                        targetVaultAccount: legacy.targetVaultAccount,
                        targetVaultBytes: legacy.targetVaultBytes,
                        deleteVaultAccount: legacy.deleteVaultAccount,
                        deleteVaultAccounts: nil,
                        legacySource: nil,
                        targetTombstoneBytes: nil
                    )
                )
            }
            if version == 2 {
                let legacy = try HostRegistryCoding.decode(LegacyRecordV2.self, from: data)
                return validated(
                    Record(
                        version: currentVersion,
                        operationId: legacy.operationId,
                        kind: legacy.kind.current,
                        connectionId: legacy.connectionId,
                        phase: legacy.phase,
                        targetRegistryBytes: legacy.targetRegistryBytes,
                        targetVaultAccount: legacy.targetVaultAccount,
                        targetVaultBytes: legacy.targetVaultBytes,
                        deleteVaultAccount: legacy.deleteVaultAccount,
                        deleteVaultAccounts: nil,
                        legacySource: legacy.legacySource,
                        targetTombstoneBytes: legacy.targetTombstoneBytes
                    )
                )
            }
            if version == 3 {
                let legacy = try HostRegistryCoding.decode(LegacyRecordV3.self, from: data)
                return validated(
                    Record(
                        version: currentVersion,
                        operationId: legacy.operationId,
                        kind: legacy.kind,
                        connectionId: legacy.connectionId,
                        phase: legacy.phase,
                        targetRegistryBytes: legacy.targetRegistryBytes,
                        targetVaultAccount: legacy.targetVaultAccount,
                        targetVaultBytes: legacy.targetVaultBytes,
                        deleteVaultAccount: legacy.deleteVaultAccount,
                        deleteVaultAccounts: nil,
                        legacySource: legacy.legacySource,
                        targetTombstoneBytes: legacy.targetTombstoneBytes
                    )
                )
            }
            if version < currentVersion { return .corrupt }
            let record = try HostRegistryCoding.decode(Record.self, from: data)
            guard record.version == currentVersion else { return .corrupt }
            return validated(record)
        } catch {
            return .corrupt
        }
    }

    private static func validated(_ record: Record) -> Decode {
        guard record.version == currentVersion,
              let document = try? HostRegistryStore.migratedDocument(record.targetRegistryBytes)
        else { return .corrupt }
        let account = HostVault.account(for: record.connectionId)
        let dependentAccounts = record.deleteVaultAccounts ?? []
        guard Set(dependentAccounts).count == dependentAccounts.count,
              !dependentAccounts.contains(account),
              dependentAccounts.allSatisfy({ HostVault.connectionId(fromAccount: $0) != nil }),
              dependentAccounts.allSatisfy({ dependent in
                  HostVault.connectionId(fromAccount: dependent)
                      .map { document.host(id: $0) == nil } ?? false
              })
        else { return .corrupt }
        switch record.kind {
        case .add:
            guard record.targetVaultAccount == account,
                  record.targetVaultBytes?.isEmpty == false,
                  record.deleteVaultAccount == nil,
                  record.deleteVaultAccounts == nil,
                  record.legacySource == nil,
                  record.targetTombstoneBytes == nil,
                  document.host(id: record.connectionId) != nil,
                  document.selectedConnectionId == record.connectionId
            else { return .corrupt }
        case .addEnvironment:
            guard record.targetVaultAccount == account,
                  record.targetVaultBytes?.isEmpty == false,
                  record.deleteVaultAccount == nil,
                  record.deleteVaultAccounts == nil,
                  record.legacySource == nil,
                  record.targetTombstoneBytes == nil,
                  document.host(id: record.connectionId)?.environment != nil
            else { return .corrupt }
        case .switchSelected:
            guard record.targetVaultAccount == nil,
                  record.targetVaultBytes == nil,
                  record.deleteVaultAccount == nil,
                  record.deleteVaultAccounts == nil,
                  record.legacySource == nil,
                  record.targetTombstoneBytes == nil,
                  document.host(id: record.connectionId) != nil,
                  document.selectedConnectionId == record.connectionId
            else { return .corrupt }
        case .rename:
            guard record.targetVaultAccount == nil,
                  record.targetVaultBytes == nil,
                  record.deleteVaultAccount == nil,
                  record.deleteVaultAccounts == nil,
                  record.legacySource == nil,
                  record.targetTombstoneBytes == nil,
                  document.host(id: record.connectionId) != nil
            else { return .corrupt }
        case .remove:
            guard record.targetVaultAccount == nil,
                  record.targetVaultBytes == nil,
                  record.deleteVaultAccount == account,
                  (record.legacySource == nil) == (record.targetTombstoneBytes == nil),
                  document.host(id: record.connectionId) == nil
            else { return .corrupt }
        }
        return .current(record)
    }

    private struct LegacyRecordV1: Codable {
        var version: Int
        var operationId: UInt64
        var kind: Kind
        var connectionId: ClientConnectionID
        var phase: Phase
        var targetRegistryBytes: Data
        var targetVaultAccount: String?
        var targetVaultBytes: Data?
        var deleteVaultAccount: String?
        var clearLegacySource: Bool
    }

    private enum LegacyKindV2: String, Codable {
        case add
        case switchSelected
        case remove

        var current: Kind {
            switch self {
            case .add: .add
            case .switchSelected: .switchSelected
            case .remove: .remove
            }
        }
    }

    private struct LegacyRecordV2: Codable {
        var version: Int
        var operationId: UInt64
        var kind: LegacyKindV2
        var connectionId: ClientConnectionID
        var phase: Phase
        var targetRegistryBytes: Data
        var targetVaultAccount: String?
        var targetVaultBytes: Data?
        var deleteVaultAccount: String?
        var legacySource: LegacyHostSourceSnapshot?
        var targetTombstoneBytes: Data?
    }

    /// Version 3 shape: one deleted vault account per removal.
    private struct LegacyRecordV3: Codable {
        var version: Int
        var operationId: UInt64
        var kind: Kind
        var connectionId: ClientConnectionID
        var phase: Phase
        var targetRegistryBytes: Data
        var targetVaultAccount: String?
        var targetVaultBytes: Data?
        var deleteVaultAccount: String?
        var legacySource: LegacyHostSourceSnapshot?
        var targetTombstoneBytes: Data?
    }
}

struct HostJournalIO: Sendable {
    let vault: HostVault

    func load() throws -> HostTransactionJournal.Decode? {
        guard let data = try vault.load(account: HostTransactionJournal.account) else {
            return nil
        }
        return HostTransactionJournal.decode(data)
    }

    func loadRaw() throws -> Data? {
        try vault.load(account: HostTransactionJournal.account)
    }

    func save(_ record: HostTransactionJournal.Record) throws {
        let data = try HostTransactionJournal.encode(record)
        try vault.save(account: HostTransactionJournal.account, data: data)
    }

    func delete() throws {
        try vault.delete(account: HostTransactionJournal.account)
    }
}
