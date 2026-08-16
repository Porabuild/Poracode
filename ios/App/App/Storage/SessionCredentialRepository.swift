import Foundation
import Security

// MARK: - Legacy migration (pure)

enum SessionCredentialLegacyMigration {
    enum Outcome: Sendable, Equatable {
        case nothingToMigrate
        case migrated(SessionCredentials)
        case inconsistent
    }

    static func migrate(
        legacyProfileData: Data?,
        legacyTokenData: Data?,
        decodeProfile: (Data) -> ConnectionProfile?,
        decodeToken: (Data) -> String?
    ) -> Outcome {
        let profile = legacyProfileData.flatMap(decodeProfile)
        let token = legacyTokenData.flatMap(decodeToken)

        let hasProfile = profile != nil
        let hasToken = !(token ?? "").isEmpty

        // Orphan / split-v1 incomplete: typed inconsistency, caller preserves bytes.
        if hasProfile != hasToken {
            return .inconsistent
        }
        guard let profile, let token, !token.isEmpty else {
            return .nothingToMigrate
        }

        var bound = profile
        if bound.protocolVersion == 0 {
            bound.protocolVersion = ProtocolConstants.remoteProtocolVersion
        }
        guard bound.protocolVersion == ProtocolConstants.remoteProtocolVersion else {
            return .inconsistent
        }

        return .migrated(SessionCredentials(profile: bound, accessToken: token))
    }

    static func decodeLegacyProfileDocument(_ data: Data) -> ConnectionProfile? {
        do {
            let document = try JSONDecoding.decode(ConnectionStoreDocument.self, from: data)
            guard document.version == 1, let profile = document.profile else {
                return nil
            }
            return profile
        } catch {
            return nil
        }
    }

    static func decodeLegacyToken(_ data: Data) -> String? {
        guard let token = String(data: data, encoding: .utf8), !token.isEmpty else {
            return nil
        }
        return token
    }
}

// MARK: - Repository actor

/// Serializes load / commit / clear. Keychain + legacy file I/O stay off MainActor.
///
/// Operation identity is allocated on MainActor and activated here — the repository
/// never allocates a second ordering clock from actor mailbox arrival.
actor SessionCredentialRepository: SessionCredentialStore {
    static let shared = SessionCredentialRepository()

    private let defaults: UserDefaults
    private let suiteName: String?
    private let clearance: SessionCredentialClearance

    /// Current MainActor-allocated operation id accepted via `activate`.
    private var currentOperationId: UInt64 = 0
    private var currentOperationKind: SessionCredentialOperationKind?
    /// Accepted Unpair receipts that have not been completed or superseded by a committed pair.
    private var pendingUnpairIds: Set<UInt64> = []
    /// Highest pair id whose bytes were durably verified in this process.
    private var highestCommittedPairId: UInt64?
    private var pendingClearUnknown = false
    private var journalHydrated = false

    /// Test-only one-shot: awaited at the start of the next commit/clear, then cleared.
    /// A reusable gate here deadlocks unpair/clear that hits the same checkpoint.
    private var mutationCheckpoint: (@Sendable () async -> Void)?

    /// Test-only one-shot: awaited after a successful durable write, before return.
    /// Lets tests activate a newer pair after Keychain upsert and before live install.
    private var afterCommitCheckpoint: (@Sendable () async -> Void)?

    /// Test-only: throw after completing this durable stage (crash/restart).
    private var crashAfterStage: SessionCredentialDurableStage?

    init(
        defaults: UserDefaults = .standard,
        profileKey: String = ConnectionStore.storageKey,
        legacyProfileKey: String = ConnectionStore.legacyStorageKey,
        keychain: any RawKeychainIO = SystemKeychainIO()
    ) {
        self.defaults = defaults
        self.suiteName = nil
        self.clearance = SessionCredentialClearance(
            keychain: keychain,
            credentialsAccount: SessionKeychainIO.credentialsAccount,
            legacyTokenAccount: SessionKeychainIO.legacyTokenAccount,
            pendingClearAccount: SessionPendingClearJournal.accountName(suiteName: nil),
            defaults: defaults,
            profileKey: profileKey,
            legacyProfileKey: legacyProfileKey
        )
    }

    /// Isolated suite for tests (UserDefaults + unique Keychain accounts).
    init(suiteName: String, keychain: (any RawKeychainIO)? = nil) {
        self.suiteName = suiteName
        self.defaults = UserDefaults(suiteName: suiteName) ?? .standard
        self.clearance = SessionCredentialClearance(
            keychain: keychain ?? SystemKeychainIO(),
            credentialsAccount: "\(SessionKeychainIO.credentialsAccount).\(suiteName)",
            legacyTokenAccount: "\(SessionKeychainIO.legacyTokenAccount).\(suiteName)",
            pendingClearAccount: SessionPendingClearJournal.accountName(suiteName: suiteName),
            defaults: self.defaults,
            profileKey: ConnectionStore.storageKey,
            legacyProfileKey: ConnectionStore.legacyStorageKey
        )
    }

    func wipeSuiteForTests() {
        if let suiteName {
            defaults.removePersistentDomain(forName: suiteName)
        }
        try? clearance.deleteV2Document()
        try? clearance.deleteLegacyToken()
        try? clearance.deleteMarker()
        currentOperationId = 0
        currentOperationKind = nil
        pendingUnpairIds = []
        highestCommittedPairId = nil
        pendingClearUnknown = false
        journalHydrated = false
        mutationCheckpoint = nil
        afterCommitCheckpoint = nil
        crashAfterStage = nil
    }

    func setMutationCheckpoint(_ checkpoint: (@Sendable () async -> Void)?) {
        mutationCheckpoint = checkpoint
    }

    func setAfterCommitCheckpoint(_ checkpoint: (@Sendable () async -> Void)?) {
        afterCommitCheckpoint = checkpoint
    }

    func setCrashAfterStage(_ stage: SessionCredentialDurableStage?) {
        crashAfterStage = stage
    }

    private func consumeMutationCheckpoint() async {
        let checkpoint = mutationCheckpoint
        mutationCheckpoint = nil
        if let checkpoint {
            await checkpoint()
        }
    }

    private func consumeAfterCommitCheckpoint() async {
        let checkpoint = afterCommitCheckpoint
        afterCommitCheckpoint = nil
        if let checkpoint {
            await checkpoint()
        }
    }

    private func crashIf(_ stage: SessionCredentialDurableStage) throws {
        guard crashAfterStage == stage else { return }
        crashAfterStage = nil
        throw KeychainError.unhandled(errSecIO)
    }

    // MARK: SessionCredentialStore

    func activate(id: UInt64, kind: SessionCredentialOperationKind) throws -> Bool {
        try hydrateJournalIfNeeded()
        switch kind {
        case .unpair:
            if let committed = highestCommittedPairId, committed > id {
                return false
            }
            // A later Pair receipt alone must not cancel this clear.
            try writePendingMarker(id: id, phase: .pendingClear)
            try crashIf(.afterPendingMarker)
            pendingUnpairIds.insert(id)
            if id >= currentOperationId {
                currentOperationId = id
                currentOperationKind = .unpair
            }
            return true
        case .pair, .bootstrapLoad:
            guard id >= currentOperationId else { return false }
            currentOperationId = id
            currentOperationKind = kind
            return true
        }
    }

    func loadOutcome(owning id: UInt64) throws -> SessionCredentialLoadOutcome {
        try hydrateJournalIfNeeded()
        guard id == currentOperationId else {
            throw KeychainError.unhandled(errSecAuthFailed)
        }
        return try resolveOutcome()
    }

    func currentOutcome() throws -> SessionCredentialLoadOutcome {
        try hydrateJournalIfNeeded()
        return try resolveOutcome()
    }

    func commit(
        _ credentials: SessionCredentials,
        owning id: UInt64
    ) async throws -> SessionCredentialMutationResult {
        await consumeMutationCheckpoint()
        try hydrateJournalIfNeeded()
        guard id == currentOperationId else { return .rejectedBeforeApply }
        if pendingUnpairIds.contains(where: { $0 > id }) {
            return .rejectedBeforeApply
        }
        guard !credentials.accessToken.isEmpty else {
            throw KeychainError.unhandled(errSecParam)
        }
        guard credentials.profile.protocolVersion == ProtocolConstants.remoteProtocolVersion else {
            throw RemoteClientError.protocolMismatch(found: credentials.profile.protocolVersion)
        }
        if hasPendingClearAuthority {
            try performMaterialClear()
            try writePendingMarker(id: pendingMarkerUnpairId(fallback: id), phase: .materialCleared)
        }
        let document = credentials.asDocument()
        let data = try JSONDecoding.encoder.encode(document)
        try clearance.keychain.save(account: clearance.credentialsAccount, data: data)
        await consumeAfterCommitCheckpoint()
        guard let verified = try clearance.loadV2(),
              case .compatible(let loaded) = clearance.decodeV2NonDestructive(verified),
              loaded == credentials
        else {
            throw KeychainError.unhandled(errSecAuthFailed)
        }
        try crashIf(.afterPairSaveBeforeMarkerRemoval)
        try clearance.deleteMarker()
        pendingUnpairIds = pendingUnpairIds.filter { $0 >= id }
        highestCommittedPairId = max(highestCommittedPairId ?? id, id)
        pendingClearUnknown = false
        if id != currentOperationId {
            return .appliedButSuperseded
        }
        return .applied
    }

    func clear(owning id: UInt64) async throws -> SessionCredentialMutationResult {
        await consumeMutationCheckpoint()
        try hydrateJournalIfNeeded()
        if let committed = highestCommittedPairId, committed > id {
            return .rejectedBeforeApply
        }
        let isPendingUnpair = pendingUnpairIds.contains(id)
        let isCurrentUnpair = id == currentOperationId && currentOperationKind == .unpair
        guard isPendingUnpair || isCurrentUnpair else { return .rejectedBeforeApply }
        try performMaterialClear()
        try writePendingMarker(id: id, phase: .materialCleared)
        guard try clearance.allCredentialMaterialAbsent() else {
            throw KeychainError.unhandled(errSecAuthFailed)
        }
        try clearance.deleteMarker()
        pendingUnpairIds.remove(id)
        pendingUnpairIds = pendingUnpairIds.filter { $0 > id }
        pendingClearUnknown = false
        await consumeAfterCommitCheckpoint()
        if id != currentOperationId {
            return .appliedButSuperseded
        }
        return .applied
    }

    // MARK: Test seeds / probes

    func seedV2Document(_ data: Data) throws {
        try clearance.keychain.save(account: clearance.credentialsAccount, data: data)
    }

    func seedLegacyToken(_ token: String) throws {
        try clearance.keychain.save(account: clearance.legacyTokenAccount, data: Data(token.utf8))
    }

    func seedLegacyProfileDocument(_ data: Data) {
        defaults.set(data, forKey: clearance.profileKey)
    }

    func seedLegacyProfileKeyData(_ data: Data) {
        defaults.set(data, forKey: clearance.legacyProfileKey)
    }

    func v2RawData() throws -> Data? { try clearance.loadV2() }
    func legacyTokenRawData() throws -> Data? { try clearance.loadLegacyToken() }
    func legacyProfileRawData() -> Data? { clearance.legacyProfileData() }
    func pendingClearRawData() throws -> Data? { try clearance.loadMarkerData() }
    func currentOperationIdForTests() -> UInt64 { currentOperationId }
    func pendingUnpairIdsForTests() -> Set<UInt64> { pendingUnpairIds }
    func legacyTokenAccountForTests() -> String { clearance.legacyTokenAccount }
    func pendingClearAccountForTests() -> String { clearance.pendingClearAccount }
    func credentialsAccountForTests() -> String { clearance.credentialsAccount }

    // MARK: Private

    private var hasPendingClearAuthority: Bool {
        pendingClearUnknown || !pendingUnpairIds.isEmpty
    }

    private func hydrateJournalIfNeeded() throws {
        if journalHydrated { return }
        journalHydrated = true
        switch try clearance.decodedMarker() {
        case .none:
            return
        case .current(let marker):
            pendingUnpairIds.insert(marker.unpairOperationId)
        case .future, .corrupt:
            pendingClearUnknown = true
        }
    }

    private func pendingMarkerUnpairId(fallback: UInt64) -> UInt64 {
        pendingUnpairIds.min() ?? fallback
    }

    private func writePendingMarker(id: UInt64, phase: SessionPendingClearJournal.Phase) throws {
        try clearance.saveMarker(
            SessionPendingClearJournal.Marker(
                version: SessionPendingClearJournal.currentVersion,
                unpairOperationId: id,
                phase: phase
            )
        )
    }

    private func performMaterialClear() throws {
        try clearance.deleteV2Document()
        try crashIf(.afterV2Delete)
        clearance.removeLegacyProfiles()
        try crashIf(.afterLegacyProfileRemoval)
        try clearance.deleteLegacyToken()
        try crashIf(.afterLegacyTokenDelete)
    }

    private func resolveOutcome() throws -> SessionCredentialLoadOutcome {
        if pendingClearUnknown {
            do {
                try performMaterialClear()
            } catch {
                return .localStoreInconsistent
            }
            return .localStoreInconsistent
        }
        if !pendingUnpairIds.isEmpty {
            return try resolvePendingClear()
        }
        if let data = try clearance.loadV2() {
            return clearance.decodeV2NonDestructive(data)
        }
        return try migrateLegacyIfNeeded()
    }

    private func resolvePendingClear() throws -> SessionCredentialLoadOutcome {
        let phase: SessionPendingClearJournal.Phase
        if case .current(let marker) = try clearance.decodedMarker() {
            phase = marker.phase
        } else {
            phase = .pendingClear
        }
        if phase == .pendingClear {
            do {
                try performMaterialClear()
                try writePendingMarker(
                    id: pendingMarkerUnpairId(fallback: 0),
                    phase: .materialCleared
                )
                guard try clearance.allCredentialMaterialAbsent() else {
                    return .localStoreInconsistent
                }
                try clearance.deleteMarker()
                return .absent
            } catch {
                return .localStoreInconsistent
            }
        }
        if let data = try clearance.loadV2() {
            let decoded = clearance.decodeV2NonDestructive(data)
            guard case .compatible = decoded else {
                return decoded
            }
            do {
                clearance.removeLegacyProfiles()
                try clearance.deleteLegacyToken()
                try clearance.deleteMarker()
                // B is the durable winner — earlier Unpair receipts are complete.
                pendingUnpairIds = []
                pendingClearUnknown = false
                return decoded
            } catch {
                return .localStoreInconsistent
            }
        }
        do {
            clearance.removeLegacyProfiles()
            try clearance.deleteLegacyToken()
            guard try clearance.allCredentialMaterialAbsent() else {
                return .localStoreInconsistent
            }
            try clearance.deleteMarker()
            return .absent
        } catch {
            return .localStoreInconsistent
        }
    }

    private func migrateLegacyIfNeeded() throws -> SessionCredentialLoadOutcome {
        let profileData = clearance.legacyProfileData()
        let tokenData = try clearance.loadLegacyToken()

        if let profileData, SessionCredentialLegacyMigration.decodeLegacyProfileDocument(profileData) == nil,
           tokenData != nil {
            return .localStoreInconsistent
        }

        let outcome = SessionCredentialLegacyMigration.migrate(
            legacyProfileData: profileData,
            legacyTokenData: tokenData,
            decodeProfile: SessionCredentialLegacyMigration.decodeLegacyProfileDocument,
            decodeToken: SessionCredentialLegacyMigration.decodeLegacyToken
        )

        switch outcome {
        case .nothingToMigrate:
            return .absent
        case .inconsistent:
            return .localStoreInconsistent
        case .migrated(let credentials):
            let data = try JSONDecoding.encoder.encode(credentials.asDocument())
            try clearance.keychain.save(account: clearance.credentialsAccount, data: data)
            guard let verified = try clearance.loadV2() else {
                return .localStoreInconsistent
            }
            let decoded = clearance.decodeV2NonDestructive(verified)
            guard case .compatible(let loaded) = decoded,
                  loaded.accessToken == credentials.accessToken,
                  loaded.profile.desktopId == credentials.profile.desktopId
            else {
                return .localStoreInconsistent
            }
            return .compatible(loaded)
        }
    }
}
