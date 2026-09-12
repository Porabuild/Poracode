import Foundation

/// Per-host live surface that must not leak across `ClientConnectionID`s.
struct HostRuntimeCache: Sendable, Equatable {
    var lastSeenSeq: Int = 0
    var interests: [String] = []
    var snapshot: RemoteShellSnapshot?
    var projectsLoadState: SessionLoadState = .idle
    var openThreadId: String?
    var threadOlderCursor: Int?
    /// Replayed Git/agent/thread-lifecycle state for this exact host identity.
    /// Never installed into another slot, so colliding thread ids stay isolated.
    var replay = HostReplayState()
    /// Ordered Git-state interests last sent on this host's socket.
    var gitStateInterests: [GitStateInterest] = []
}

enum SessionPoolKey: Hashable, Sendable, Equatable {
    case host(ClientConnectionID)
    case legacy

    var connectionId: ClientConnectionID? {
        if case .host(let id) = self { return id }
        return nil
    }
}

/// Identity + generation lease. Stale callbacks / tasks must no-op.
struct SessionLease: Hashable, Sendable, Equatable {
    var key: SessionPoolKey
    var generation: UInt64

    var connectionId: ClientConnectionID? { key.connectionId }
}

enum SessionPoolEviction {
    static let maxLiveSockets = 2

    /// Deterministic victims: anyone not in `{selected, secondary}` , sorted by id.
    static func victims(
        live: [SessionPoolKey],
        selected: SessionPoolKey?,
        secondary: SessionPoolKey?
    ) -> [SessionPoolKey] {
        let allowed = Set([selected, secondary].compactMap { $0 })
        return live
            .filter { !allowed.contains($0) }
            .sorted(by: Self.lessThan)
    }

    static func allowedKeys(
        selected: ClientConnectionID?,
        lru: [ClientConnectionID]
    ) -> (selected: SessionPoolKey?, secondary: SessionPoolKey?) {
        if let selected {
            let secondary = lru.first { $0 != selected }
            return (.host(selected), secondary.map { .host($0) })
        }
        return (.legacy, nil)
    }

    static func lessThan(_ lhs: SessionPoolKey, _ rhs: SessionPoolKey) -> Bool {
        switch (lhs, rhs) {
        case (.legacy, .legacy): return false
        case (.legacy, .host): return true
        case (.host, .legacy): return false
        case (.host(let a), .host(let b)): return a < b
        }
    }
}
