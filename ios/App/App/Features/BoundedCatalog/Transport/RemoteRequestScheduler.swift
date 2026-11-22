import Foundation

enum RemoteRequestPriority: Int, Sendable, CaseIterable {
    case control = 0
    case interactive = 1
    case background = 2
}

struct RemoteRequestSchedulerLimits: Sendable, Equatable {
    let maxTotal: Int
    let maxBulk: Int
    let maxBackground: Int

    static let `default` = RemoteRequestSchedulerLimits(
        maxTotal: 48,
        maxBulk: 40,
        maxBackground: 14
    )

    init(maxTotal: Int = 48, maxBulk: Int = 40, maxBackground: Int = 14) {
        let resolvedTotal = max(1, maxTotal)
        let resolvedBulk = min(resolvedTotal, max(1, maxBulk))
        let resolvedBackground = min(resolvedBulk, max(1, maxBackground))
        self.maxTotal = resolvedTotal
        self.maxBulk = resolvedBulk
        self.maxBackground = resolvedBackground
    }
}

struct RemoteRequestSchedulerStats: Sendable, Equatable {
    let activeControl: Int
    let activeInteractive: Int
    let activeBackground: Int
    let queuedControl: Int
    let queuedInteractive: Int
    let queuedBackground: Int

    var activeTotal: Int { activeControl + activeInteractive + activeBackground }
}

final class RemoteRequestLease: @unchecked Sendable {
    private let lock = NSLock()
    private var released = false
    private let onRelease: () -> Void

    init(onRelease: @escaping () -> Void) {
        self.onRelease = onRelease
    }

    func release() {
        lock.lock()
        guard !released else {
            lock.unlock()
            return
        }
        released = true
        lock.unlock()
        onRelease()
    }

    deinit {
        release()
    }
}

enum RemoteRequestClassification {
    static let defaultOverloadMaxRetries = 3
    static let minOverloadDelayMs = 150
    static let maxOverloadDelayMs = 5_000
    static let maxBackgroundPauseMs = 2_000
    private static let defaultOverloadBackoffMs = [200, 500, 1_200]

    private static let controlThreadSuffixes: [String] = [
        "/interrupt",
        "/close",
        "/terminal/close",
        "/requests/resolve",
    ]

    /// Background RPC procedures implemented on iOS so background git/PR work
    /// never starves interactive thread history or control commands.
    private static let backgroundProcedures: Set<String> = [
        "getGitStatus",
        "gitListBranches",
        "gitListWorktrees",
        "gitProjectSnapshot",
        "gitWorktreeStatusBatch",
        "gitGetWorktreeSourceBranch",
        "gitGetWorktreeOwner",
        "ghCheckAvailable",
        "ghGetPrForBranch",
        "ghListPrs",
        "gitFetch",
        "workflowGetRun",
    ]

    private static let retryable429Codes: Set<String> = [
        "overloaded",
        "principal_busy",
        "settings_overloaded",
    ]

    static func classifyPriority(
        method: String,
        path: String,
        jsonBody: Data? = nil
    ) -> RemoteRequestPriority {
        let normalizedMethod = method.uppercased()
        let pathname = normalizePathname(path)

        if normalizedMethod == "POST" {
            if isControlThreadPath(pathname)
                || pathname == "/oauth/token"
                || pathname == "/api/auth/refresh"
                || pathname == "/api/auth/websocket-ticket"
            {
                return .control
            }
            if pathname == "/api/git/call" {
                if let procedure = extractProcedureName(jsonBody),
                   backgroundProcedures.contains(procedure)
                {
                    return .background
                }
                return .interactive
            }
            if pathname == "/api/files/image-ticket"
                || pathname == "/api/profile/core-stats"
                || pathname == "/api/profile/token-stats"
            {
                return .background
            }
            return .interactive
        }

        if pathname == "/api/files/image"
            || pathname == "/api/files/media"
            || pathname == "/api/host/update"
            || (pathname.hasPrefix("/api/agents/") && pathname.hasSuffix("/slash-commands"))
        {
            return .background
        }

        return .interactive
    }

    static func originKey(for endpoint: String) -> String {
        guard let components = URLComponents(string: endpoint),
              let scheme = components.scheme?.lowercased(),
              let host = components.host?.lowercased()
        else { return endpoint }
        if let port = components.port,
           !((scheme == "http" && port == 80) || (scheme == "https" && port == 443))
        {
            return "\(scheme)://\(host):\(port)"
        }
        return "\(scheme)://\(host)"
    }

    static func isRetryableAdmissionError(_ error: Error) -> Bool {
        guard let remote = error as? RemoteClientError else { return false }
        if remote.status == 429 && retryable429Codes.contains(remote.code) { return true }
        return remote.status == 503 && remote.code == "host_busy"
    }

    static func parseRetryAfterMs(_ headerValue: String?, now: Date = Date()) -> Int? {
        guard let trimmed = headerValue?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty
        else { return nil }
        if let seconds = Int(trimmed) {
            return max(0, seconds * 1_000)
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        if let date = formatter.date(from: trimmed) {
            return max(0, Int((date.timeIntervalSince(now) * 1_000).rounded()))
        }
        return nil
    }

    static func computeOverloadRetryDelayMs(attempt: Int, retryAfterMs: Int?) -> Int {
        if let retryAfterMs, retryAfterMs >= 0 {
            return min(max(retryAfterMs, minOverloadDelayMs), maxOverloadDelayMs)
        }
        let clamped = min(max(0, attempt), defaultOverloadBackoffMs.count - 1)
        return defaultOverloadBackoffMs[clamped]
    }

    private static func normalizePathname(_ rawPath: String) -> String {
        let base = rawPath.split(separator: "?", maxSplits: 1).first.map(String.init) ?? rawPath
        if base.hasPrefix("/api/environments/") {
            let parts = base.split(separator: "/", omittingEmptySubsequences: false)
            // ["", "api", "environments", "<id>", "proxy", ...]
            if parts.count >= 5, parts[4] == "proxy" {
                let tail = parts.dropFirst(5).joined(separator: "/")
                return tail.isEmpty ? "/" : "/\(tail)"
            }
        }
        return base.hasPrefix("/") ? base : "/\(base)"
    }

    private static func isControlThreadPath(_ pathname: String) -> Bool {
        guard pathname.hasPrefix("/api/threads/") else { return false }
        for suffix in controlThreadSuffixes where pathname.hasSuffix(suffix) {
            let start = pathname.index(pathname.startIndex, offsetBy: "/api/threads/".count)
            let end = pathname.index(pathname.endIndex, offsetBy: -suffix.count)
            if start < end {
                let rawID = pathname[start..<end]
                if !rawID.contains("/") { return true }
            }
        }
        return false
    }

    private static func extractProcedureName(_ data: Data?) -> String? {
        guard let data,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let procedure = obj["procedure"] as? String
        else { return nil }
        return procedure
    }
}

/// Priority-aware per-origin request scheduler with AIMD adaptive throttling,
/// matching Desktop/PWA `RemoteRequestScheduler` (`control > interactive > background`).
final class RemoteRequestScheduler: @unchecked Sendable {
    static let shared = RemoteRequestScheduler()

    private static let adaptiveBulkFloor = 16
    private static let adaptiveBackgroundFloor = 6
    private static let adaptiveRecoverySuccesses = 8

    let limits: RemoteRequestSchedulerLimits
    private let nowMs: @Sendable () -> Int64
    private let lock = NSLock()
    private var buckets: [String: OriginBucket] = [:]

    private final class QueuedWaiter {
        let id = UUID()
        let priority: RemoteRequestPriority
        let onGrant: (RemoteRequestLease) -> Void
        let onCancel: () -> Void
        var settled = false

        init(
            priority: RemoteRequestPriority,
            onGrant: @escaping (RemoteRequestLease) -> Void,
            onCancel: @escaping () -> Void
        ) {
            self.priority = priority
            self.onGrant = onGrant
            self.onCancel = onCancel
        }
    }

    private final class OriginBucket {
        var activeControl = 0
        var activeInteractive = 0
        var activeBackground = 0
        var effectiveMaxBulk: Int
        var effectiveMaxBackground: Int
        var successesSinceThrottle = 0
        var backgroundPausedUntilMs: Int64 = 0
        var resumeWorkItem: DispatchWorkItem?
        var controlQueue: [QueuedWaiter] = []
        var interactiveQueue: [QueuedWaiter] = []
        var backgroundQueue: [QueuedWaiter] = []

        init(effectiveMaxBulk: Int, effectiveMaxBackground: Int) {
            self.effectiveMaxBulk = effectiveMaxBulk
            self.effectiveMaxBackground = effectiveMaxBackground
        }

        var activeTotal: Int { activeControl + activeInteractive + activeBackground }
        var activeBulk: Int { activeInteractive + activeBackground }
    }

    init(
        limits: RemoteRequestSchedulerLimits = .default,
        nowMs: @escaping @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1_000) }
    ) {
        self.limits = limits
        self.nowMs = nowMs
    }

    func tryAcquire(origin: String, priority: RemoteRequestPriority) -> RemoteRequestLease? {
        lock.lock()
        defer { lock.unlock() }
        let bucket = bucketLocked(origin)
        if canAdmitImmediatelyLocked(bucket, priority: priority) {
            return grantLeaseLocked(origin: origin, bucket: bucket, priority: priority)
        }
        pruneBucketIfIdleLocked(origin: origin, bucket: bucket)
        return nil
    }

    func acquire(origin: String, priority: RemoteRequestPriority) async throws -> RemoteRequestLease {
        try Task.checkCancellation()
        if let immediate = tryAcquire(origin: origin, priority: priority) {
            return immediate
        }
        let waiterID = UUID()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (cont: CheckedContinuation<RemoteRequestLease, Error>) in
                lock.lock()
                if Task.isCancelled {
                    lock.unlock()
                    cont.resume(throwing: CancellationError())
                    return
                }
                let bucket = bucketLocked(origin)
                if canAdmitImmediatelyLocked(bucket, priority: priority) {
                    let lease = grantLeaseLocked(origin: origin, bucket: bucket, priority: priority)
                    lock.unlock()
                    cont.resume(returning: lease)
                    return
                }
                let waiter = QueuedWaiter(
                    priority: priority,
                    onGrant: { lease in cont.resume(returning: lease) },
                    onCancel: { cont.resume(throwing: CancellationError()) }
                )
                switch priority {
                case .control: bucket.controlQueue.append(waiter)
                case .interactive: bucket.interactiveQueue.append(waiter)
                case .background:
                    bucket.backgroundQueue.append(waiter)
                    scheduleBackgroundResumeLocked(origin: origin, bucket: bucket)
                }
                waiterIDByRef[waiterID] = (origin, priority, waiter)
                lock.unlock()
            }
        } onCancel: {
            self.cancelWaiter(id: waiterID)
        }
    }

    private var waiterIDByRef: [UUID: (String, RemoteRequestPriority, QueuedWaiter)] = [:]

    private func cancelWaiter(id: UUID) {
        lock.lock()
        guard let (origin, priority, waiter) = waiterIDByRef.removeValue(forKey: id) else {
            lock.unlock()
            return
        }
        guard !waiter.settled else {
            lock.unlock()
            return
        }
        waiter.settled = true
        if let bucket = buckets[origin] {
            switch priority {
            case .control: bucket.controlQueue.removeAll { $0 === waiter }
            case .interactive: bucket.interactiveQueue.removeAll { $0 === waiter }
            case .background: bucket.backgroundQueue.removeAll { $0 === waiter }
            }
            pruneBucketIfIdleLocked(origin: origin, bucket: bucket)
        }
        lock.unlock()
        waiter.onCancel()
    }

    func noteOverload(origin: String, pauseMs: Int = RemoteRequestClassification.minOverloadDelayMs) {
        lock.lock()
        let bucket = bucketLocked(origin)
        let clamped = min(max(pauseMs, RemoteRequestClassification.minOverloadDelayMs), RemoteRequestClassification.maxBackgroundPauseMs)
        let until = nowMs() + Int64(clamped)
        if until > bucket.backgroundPausedUntilMs {
            bucket.backgroundPausedUntilMs = until
        }
        let bulkFloor = min(limits.maxBulk, Self.adaptiveBulkFloor)
        let bgFloor = min(limits.maxBackground, Self.adaptiveBackgroundFloor)
        bucket.effectiveMaxBulk = max(bulkFloor, bucket.effectiveMaxBulk / 2)
        bucket.effectiveMaxBackground = max(bgFloor, bucket.effectiveMaxBackground / 2)
        bucket.successesSinceThrottle = 0
        scheduleBackgroundResumeLocked(origin: origin, bucket: bucket)
        lock.unlock()
    }

    func stats(origin: String) -> RemoteRequestSchedulerStats {
        lock.lock()
        defer { lock.unlock() }
        guard let bucket = buckets[origin] else {
            return RemoteRequestSchedulerStats(
                activeControl: 0, activeInteractive: 0, activeBackground: 0,
                queuedControl: 0, queuedInteractive: 0, queuedBackground: 0
            )
        }
        return RemoteRequestSchedulerStats(
            activeControl: bucket.activeControl,
            activeInteractive: bucket.activeInteractive,
            activeBackground: bucket.activeBackground,
            queuedControl: bucket.controlQueue.count,
            queuedInteractive: bucket.interactiveQueue.count,
            queuedBackground: bucket.backgroundQueue.count
        )
    }

    func reset() {
        lock.lock()
        var cancelled: [QueuedWaiter] = []
        for bucket in buckets.values {
            bucket.resumeWorkItem?.cancel()
            bucket.resumeWorkItem = nil
            for waiter in bucket.controlQueue + bucket.interactiveQueue + bucket.backgroundQueue {
                if !waiter.settled {
                    waiter.settled = true
                    cancelled.append(waiter)
                }
            }
        }
        buckets.removeAll()
        waiterIDByRef.removeAll()
        lock.unlock()
        cancelled.forEach { $0.onCancel() }
    }

    /// Runs `operation` under a priority lease and retries only definite
    /// uncommitted host admission rejections (`429 overloaded/principal_busy/
    /// settings_overloaded`, `503 host_busy`) with AIMD + `Retry-After`.
    func withScheduledOverloadRetry<T>(
        origin: String,
        priority: RemoteRequestPriority,
        maxRetries: Int = RemoteRequestClassification.defaultOverloadMaxRetries,
        operation: () async throws -> T
    ) async throws -> T {
        var attempt = 0
        while true {
            let lease = try await acquire(origin: origin, priority: priority)
            do {
                let result = try await operation()
                lease.release()
                return result
            } catch is CancellationError {
                lease.release()
                throw CancellationError()
            } catch {
                guard RemoteRequestClassification.isRetryableAdmissionError(error) else {
                    lease.release()
                    throw error
                }
                let retryAfterMs = (error as? RemoteClientError)?.retryAfterMs
                let delayMs = RemoteRequestClassification.computeOverloadRetryDelayMs(
                    attempt: attempt,
                    retryAfterMs: retryAfterMs
                )
                noteOverload(origin: origin, pauseMs: delayMs)
                lease.release()
                guard attempt < maxRetries else { throw error }
                try await Task.sleep(for: .milliseconds(delayMs))
                attempt += 1
            }
        }
    }

    private func bucketLocked(_ origin: String) -> OriginBucket {
        if let existing = buckets[origin] { return existing }
        let created = OriginBucket(
            effectiveMaxBulk: limits.maxBulk,
            effectiveMaxBackground: limits.maxBackground
        )
        buckets[origin] = created
        return created
    }

    private func canAdmitLocked(_ bucket: OriginBucket, priority: RemoteRequestPriority) -> Bool {
        if bucket.activeTotal >= limits.maxTotal { return false }
        if priority == .control { return true }
        if bucket.activeBulk >= bucket.effectiveMaxBulk { return false }
        if priority == .interactive { return true }
        if bucket.activeBackground >= bucket.effectiveMaxBackground { return false }
        return bucket.backgroundPausedUntilMs <= nowMs()
    }

    private func canAdmitImmediatelyLocked(
        _ bucket: OriginBucket,
        priority: RemoteRequestPriority
    ) -> Bool {
        guard canAdmitLocked(bucket, priority: priority) else { return false }
        switch priority {
        case .control:
            return bucket.controlQueue.isEmpty
        case .interactive:
            return bucket.controlQueue.isEmpty && bucket.interactiveQueue.isEmpty
        case .background:
            return bucket.controlQueue.isEmpty
                && bucket.interactiveQueue.isEmpty
                && bucket.backgroundQueue.isEmpty
        }
    }

    private func grantLeaseLocked(
        origin: String,
        bucket: OriginBucket,
        priority: RemoteRequestPriority
    ) -> RemoteRequestLease {
        switch priority {
        case .control: bucket.activeControl += 1
        case .interactive: bucket.activeInteractive += 1
        case .background: bucket.activeBackground += 1
        }
        return RemoteRequestLease { [weak self] in
            self?.releaseLease(origin: origin, priority: priority)
        }
    }

    private func releaseLease(origin: String, priority: RemoteRequestPriority) {
        lock.lock()
        guard let bucket = buckets[origin] else {
            lock.unlock()
            return
        }
        switch priority {
        case .control: bucket.activeControl = max(0, bucket.activeControl - 1)
        case .interactive: bucket.activeInteractive = max(0, bucket.activeInteractive - 1)
        case .background: bucket.activeBackground = max(0, bucket.activeBackground - 1)
        }
        if bucket.backgroundPausedUntilMs <= nowMs(),
           (bucket.effectiveMaxBulk < limits.maxBulk
            || bucket.effectiveMaxBackground < limits.maxBackground)
        {
            bucket.successesSinceThrottle += 1
            if bucket.successesSinceThrottle >= Self.adaptiveRecoverySuccesses {
                bucket.successesSinceThrottle = 0
                bucket.effectiveMaxBulk = min(limits.maxBulk, bucket.effectiveMaxBulk + 2)
                bucket.effectiveMaxBackground = min(
                    limits.maxBackground,
                    bucket.effectiveMaxBackground + 1
                )
            }
        }
        let grants = drainLocked(origin: origin, bucket: bucket)
        lock.unlock()
        for (waiter, lease) in grants {
            waiter.onGrant(lease)
        }
    }

    private func drainLocked(
        origin: String,
        bucket: OriginBucket
    ) -> [(QueuedWaiter, RemoteRequestLease)] {
        var grants: [(QueuedWaiter, RemoteRequestLease)] = []
        while let next = shiftAdmissibleWaiterLocked(bucket) {
            next.settled = true
            let lease = grantLeaseLocked(origin: origin, bucket: bucket, priority: next.priority)
            grants.append((next, lease))
        }
        scheduleBackgroundResumeLocked(origin: origin, bucket: bucket)
        pruneBucketIfIdleLocked(origin: origin, bucket: bucket)
        return grants
    }

    private func shiftAdmissibleWaiterLocked(_ bucket: OriginBucket) -> QueuedWaiter? {
        for priority in RemoteRequestPriority.allCases {
            guard canAdmitLocked(bucket, priority: priority) else { continue }
            switch priority {
            case .control:
                while !bucket.controlQueue.isEmpty {
                    let candidate = bucket.controlQueue.removeFirst()
                    if !candidate.settled { return candidate }
                }
            case .interactive:
                while !bucket.interactiveQueue.isEmpty {
                    let candidate = bucket.interactiveQueue.removeFirst()
                    if !candidate.settled { return candidate }
                }
            case .background:
                while !bucket.backgroundQueue.isEmpty {
                    let candidate = bucket.backgroundQueue.removeFirst()
                    if !candidate.settled { return candidate }
                }
            }
        }
        return nil
    }

    private func scheduleBackgroundResumeLocked(origin: String, bucket: OriginBucket) {
        let remaining = bucket.backgroundPausedUntilMs - nowMs()
        if remaining <= 0 {
            bucket.resumeWorkItem?.cancel()
            bucket.resumeWorkItem = nil
            return
        }
        guard !bucket.backgroundQueue.isEmpty, bucket.resumeWorkItem == nil else { return }
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.lock.lock()
            guard let current = self.buckets[origin] else {
                self.lock.unlock()
                return
            }
            current.resumeWorkItem = nil
            let grants = self.drainLocked(origin: origin, bucket: current)
            self.lock.unlock()
            for (waiter, lease) in grants {
                waiter.onGrant(lease)
            }
        }
        bucket.resumeWorkItem = work
        DispatchQueue.global(qos: .utility).asyncAfter(
            deadline: .now() + .milliseconds(Int(remaining)),
            execute: work
        )
    }

    private func pruneBucketIfIdleLocked(origin: String, bucket: OriginBucket) {
        if bucket.activeTotal == 0,
           bucket.controlQueue.isEmpty,
           bucket.interactiveQueue.isEmpty,
           bucket.backgroundQueue.isEmpty,
           bucket.resumeWorkItem == nil,
           bucket.backgroundPausedUntilMs <= nowMs()
        {
            buckets.removeValue(forKey: origin)
        }
    }
}
