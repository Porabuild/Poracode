import Foundation

/// Single critical-section owner for bootstrap / pair / unpair.
///
/// MainActor allocates one monotonic `operationId` synchronously for durable work.
/// The repository activates that same id — it must not invent a second ordering clock.
/// Every await boundary re-checks `isCurrent(epoch)`. A stale owner must not write
/// session self-state after a newer pair/unpair/bootstrap wins.
struct SessionOperationOwner: Sendable, Equatable {
    enum Kind: String, Sendable, Equatable {
        case bootstrap
        case pair
        case unpair
        case connect
        case switchHost
        case renameHost
        case refreshCapabilities
        case removeHost
    }

    struct Begin: Sendable, Equatable {
        var epoch: Int
        var operationId: UInt64
        var workGeneration: Int
    }

    private(set) var epoch: Int = 0
    private(set) var kind: Kind?
    /// Monotonic work generation shared with live session / thread ownership.
    private(set) var workGeneration: Int = 0
    /// Monotonic durable operation id (pair/unpair/bootstrap). Shared with the credential repository.
    private(set) var operationId: UInt64 = 0

    /// Begin an exclusive operation. Bumps epoch, work generation, and durable operation id.
    @discardableResult
    mutating func begin(_ kind: Kind) -> Begin {
        epoch += 1
        workGeneration += 1
        operationId &+= 1
        self.kind = kind
        return Begin(epoch: epoch, operationId: operationId, workGeneration: workGeneration)
    }

    /// Begin a durable metadata mutation without invalidating live transport
    /// leases or stealing the session epoch from an in-flight host switch. The
    /// catalog operation id still serializes durable writes, while the caller
    /// checks that exact id before publishing metadata back to UI state.
    @discardableResult
    mutating func beginMetadata(_ kind: Kind) -> Begin {
        operationId &+= 1
        self.kind = kind
        return Begin(epoch: epoch, operationId: operationId, workGeneration: workGeneration)
    }

    /// Bump work generation only (e.g. cancel stale HTTP without starting pair).
    /// Does **not** advance durable `operationId`.
    @discardableResult
    mutating func bumpWorkGeneration() -> Int {
        workGeneration += 1
        return workGeneration
    }

    func isCurrent(_ ownerEpoch: Int) -> Bool {
        ownerEpoch == epoch
    }

    func isCurrentOperation(_ id: UInt64) -> Bool {
        id == operationId
    }

    func isCurrentWork(_ generation: Int) -> Bool {
        generation == workGeneration
    }
}

// MARK: - Ordered interest coordinator

/// Serializes thread-item-interest updates with a monotonic ordinal.
/// Ready always flushes the latest desired set for the current socket identity.
struct InterestUpdateCoordinator: Sendable, Equatable {
    private(set) var ordinal: Int = 0
    private(set) var desiredThreadIds: [String] = []
    private(set) var socketObjectID: ObjectIdentifier?

    struct Update: Sendable, Equatable {
        var ordinal: Int
        var threadIds: [String]
        var socketObjectID: ObjectIdentifier?
    }

    /// Record desired interests and return the update to apply after await.
    mutating func enqueue(
        threadIds: [String],
        socketObjectID: ObjectIdentifier?
    ) -> Update {
        ordinal += 1
        desiredThreadIds = ThreadItemInterestsWire.normalized(threadIds)
        self.socketObjectID = socketObjectID
        return Update(
            ordinal: ordinal,
            threadIds: desiredThreadIds,
            socketObjectID: socketObjectID
        )
    }

    /// Only the latest ordinal for the matching socket may apply.
    func shouldApply(_ update: Update, activeSocketObjectID: ObjectIdentifier?) -> Bool {
        guard update.ordinal == ordinal else { return false }
        // If we tracked a socket id, active must match.
        if let expected = update.socketObjectID {
            return expected == activeSocketObjectID
        }
        return true
    }

    /// Latest desired interests (for ready flush).
    var latestDesired: [String] { desiredThreadIds }

    mutating func reset() {
        ordinal += 1
        desiredThreadIds = []
        socketObjectID = nil
    }
}

// MARK: - Resync transaction (pure)

/// Captured identities + fetched locals for a single atomic resync commit.
struct ResyncTransaction: Sendable {
    var workGeneration: Int
    var apiEndpoint: String
    var socketObjectID: ObjectIdentifier?
    var shell: RemoteShellSnapshot
}

enum ResyncCommitDecision: Sendable, Equatable {
    case commit(reconnectSeq: Int)
    case abortStale
    case abortCancelled
}

enum HostResyncPolicy {
    /// After all fetches succeed, decide whether identities still allow commit.
    static func commitDecision(
        transaction: ResyncTransaction,
        currentWorkGeneration: Int,
        currentAPIEndpoint: String?,
        currentSocketObjectID: ObjectIdentifier?,
        isCancelled: Bool
    ) -> ResyncCommitDecision {
        if isCancelled { return .abortCancelled }
        guard transaction.workGeneration == currentWorkGeneration else {
            return .abortStale
        }
        guard transaction.apiEndpoint == currentAPIEndpoint else {
            return .abortStale
        }
        // Socket may be nil on both sides (background deferred).
        if transaction.socketObjectID != currentSocketObjectID {
            return .abortStale
        }
        let reconnect = GlobalCursorOwnership.resyncReconnectSeq(
            shellSnapshotSeq: transaction.shell.snapshotSeq
        )
        return .commit(reconnectSeq: reconnect)
    }
}
