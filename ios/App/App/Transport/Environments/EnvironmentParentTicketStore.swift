import Foundation

/// Bounded association between a just-minted child WS ticket and the parent
/// upgrade ticket minted for that exact child ticket.
///
/// The parent ticket is single-use, short-lived, and bound to
/// `(parent session, environmentId)`. It must never be cached globally: the
/// event socket and the rich-chat terminal socket can mint concurrently, and
/// each upgrade must present the parent ticket minted for its own child
/// ticket. Entries are consumed exactly once, bounded by count and TTL, and
/// expire silently so a stale association can never be replayed.
actor EnvironmentParentTicketStore {
    static let shared = EnvironmentParentTicketStore()

    struct Entry: Sendable, Equatable {
        let parentTicket: String
        let expiresAt: Date
    }

    static let defaultTTLSeconds: TimeInterval = 25
    static let maximumEntries = 8

    private let ttl: TimeInterval
    private let maximumEntries: Int
    private let now: @Sendable () -> Date
    private var entries: [String: Entry] = [:]

    init(
        ttl: TimeInterval = EnvironmentParentTicketStore.defaultTTLSeconds,
        maximumEntries: Int = EnvironmentParentTicketStore.maximumEntries,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.ttl = ttl
        self.maximumEntries = max(1, maximumEntries)
        self.now = now
    }

    /// Store the parent ticket minted for `childTicket`. `expiresAt` comes from
    /// the parent ticket response when parseable; the local TTL is always
    /// applied as an upper bound so a skewed server clock cannot extend it.
    func store(
        parentTicket: String,
        childTicket: String,
        expiresAt: Date? = nil
    ) {
        guard !parentTicket.isEmpty, !childTicket.isEmpty else { return }
        pruneExpired()
        let localExpiry = now().addingTimeInterval(ttl)
        let effective = expiresAt.map { min($0, localExpiry) } ?? localExpiry
        entries[childTicket] = Entry(parentTicket: parentTicket, expiresAt: effective)
        while entries.count > maximumEntries, let oldest = entries.min(by: {
            $0.value.expiresAt < $1.value.expiresAt
        }) {
            entries.removeValue(forKey: oldest.key)
        }
    }

    /// Consume the parent ticket for exactly this child ticket. Returns nil
    /// when the association is missing or expired (fail closed; the upgrade
    /// must not proceed without a parent ticket).
    func consume(childTicket: String) -> String? {
        pruneExpired()
        guard let entry = entries.removeValue(forKey: childTicket) else { return nil }
        guard entry.expiresAt > now() else { return nil }
        return entry.parentTicket
    }

    /// Test/diagnostic view of live entries (expired entries excluded).
    func liveCount() -> Int {
        pruneExpired()
        return entries.count
    }

    func resetForTests() {
        entries.removeAll()
    }

    private func pruneExpired() {
        let current = now()
        entries = entries.filter { $0.value.expiresAt > current }
    }
}
