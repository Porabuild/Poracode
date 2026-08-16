@preconcurrency import Foundation

/// Crash-safe multi-host registry + vault. Recovery runs before UI / network.
///
/// Pair / add / switch / remove are journaled with exact target bytes.
/// Import of single-host sources is read-only and exactly-once.
actor HostCatalog {
    static let shared: HostCatalog = {
        do {
            return HostCatalog(directory: try HostRegistryStore.productionDirectory())
        } catch {
            let fallback = FileManager.default.temporaryDirectory
                .appendingPathComponent("PoracodeHosts", isDirectory: true)
            return HostCatalog(directory: fallback)
        }
    }()

    private let registry: HostRegistryStore
    private let vault: HostVault
    private let journalIO: HostJournalIO
    private let artifacts: LegacyImportArtifacts
    private let sourceKeychain: any RawKeychainIO
    private let sourceDefaults: HostSourceDefaults
    private let sourceV2Account: String
    private let sourceLegacyTokenAccount: String
    private let sourceProfileKey: String
    private let sourceLegacyProfileKey: String
    private let suiteName: String?

    private var currentOperationId: UInt64 = 0
    private var currentOperationKind: HostOperationKind?
    private var crashAfterStage: HostTransactionJournal.Stage?
    private var mutationCheckpoint: (@Sendable () async -> Void)?

    init(
        directory: URL,
        vaultIO: any RawKeychainIO = SystemKeychainIO(service: HostVault.service),
        sourceKeychain: any RawKeychainIO = SystemKeychainIO(),
        defaults: HostSourceDefaults = .standard,
        suiteName: String? = nil,
        v2Account: String = SessionKeychainIO.credentialsAccount,
        legacyTokenAccount: String = SessionKeychainIO.legacyTokenAccount
    ) {
        let store = HostRegistryStore(directory: directory)
        let vault = HostVault(io: vaultIO)
        self.registry = store
        self.vault = vault
        self.journalIO = HostJournalIO(vault: vault)
        self.artifacts = LegacyImportArtifacts(directory: directory, fileStore: store.fileStore)
        self.sourceKeychain = sourceKeychain
        self.sourceDefaults = defaults
        self.sourceV2Account = suiteName.map { "\(v2Account).\($0)" } ?? v2Account
        self.sourceLegacyTokenAccount = suiteName.map { "\(legacyTokenAccount).\($0)" } ?? legacyTokenAccount
        self.sourceProfileKey = ConnectionStore.storageKey
        self.sourceLegacyProfileKey = ConnectionStore.legacyStorageKey
        self.suiteName = suiteName
    }

    /// Isolated catalog for tests. Does not touch production Application Support.
    static func ephemeralForTests(
        suffix: String = UUID().uuidString,
        vaultIO: any RawKeychainIO = InMemoryKeychainIO(),
        sourceKeychain: (any RawKeychainIO)? = nil,
        defaults: UserDefaults? = nil
    ) -> HostCatalog {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("poracode-host-tests-\(suffix)", isDirectory: true)
        let suite = "poracode.tests.hosts.\(suffix)"
        return HostCatalog(
            directory: directory,
            vaultIO: vaultIO,
            sourceKeychain: sourceKeychain ?? vaultIO,
            defaults: HostSourceDefaults(
                value: defaults ?? UserDefaults(suiteName: suite) ?? .standard
            ),
            suiteName: nil
        )
    }

    func wipeForTests() {
        try? registry.remove()
        try? artifacts.fileStore.removeIfPresent(at: artifacts.receiptURL)
        try? artifacts.fileStore.removeIfPresent(at: artifacts.tombstoneURL)
        try? journalIO.delete()
        try? FileManager.default.removeItem(at: registry.directory)
        if let suiteName {
            sourceDefaults.value.removePersistentDomain(forName: suiteName)
        }
        currentOperationId = 0
        currentOperationKind = nil
        crashAfterStage = nil
        mutationCheckpoint = nil
    }

    func setCrashAfterStage(_ stage: HostTransactionJournal.Stage?) {
        crashAfterStage = stage
    }

    func setMutationCheckpoint(_ checkpoint: (@Sendable () async -> Void)?) {
        mutationCheckpoint = checkpoint
    }

    func activate(id: UInt64, kind: HostOperationKind) throws -> Bool {
        try recover()
        guard id >= currentOperationId else { return false }
        currentOperationId = id
        currentOperationKind = kind
        return true
    }

    /// Explicit repair for an unreadable catalog. This deliberately bypasses
    /// recovery because a corrupt/future journal or registry is the state being
    /// discarded. The host-vault service is dedicated, so clearing the whole
    /// namespace also removes tokens whose connection IDs cannot be decoded.
    func clearAllForRepair(owning id: UInt64) throws -> HostMutationResult {
        guard id >= currentOperationId else { return .rejectedBeforeApply }
        currentOperationId = id
        currentOperationKind = .remove
        try vault.deleteAll()
        try registry.remove()
        return .applied
    }

    /// Replay any in-flight journal before UI or network.
    func recover() throws {
        switch try journalIO.load() {
        case .none:
            return
        case .future, .corrupt:
            throw HostCatalogError.journalInconsistent
        case .current(let record):
            try applyJournal(record)
            try journalIO.delete()
        }
    }

    func snapshot() throws -> HostCatalogSnapshot {
        try recover()
        let exists = registry.fileExists
        let document = try registry.loadDocument() ?? .empty()
        return HostCatalogSnapshot(document: document, registryExists: exists)
    }

    func token(for connectionId: ClientConnectionID) throws -> String? {
        try recover()
        return try vault.loadToken(connectionId: connectionId)
    }

    func importLegacyIfNeeded() throws -> LegacyHostImport.Outcome {
        try recover()
        let targetExists = registry.fileExists
        let sources = try LegacyHostImport.readSources(
            keychain: sourceKeychain,
            defaults: sourceDefaults.value,
            v2Account: sourceV2Account,
            legacyTokenAccount: sourceLegacyTokenAccount,
            profileKey: sourceProfileKey,
            legacyProfileKey: sourceLegacyProfileKey
        )
        let inspected = LegacyHostImport.inspect(
            v2: sources.v2,
            profile: sources.profile,
            token: sources.token
        )
        let fingerprint: String?
        if case .imported(let imported) = inspected {
            fingerprint = imported.fingerprint
        } else {
            fingerprint = LegacyHostImport.fingerprint(
                v2: sources.v2,
                profile: sources.profile,
                token: sources.token
            )
        }
        if let skip = LegacyHostImport.shouldSkip(
            targetExists: targetExists,
            receipt: try artifacts.loadReceipt(),
            tombstone: try artifacts.loadTombstone(),
            fingerprint: fingerprint
        ) {
            return skip
        }
        guard case .imported(let imported) = inspected else {
            return inspected
        }
        try persistImport(imported)
        return .imported(imported)
    }

    func pairAdd(
        record: HostRecord,
        token: String,
        owning id: UInt64
    ) async throws -> HostMutationResult {
        try await mutate(owning: id, kind: .add) { document in
            guard !token.isEmpty else { throw KeychainError.unhandled(errSecParam) }
            var next = document
            if let index = next.hosts.firstIndex(where: { $0.connectionId == record.connectionId }) {
                next.hosts[index] = record
            } else {
                next.hosts.append(record)
            }
            next = next.touching(record.connectionId, at: record.lastSelectedAt ?? Date())
            return TransactionPlan(
                kind: .add,
                connectionId: record.connectionId,
                document: next,
                vaultAccount: HostVault.account(for: record.connectionId),
                vaultBytes: Data(token.utf8),
                deleteVaultAccount: nil,
                legacySource: nil,
                targetTombstoneBytes: nil
            )
        }
    }

    func switchSelected(
        to connectionId: ClientConnectionID,
        owning id: UInt64
    ) async throws -> HostMutationResult {
        try await mutate(owning: id, kind: .switchSelected) { document in
            guard document.host(id: connectionId) != nil else {
                throw HostCatalogError.unknownHost
            }
            return TransactionPlan(
                kind: .switchSelected,
                connectionId: connectionId,
                document: document.touching(connectionId, at: Date()),
                vaultAccount: nil,
                vaultBytes: nil,
                deleteVaultAccount: nil,
                legacySource: nil,
                targetTombstoneBytes: nil
            )
        }
    }

    func remove(
        _ connectionId: ClientConnectionID,
        owning id: UInt64
    ) async throws -> HostMutationResult {
        try await mutate(owning: id, kind: .remove) { document in
            guard document.host(id: connectionId) != nil else {
                throw HostCatalogError.unknownHost
            }
            var next = document
            next.hosts.removeAll { $0.connectionId == connectionId }
            next.lru.removeAll { $0 == connectionId }
            if next.selectedConnectionId == connectionId {
                next.selectedConnectionId = next.lru.first ?? next.hosts.first?.connectionId
                if let selected = next.selectedConnectionId {
                    next = next.touching(selected, at: Date())
                }
            }
            let legacyClear = try legacyClearPlan(
                removed: connectionId,
                receipt: artifacts.loadReceipt()
            )
            return TransactionPlan(
                kind: .remove,
                connectionId: connectionId,
                document: next,
                vaultAccount: nil,
                vaultBytes: nil,
                deleteVaultAccount: HostVault.account(for: connectionId),
                legacySource: legacyClear?.source,
                targetTombstoneBytes: legacyClear?.tombstoneBytes
            )
        }
    }

    // MARK: Test probes

    func registryRawData() throws -> Data? { try registry.readRaw() }
    func journalRawData() throws -> Data? { try journalIO.loadRaw() }
    func vaultRawData(for connectionId: ClientConnectionID) throws -> Data? {
        try vault.load(account: HostVault.account(for: connectionId))
    }
    func sourceV2RawData() throws -> Data? {
        try sourceKeychain.load(account: sourceV2Account)
    }
    func sourceLegacyTokenRawData() throws -> Data? {
        try sourceKeychain.load(account: sourceLegacyTokenAccount)
    }
    func sourceProfileRawData() -> Data? {
        sourceDefaults.value.data(forKey: sourceProfileKey)
            ?? sourceDefaults.value.data(forKey: sourceLegacyProfileKey)
    }
    func sourceLegacyProfileKeyRawData() -> Data? {
        sourceDefaults.value.data(forKey: sourceLegacyProfileKey)
    }
    func sourceCurrentProfileKeyRawData() -> Data? {
        sourceDefaults.value.data(forKey: sourceProfileKey)
    }
    func receiptForTests() throws -> LegacyHostImport.Receipt? { try artifacts.loadReceipt() }
    func tombstoneForTests() throws -> LegacyHostImport.Tombstone? { try artifacts.loadTombstone() }
    func currentOperationIdForTests() -> UInt64 { currentOperationId }

    func seedRegistryExact(_ data: Data) throws {
        try registry.writeExact(data)
    }

    func removeRegistryForTests() throws { try registry.remove() }

    func seedSourceV2(_ data: Data) throws {
        try sourceKeychain.save(account: sourceV2Account, data: data)
    }

    func seedSourceLegacyToken(_ token: String) throws {
        try sourceKeychain.save(account: sourceLegacyTokenAccount, data: Data(token.utf8))
    }

    func seedSourceProfile(_ data: Data, legacyKey: Bool) {
        sourceDefaults.value.set(
            data,
            forKey: legacyKey ? sourceLegacyProfileKey : sourceProfileKey
        )
    }

    func replaceSourceV2(_ data: Data) throws {
        try sourceKeychain.save(account: sourceV2Account, data: data)
    }

    // MARK: Private

    private struct TransactionPlan: Sendable {
        var kind: HostTransactionJournal.Kind
        var connectionId: ClientConnectionID
        var document: HostRegistryDocument
        var vaultAccount: String?
        var vaultBytes: Data?
        var deleteVaultAccount: String?
        var legacySource: LegacyHostSourceSnapshot?
        var targetTombstoneBytes: Data?
    }

    private func mutate(
        owning id: UInt64,
        kind: HostOperationKind,
        build: (HostRegistryDocument) throws -> TransactionPlan
    ) async throws -> HostMutationResult {
        await consumeMutationCheckpoint()
        try recover()
        guard id == currentOperationId, currentOperationKind == kind else {
            return .rejectedBeforeApply
        }
        let existing = try registry.loadDocument() ?? .empty()
        let plan = try build(existing)
        let registryBytes = try registry.encode(plan.document)
        let record = HostTransactionJournal.Record(
            version: HostTransactionJournal.currentVersion,
            operationId: id,
            kind: plan.kind,
            connectionId: plan.connectionId,
            phase: .intent,
            targetRegistryBytes: registryBytes,
            targetVaultAccount: plan.vaultAccount,
            targetVaultBytes: plan.vaultBytes,
            deleteVaultAccount: plan.deleteVaultAccount,
            legacySource: plan.legacySource,
            targetTombstoneBytes: plan.targetTombstoneBytes
        )
        try journalIO.save(record)
        try crashIf(.afterIntent)
        try applyJournal(record)
        try crashIf(.afterRegistryApply)
        try journalIO.delete()
        if id != currentOperationId {
            return .appliedButSuperseded
        }
        return .applied
    }

    private func applyJournal(_ initial: HostTransactionJournal.Record) throws {
        var record = initial
        if record.phase == .intent {
            if let account = record.targetVaultAccount, let bytes = record.targetVaultBytes {
                try vault.save(account: account, data: bytes)
            }
            if let delete = record.deleteVaultAccount {
                try vault.delete(account: delete)
            }
            if let source = record.legacySource,
               let tombstoneBytes = record.targetTombstoneBytes,
               try LegacySourceClearance.clearIfUnchanged(
                   snapshot: source,
                   keychain: sourceKeychain,
                   defaults: sourceDefaults.value,
                   v2Account: sourceV2Account,
                   legacyTokenAccount: sourceLegacyTokenAccount,
                   profileKey: sourceProfileKey,
                   legacyProfileKey: sourceLegacyProfileKey
               )
            {
                try artifacts.writeTombstoneExact(tombstoneBytes)
            }
            record.phase = .vaultApplied
            try journalIO.save(record)
            try crashIf(.afterVaultApply)
        }
        try registry.writeExact(record.targetRegistryBytes)
        guard try registry.readRaw() == record.targetRegistryBytes else {
            throw HostCatalogError.registryMismatch
        }
        if record.phase != .registryApplied {
            record.phase = .registryApplied
            try journalIO.save(record)
        }
    }

    private func persistImport(_ imported: LegacyHostImport.ImportedHost) throws {
        var document = HostRegistryDocument.empty()
        document.hosts = [imported.record]
        document = document.touching(imported.record.connectionId, at: imported.record.pairedAt)
        let registryBytes = try registry.encode(document)
        let vaultAccount = HostVault.account(for: imported.record.connectionId)
        let vaultBytes = Data(imported.token.utf8)
        let record = HostTransactionJournal.Record(
            version: HostTransactionJournal.currentVersion,
            operationId: 0,
            kind: .add,
            connectionId: imported.record.connectionId,
            phase: .intent,
            targetRegistryBytes: registryBytes,
            targetVaultAccount: vaultAccount,
            targetVaultBytes: vaultBytes,
            deleteVaultAccount: nil,
            legacySource: nil,
            targetTombstoneBytes: nil
        )
        try journalIO.save(record)
        try applyJournal(record)
        try journalIO.delete()
        try artifacts.saveReceipt(
            LegacyHostImport.Receipt(
                version: LegacyHostImport.Receipt.currentVersion,
                fingerprint: imported.fingerprint,
                importedConnectionId: imported.record.connectionId,
                importedAt: Date(),
                sourceKind: imported.sourceKind
            )
        )
    }

    private func legacyClearPlan(
        removed: ClientConnectionID,
        receipt: LegacyHostImport.Receipt?
    ) throws -> (source: LegacyHostSourceSnapshot, tombstoneBytes: Data)? {
        guard let receipt, receipt.importedConnectionId == removed else { return nil }
        let sources = try LegacyHostImport.readSources(
            keychain: sourceKeychain,
            defaults: sourceDefaults.value,
            v2Account: sourceV2Account,
            legacyTokenAccount: sourceLegacyTokenAccount,
            profileKey: sourceProfileKey,
            legacyProfileKey: sourceLegacyProfileKey
        )
        let current = LegacyHostImport.fingerprint(
            v2: sources.v2,
            profile: sources.profile,
            token: sources.token
        )
        guard current == receipt.fingerprint else { return nil }
        let tombstone = LegacyHostImport.Tombstone(
            version: LegacyHostImport.Tombstone.currentVersion,
            fingerprint: receipt.fingerprint,
            clearedConnectionId: removed,
            clearedAt: Date()
        )
        return (sources, try HostRegistryCoding.encode(tombstone))
    }

    private func consumeMutationCheckpoint() async {
        let checkpoint = mutationCheckpoint
        mutationCheckpoint = nil
        if let checkpoint {
            await checkpoint()
        }
    }

    private func crashIf(_ stage: HostTransactionJournal.Stage) throws {
        guard crashAfterStage == stage else { return }
        crashAfterStage = nil
        throw KeychainError.unhandled(errSecIO)
    }
}

enum HostCatalogError: Error, Sendable, Equatable {
    case journalInconsistent
    case registryMismatch
    case unknownHost
    case missingCredential
}
