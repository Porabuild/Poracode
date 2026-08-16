import Foundation

// MARK: - Document (v2 single-host — do not reinterpret as multi-host registry)

/// Atomic session credentials document (profile + bearer token).
/// Version lives inside the payload; Keychain service/account stay stable.
struct SessionCredentialDocument: Codable, Sendable, Equatable {
    /// Payload schema version for the unified credential item (single-host).
    /// Multi-host migrates later under a separate v3 boundary.
    static let currentVersion = 2

    var version: Int
    /// Remote protocol binding. Must equal `ProtocolConstants.remoteProtocolVersion` when compatible.
    var protocolVersion: Int
    var profile: ConnectionProfile
    /// Bearer access token — never logged.
    var accessToken: String
}

/// In-memory coherent credential pair used by the session layer.
struct SessionCredentials: Sendable, Equatable {
    var profile: ConnectionProfile
    var accessToken: String

    var protocolVersion: Int {
        profile.protocolVersion
    }

    func asDocument() -> SessionCredentialDocument {
        SessionCredentialDocument(
            version: SessionCredentialDocument.currentVersion,
            protocolVersion: profile.protocolVersion,
            profile: profile,
            accessToken: accessToken
        )
    }

    /// Decode a current-schema document without enforcing remote protocol binding.
    static func fromCurrentSchema(_ document: SessionCredentialDocument) -> SessionCredentials? {
        guard document.version == SessionCredentialDocument.currentVersion else { return nil }
        guard !document.accessToken.isEmpty else { return nil }
        var profile = document.profile
        profile.protocolVersion = document.protocolVersion
        return SessionCredentials(profile: profile, accessToken: document.accessToken)
    }
}

// MARK: - Typed load outcome

/// Non-destructive load result. Future / protocol-mismatched / corrupt items are never deleted here.
enum SessionCredentialLoadOutcome: Sendable, Equatable {
    case absent
    case compatible(SessionCredentials)
    /// Current document schema, remote protocol binding mismatch. Profile/token retained.
    case protocolMismatch(SessionCredentials)
    /// Future document version. Raw Keychain bytes preserved. Optional partial metadata only when safe.
    case futureVersion(partial: SessionCredentials?)
    /// Corrupt / unreadable / local inconsistency. Bytes preserved until explicit Disconnect.
    case localStoreInconsistent
}

// MARK: - Operation identity (MainActor-allocated, repository-enforced)

/// Kind of durable mutation. IDs are allocated on MainActor; the repository never invents a second clock.
enum SessionCredentialOperationKind: String, Sendable, Equatable {
    case bootstrapLoad
    case pair
    case unpair
}

// MARK: - Typed durable mutation result

/// Distinguishes "I/O applied" from "rejected before any durable change".
/// Callers must never compensate an applied predecessor using stale captured bytes.
enum SessionCredentialMutationResult: Sendable, Equatable {
    /// Durable I/O completed and `id` still owned the store afterward.
    case applied
    /// Durable I/O completed, then a newer operation took ownership before return.
    /// Disk already reflects this mutation; do not roll back with predecessor bytes.
    case appliedButSuperseded
    /// Ownership check failed before any Keychain / defaults mutation.
    case rejectedBeforeApply

    /// True when this call changed (or successfully confirmed) durable bytes.
    var didApply: Bool {
        switch self {
        case .applied, .appliedButSuperseded: return true
        case .rejectedBeforeApply: return false
        }
    }
}

// MARK: - Protocol

/// Single owner for durable session credentials (profile + token).
/// All activate / load / commit / clear are serialized on the implementing actor.
///
/// Ordering: MainActor allocates a monotonic `operationId` synchronously for bootstrap/pair/unpair.
/// Pair/bootstrap `activate` accepts only `id >= currentId`. Unpair `activate` is accepted even
/// after a later Pair receipt unless a newer Pair has already durably committed; it writes the
/// pending-clear journal before returning. `commit` honors every earlier pending clear, then
/// saves. `clear(N)` finishes a pending Unpair unless a newer Pair has committed.
protocol SessionCredentialStore: Sendable {
    /// Accept ownership. Unpair writes the pending-clear marker before returning.
    /// Throws on journal I/O failure — never a silent success.
    @discardableResult
    func activate(id: UInt64, kind: SessionCredentialOperationKind) async throws -> Bool
    /// Typed load. Never deletes future/mismatch/corrupt material unless a pending-clear
    /// marker means explicit Disconnect owns the clear. Rejects stale owning ids.
    func loadOutcome(owning id: UInt64) async throws -> SessionCredentialLoadOutcome
    /// Read current durable outcome after queued actor work settles. No ownership required.
    /// While a pending-clear marker exists, never reports or migrates the disconnected host.
    func currentOutcome() async throws -> SessionCredentialLoadOutcome
    /// Commit only if `id` still owns the repository current operation at apply time.
    /// A pair older than a pending Unpair is rejected. Applied I/O is never described as not applied.
    @discardableResult
    func commit(
        _ credentials: SessionCredentials,
        owning id: UInt64
    ) async throws -> SessionCredentialMutationResult
    /// Finish an accepted pending Unpair. Rejected only when a newer Pair has durably committed.
    @discardableResult
    func clear(owning id: UInt64) async throws -> SessionCredentialMutationResult
}
