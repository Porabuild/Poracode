import Foundation

/// Per-host live surface that must not leak across `ClientConnectionID`s.
struct HostRuntimeCache: Sendable, Equatable {
    var lastSeenSeq: Int = 0
    /// Event-stream epoch `lastSeenSeq` is bound to (`eventEpoch=v1`); nil while unbound.
    var lastSeenEpoch: String?
    var interests: [String] = []
    var snapshot: RemoteShellSnapshot?
    var projectsLoadState: SessionLoadState = .idle
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
    /// Foreground clients keep every paired host current. The selected key
    /// still owns commands; presence here only permits that host's own socket.
    static func allowedKeys(
        selected: ClientConnectionID?,
        paired: [ClientConnectionID]
    ) -> [SessionPoolKey] {
        let selectedKey = selected.map(SessionPoolKey.host) ?? .legacy
        var seen: Set<SessionPoolKey> = [selectedKey]
        return [selectedKey] + paired.map(SessionPoolKey.host).filter { seen.insert($0).inserted }
    }

    /// Only removed/unpaired hosts are evicted, in a deterministic order.
    static func victims(live: [SessionPoolKey], allowed: [SessionPoolKey]) -> [SessionPoolKey] {
        let allowed = Set(allowed)
        return live.filter { !allowed.contains($0) }.sorted(by: Self.lessThan)
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
