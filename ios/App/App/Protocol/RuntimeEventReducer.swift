import Foundation

/// Unwraps remote supervisor envelopes and reduces runtime item events for a thread transcript.
/// Aligns with `src/renderer/state/slices/runtimeEventReducer.ts` item/delta semantics:
/// - `item.started` creates; `item.updated` / `item.completed` / `content.delta` never fabricate
/// - payload merge is **shallow** top-level field replace (not recursive nested retention)
/// - `item.updated` **requires** payload key (strict decoder); explicit null clears
/// - `item.completed` with empty reasoning_text deletes the item
/// - `error` synthesizes a completed error item
/// - `turn.completed` interrupted/cancelled prunes trailing reasoning
/// - `request.opened` / `request.resolved` tracked in domain request state
/// - `usage.spent` is a no-op (main-process ledger only; no native ledger here)
enum RuntimeEventReducer {
    struct RuntimeEvent: Sendable, Equatable {
        var type: String
        var threadId: String?
        var itemId: String?
        var itemType: String?
        var state: String?
        var stream: String?
        var delta: String?
        var payload: JSONValue?
        /// True when the wire object contained a `payload` key (even if null).
        var payloadSpecified: Bool
        var parentItemId: String?
        var requestId: String?
        var requestType: String?
        var message: String?
        var turnId: String?
        var contextUsage: ThreadContextUsage?
        var raw: [String: JSONValue]

        /// Test/helper convenience: `payloadSpecified` defaults to `payload != nil`.
        init(
            type: String,
            threadId: String? = nil,
            itemId: String? = nil,
            itemType: String? = nil,
            state: String? = nil,
            stream: String? = nil,
            delta: String? = nil,
            payload: JSONValue? = nil,
            payloadSpecified: Bool? = nil,
            parentItemId: String? = nil,
            requestId: String? = nil,
            requestType: String? = nil,
            message: String? = nil,
            turnId: String? = nil,
            contextUsage: ThreadContextUsage? = nil,
            raw: [String: JSONValue] = [:]
        ) {
            self.type = type
            self.threadId = threadId
            self.itemId = itemId
            self.itemType = itemType
            self.state = state
            self.stream = stream
            self.delta = delta
            self.payload = payload
            self.payloadSpecified = payloadSpecified ?? (payload != nil)
            self.parentItemId = parentItemId
            self.requestId = requestId
            self.requestType = requestType
            self.message = message
            self.turnId = turnId
            self.contextUsage = contextUsage
            self.raw = raw
        }
    }

    struct Batch: Sendable, Equatable {
        var threadId: String
        var events: [RuntimeEvent]
    }

    /// Open request tracked from request.opened until request.resolved.
    struct OpenRuntimeRequest: Sendable, Equatable, Identifiable {
        var id: String { requestId }
        var requestId: String
        var threadId: String
        var requestType: String?
        var payload: JSONValue?
        var receivedAt: Date
    }

    // MARK: - Envelope unwrapping

    /// Collects runtime event batches from `thread-runtime-event`,
    /// `thread-runtime-events`, and `thread-runtime-events-multi` envelopes.
    static func collectRuntimeEvents(from supervisory: JSONValue) -> [Batch] {
        guard case .object(let object) = supervisory,
              let type = object["type"]?.stringValue
        else {
            return []
        }

        switch type {
        case "thread-runtime-event":
            guard let threadId = object["threadId"]?.stringValue,
                  let eventValue = object["event"],
                  case .object(let eventObject) = eventValue,
                  let event = RuntimeEventDecoder.decode(eventObject)
            else {
                return []
            }
            return [Batch(threadId: threadId, events: [event])]

        case "thread-runtime-events":
            guard let threadId = object["threadId"]?.stringValue,
                  case .array(let rawEvents) = object["events"]
            else {
                return []
            }
            let events = rawEvents.compactMap { value -> RuntimeEvent? in
                guard case .object(let obj) = value else { return nil }
                return RuntimeEventDecoder.decode(obj)
            }
            return events.isEmpty ? [] : [Batch(threadId: threadId, events: events)]

        case "thread-runtime-events-multi":
            guard case .array(let batches) = object["batches"] else { return [] }
            var results: [Batch] = []
            for batchValue in batches {
                guard case .object(let batchObject) = batchValue,
                      let threadId = batchObject["threadId"]?.stringValue,
                      case .array(let rawEvents) = batchObject["events"]
                else {
                    continue
                }
                let events = rawEvents.compactMap { value -> RuntimeEvent? in
                    guard case .object(let obj) = value else { return nil }
                    return RuntimeEventDecoder.decode(obj)
                }
                if !events.isEmpty {
                    results.append(Batch(threadId: threadId, events: events))
                }
            }
            return results

        default:
            return []
        }
    }

    // MARK: - Item reduction

    private static let stateRank: [String: Int] = [
        "started": 0,
        "updated": 1,
        "completed": 2,
    ]

    /// Applies a batch of runtime events to an item list (open-thread only).
    static func apply(
        events: [RuntimeEvent],
        to items: inout [PersistedRuntimeItem]
    ) {
        for event in events {
            apply(event: event, to: &items)
        }
    }

    /// Apply item-mutating events. Domain fields (open-turn/requests/context) via `applyDomain`.
    static func apply(event: RuntimeEvent, to items: inout [PersistedRuntimeItem]) {
        switch event.type {
        case "item.started":
            guard let itemId = event.itemId else { return }
            if items.contains(where: { $0.id == itemId }) { return }
            items.append(
                PersistedRuntimeItem(
                    id: itemId,
                    type: event.itemType ?? "unknown",
                    state: "started",
                    payload: event.payload,
                    streams: [:],
                    parentItemId: event.parentItemId
                )
            )

        case "item.updated":
            // Strict: payload key required (decoder rejects absent). Direct apply also no-ops.
            guard event.payloadSpecified,
                  let itemId = event.itemId,
                  let index = items.firstIndex(where: { $0.id == itemId })
            else { return }
            var item = items[index]
            item.state = monotonicState(current: item.state, incoming: "updated")
            // Explicit null clears; object shallow-merges.
            item.payload = mergePayload(item.payload, event.payload)
            items[index] = item

        case "item.completed":
            guard let itemId = event.itemId,
                  let index = items.firstIndex(where: { $0.id == itemId })
            else { return }
            var item = items[index]
            item.state = "completed"
            // Absent payload retains; explicit null clears; object merges.
            if event.payloadSpecified {
                item.payload = mergePayload(item.payload, event.payload)
            }
            if item.type == "reasoning" {
                let text = (item.streams["reasoning_text"] ?? "").trimmingCharacters(
                    in: .whitespacesAndNewlines
                )
                if text.isEmpty {
                    items.remove(at: index)
                    return
                }
            }
            items[index] = item

        case "content.delta":
            guard let itemId = event.itemId,
                  let stream = event.stream,
                  let delta = event.delta,
                  let index = items.firstIndex(where: { $0.id == itemId })
            else {
                return
            }
            var item = items[index]
            var streams = item.streams
            streams[stream, default: ""] += delta
            item.streams = streams
            item.state = monotonicState(current: item.state, incoming: "updated")
            items[index] = item

        case "error":
            let id = "err-\(UUID().uuidString)"
            let message = event.message
                ?? event.raw["message"]?.stringValue
                ?? "Runtime error"
            items.append(
                PersistedRuntimeItem(
                    id: id,
                    type: "error",
                    state: "completed",
                    payload: .object(["message": .string(message)]),
                    streams: [:],
                    parentItemId: nil
                )
            )

        case "turn.completed":
            let state = event.state ?? event.raw["state"]?.stringValue
            if state == "interrupted" || state == "cancelled" {
                pruneTrailingInterruptedReasoning(from: &items)
            }

        default:
            // session/warning/usage/turn.started/request.*/context.updated do not mutate items.
            break
        }
    }

    /// Apply domain mutations (open-turn, requests, context usage, completed turns).
    /// `usage.spent` is intentionally a no-op (no native usage ledger).
    static func applyDomain(
        event: RuntimeEvent,
        threadId: String,
        domain: inout RuntimeThreadDomainState
    ) {
        switch event.type {
        case "turn.started":
            if domain.openTurn != true {
                domain.openTurn = true
            }

        case "turn.completed":
            domain.openTurn = false
            if let turnId = event.turnId, let state = event.state {
                domain.completedTurns.append(
                    CompletedTurnRecord(turnId: turnId, state: state)
                )
            }
            if eventAffectsStructuralVersion(event) {
                domain.structuralVersion += 1
            }

        case "context.updated":
            if let usage = event.contextUsage {
                domain.contextUsage = usage
            }

        case "usage.spent":
            // Main-process ledger only — no conflicting native consumer.
            break

        case "request.opened":
            guard let requestId = event.requestId else { return }
            domain.openRequests.removeAll { $0.requestId == requestId }
            domain.openRequests.append(
                OpenRuntimeRequest(
                    requestId: requestId,
                    threadId: threadId,
                    requestType: event.requestType,
                    payload: event.payload,
                    receivedAt: Date()
                )
            )

        case "request.resolved":
            guard let requestId = event.requestId else { return }
            domain.openRequests.removeAll { $0.requestId == requestId }

        case "item.started", "item.updated", "item.completed", "error":
            if eventAffectsStructuralVersion(event) {
                domain.structuralVersion += 1
            }

        default:
            break
        }
    }

    /// Track request.opened / request.resolved (legacy entry used by session request list).
    static func applyRequestEvent(
        event: RuntimeEvent,
        threadId: String,
        to requests: inout [OpenRuntimeRequest]
    ) {
        var domain = RuntimeThreadDomainState(openRequests: requests)
        applyDomain(event: event, threadId: threadId, domain: &domain)
        requests = domain.openRequests
    }

    /// Hydrate domain from a history snapshot (contextUsage, completedTurns, pending requests).
    static func hydrateDomain(
        from history: RemoteThreadSnapshot,
        into domain: inout RuntimeThreadDomainState
    ) {
        // Install snapshot.contextUsage when valid.
        if let raw = history.contextUsage, case .object(let obj) = raw,
           let usage = RuntimeEventDecoder.decodeContextUsage(obj) {
            domain.contextUsage = usage
        }
        // completedTurns from snapshot when present as objects with turnId/state.
        var turns: [CompletedTurnRecord] = []
        for value in history.completedTurns {
            guard case .object(let obj) = value,
                  let turnId = obj["turnId"]?.stringValue ?? obj["id"]?.stringValue,
                  let state = obj["state"]?.stringValue
            else { continue }
            turns.append(CompletedTurnRecord(turnId: turnId, state: state))
        }
        if !turns.isEmpty {
            domain.completedTurns = turns
        }

        // Derive still-open requests from started/non-completed `pending_request` items
        // only when thread status requires approval/reply. Outer payload carries requestId;
        // use that (not item id), validate canonical inner payload, dedupe by requestId
        // preserving last write order (FIFO map overwrite).
        let status = history.thread.status
        if status == "needs_approval" || status == "needs_reply" {
            var ordered: [String: OpenRuntimeRequest] = [:]
            var order: [String] = []
            for item in history.runtimeItems {
                guard item.type == "pending_request", item.state != "completed" else { continue }
                guard let decoded = RuntimeEventDecoder.decodePendingRequestOuter(item.payload)
                else { continue }
                let request = OpenRuntimeRequest(
                    requestId: decoded.requestId,
                    threadId: history.thread.id,
                    requestType: decoded.requestType,
                    payload: decoded.payload,
                    receivedAt: Date()
                )
                if ordered[decoded.requestId] == nil {
                    order.append(decoded.requestId)
                }
                ordered[decoded.requestId] = request
            }
            domain.openRequests = order.compactMap { ordered[$0] }
        } else {
            domain.openRequests = []
        }
    }

    static func pruneTrailingInterruptedReasoning(from items: inout [PersistedRuntimeItem]) {
        var dropIds = Set<String>()
        var idx = items.count - 1
        while idx >= 0 {
            let item = items[idx]
            if item.type == "plan" || item.type == "error" || item.parentItemId != nil {
                idx -= 1
                continue
            }
            if item.type != "reasoning" { break }
            dropIds.insert(item.id)
            idx -= 1
        }
        if !dropIds.isEmpty {
            items.removeAll { dropIds.contains($0.id) }
        }
    }

    static func shouldRefreshShell(from supervisory: JSONValue) -> Bool {
        guard case .object(let object) = supervisory,
              let type = object["type"]?.stringValue
        else {
            return false
        }
        if isShellLifecycleType(type) {
            return true
        }
        let batches = collectRuntimeEvents(from: supervisory)
        for batch in batches {
            for event in batch.events {
                if isShellLifecycleType(event.type) {
                    return true
                }
            }
        }
        return false
    }

    static func shouldRefreshOpenThreadMetadata(from supervisory: JSONValue) -> Bool {
        guard case .object(let object) = supervisory,
              let type = object["type"]?.stringValue
        else {
            return false
        }
        if isOpenThreadMetadataType(type) {
            return true
        }
        let batches = collectRuntimeEvents(from: supervisory)
        for batch in batches {
            for event in batch.events {
                if isOpenThreadMetadataType(event.type) {
                    return true
                }
            }
        }
        return false
    }

    private static func isShellLifecycleType(_ type: String) -> Bool {
        if type == "remote-projects-changed"
            || type == "remote-threads-changed"
            || type == "thread-state" {
            return true
        }
        return type.hasPrefix("turn.") || type.hasPrefix("session.")
    }

    private static func isOpenThreadMetadataType(_ type: String) -> Bool {
        if type == "thread-state"
            || type.hasPrefix("turn.")
            || type.hasPrefix("session.") {
            return true
        }
        if type == "error" || type == "warning" || type.hasPrefix("request.") {
            return true
        }
        return false
    }

    private static func eventAffectsStructuralVersion(_ event: RuntimeEvent) -> Bool {
        switch event.type {
        case "item.started", "item.updated", "item.completed", "turn.completed", "error":
            return true
        default:
            return false
        }
    }

    // MARK: - Helpers

    private static func monotonicState(current: String, incoming: String) -> String {
        let currentRank = stateRank[current] ?? 0
        let incomingRank = stateRank[incoming] ?? 0
        if current == "completed" { return "completed" }
        return incomingRank >= currentRank ? incoming : current
    }

    /// Shallow-merge object payloads (TS `mergePayload`):
    /// - nil / JSON null / non-object `incoming` replaces entirely (including clear)
    /// - object+object: top-level keys from incoming replace; nested not recursive
    static func mergePayload(_ existing: JSONValue?, _ incoming: JSONValue?) -> JSONValue? {
        guard let incoming else { return nil }
        if case .null = incoming { return nil }
        guard case .object = incoming else { return incoming }
        guard let existing, case .object(let left) = existing,
              case .object(let right) = incoming
        else {
            return incoming
        }
        var merged = left
        for (key, value) in right {
            merged[key] = value
        }
        return .object(merged)
    }
}
