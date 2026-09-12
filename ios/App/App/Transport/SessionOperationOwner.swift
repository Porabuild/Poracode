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

// MARK: - Thread open ownership

/// Explicit open-thread epoch that changes on every close/open, even for the same id.
struct ThreadOpenOwnership: Sendable, Equatable {
    private(set) var threadId: String?
    private(set) var epoch: Int = 0
    private(set) var sessionGeneration: Int = 0
    /// Captured HTTP endpoint identity for the load.
    private(set) var apiEndpoint: String?
    /// Socket instance identity at open time (optional; nil when deferred).
    private(set) var socketObjectID: ObjectIdentifier?

    struct Token: Sendable, Equatable {
        var threadId: String
        var epoch: Int
        var sessionGeneration: Int
        var apiEndpoint: String?
        var socketObjectID: ObjectIdentifier?
    }

    /// Open (or reopen) a thread. Always advances epoch.
    @discardableResult
    mutating func open(
        threadId: String,
        sessionGeneration: Int,
        apiEndpoint: String?,
        socketObjectID: ObjectIdentifier?
    ) -> Token {
        epoch += 1
        self.threadId = threadId
        self.sessionGeneration = sessionGeneration
        self.apiEndpoint = apiEndpoint
        self.socketObjectID = socketObjectID
        return currentToken()!
    }

    /// Close the open thread. Advances epoch so in-flight loads become stale.
    mutating func close() {
        epoch += 1
        threadId = nil
        apiEndpoint = nil
        socketObjectID = nil
    }

    /// Discard ownership without requiring a matching token (pair/unpair/cancel).
    mutating func invalidate() {
        epoch += 1
        threadId = nil
        apiEndpoint = nil
        socketObjectID = nil
    }

    /// After background recovery: rebind an already-open thread to the current session generation
    /// so pagination / metadata refresh remain valid without reopening.
    mutating func rebindSessionGeneration(_ sessionGeneration: Int) {
        guard threadId != nil else { return }
        self.sessionGeneration = sessionGeneration
    }

    func currentToken() -> Token? {
        guard let threadId else { return nil }
        return Token(
            threadId: threadId,
            epoch: epoch,
            sessionGeneration: sessionGeneration,
            apiEndpoint: apiEndpoint,
            socketObjectID: socketObjectID
        )
    }

    /// True when the captured load identity still owns the open thread.
    func isCurrent(_ token: Token, sessionGeneration: Int, apiEndpoint: String?) -> Bool {
        guard self.threadId == token.threadId,
              self.epoch == token.epoch,
              token.sessionGeneration == sessionGeneration,
              self.sessionGeneration == sessionGeneration
        else { return false }
        // API identity: if either side captured an endpoint, they must match.
        if let expected = token.apiEndpoint, let current = apiEndpoint {
            return expected == current
        }
        return true
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

// MARK: - Pending deep-link pairing

/// In-memory pending pairing credential (never logged / never persisted).
struct PendingPairingState: Sendable, Equatable {
    /// Sanitized HTTP endpoint the user would reach.
    var endpoint: String
    /// Host-only display string (no token).
    var hostDisplay: String
    /// One-time credential held only until confirm / cancel / background.
    var credential: String
    /// Non-secret fingerprint digest.
    var digest: String
    var isCleartextLan: Bool
    /// When true, confirming will replace an existing live pair.
    var replacesExistingPair: Bool

    /// UI-safe view — never exposes credential.
    var sanitizedDescription: String {
        if isCleartextLan {
            return "\(hostDisplay) (plain HTTP)"
        }
        return hostDisplay
    }
}

enum DeepLinkPairingDecision: Sendable, Equatable {
    /// Malformed / incomplete / duplicate fingerprint — leave session alone.
    case ignore
    /// Enter pending confirmation (show host only).
    case pending(PendingPairingState)
}

enum DeepLinkPairingPolicy {
    /// Build a pending state from a resolved endpoint+credential without starting pair.
    /// Malformed resolution and duplicate fingerprints are no-ops.
    static func decide(
        endpoint: String?,
        credential: String?,
        tracker: PairingCandidateTracker,
        hasExistingPair: Bool
    ) -> DeepLinkPairingDecision {
        guard let endpoint, let credential, !endpoint.isEmpty, !credential.isEmpty else {
            return .ignore
        }
        let digest = PairingCandidateTracker.fingerprint(
            endpoint: endpoint,
            credential: credential
        )
        var trackerCopy = tracker
        guard trackerCopy.decide(digest: digest) == .proceed else {
            return .ignore
        }
        return .pending(
            PendingPairingState(
                endpoint: endpoint,
                hostDisplay: sanitizedHost(endpoint: endpoint),
                credential: credential,
                digest: digest,
                isCleartextLan: PairingURL.isCleartextLanURL(endpoint),
                replacesExistingPair: hasExistingPair
            )
        )
    }

    static func sanitizedHost(endpoint: String) -> String {
        guard let url = URL(string: endpoint), let host = url.host, !host.isEmpty else {
            // Strip any fragment/query that might carry secrets.
            if let base = endpoint.split(separator: "#").first {
                return String(base.split(separator: "?").first ?? base)
            }
            return endpoint
        }
        if let port = url.port {
            return "\(host):\(port)"
        }
        return host
    }
}

// MARK: - Shell refresh cursor policy

/// Manual/debounced shell snapshot must not advance the global replay cursor
/// while a thread is open unless that thread is rehydrated in the same commit.
enum ShellRefreshCursorPolicy {
    enum Decision: Sendable, Equatable {
        /// Bootstrap / no open thread — may baseline from shell.snapshotSeq.
        case advanceGlobalCursor
        /// Open thread present — update shell lists only; keep lastSeenSeq.
        case shellListsOnly
    }

    static func decision(hasOpenThread: Bool, isInitialBootstrap: Bool) -> Decision {
        if isInitialBootstrap { return .advanceGlobalCursor }
        if hasOpenThread { return .shellListsOnly }
        return .advanceGlobalCursor
    }
}

// MARK: - Resync transaction (pure)

/// Captured identities + fetched locals for a single atomic resync commit.
struct ResyncTransaction: Sendable {
    var workGeneration: Int
    var openThreadId: String?
    var openThreadEpoch: Int
    var apiEndpoint: String
    var socketObjectID: ObjectIdentifier?
    var shell: RemoteShellSnapshot
    var history: RemoteThreadSnapshot?
}

enum ResyncCommitDecision: Sendable, Equatable {
    case commit(reconnectSeq: Int, installHistory: Bool)
    case abortStale
    case abortCancelled
}

enum HostResyncPolicy {
    /// After all fetches succeed, decide whether identities still allow commit.
    static func commitDecision(
        transaction: ResyncTransaction,
        currentWorkGeneration: Int,
        currentOpenThreadId: String?,
        currentOpenThreadEpoch: Int,
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
        // Thread identity: if we fetched history for A, A must still be open at same epoch.
        if let expectedThread = transaction.openThreadId {
            guard currentOpenThreadId == expectedThread,
                  currentOpenThreadEpoch == transaction.openThreadEpoch
            else {
                // Thread switched — commit shell only if we still want shell baseline.
                // Spec: no partial UI/cursor if thread switched — abort entire transaction.
                return .abortStale
            }
        } else if currentOpenThreadId != nil {
            // Opened a thread mid-resync that we didn't fetch — abort (no partial).
            return .abortStale
        }
        let reconnect = GlobalCursorOwnership.resyncReconnectSeq(
            shellSnapshotSeq: transaction.shell.snapshotSeq
        )
        let installHistory = transaction.history != nil && transaction.openThreadId != nil
        return .commit(reconnectSeq: reconnect, installHistory: installHistory)
    }
}
