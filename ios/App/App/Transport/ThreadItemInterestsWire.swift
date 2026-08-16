import Foundation

/// Pure helpers for thread-item-interests wire payloads (testable without a live socket).
enum ThreadItemInterestsWire {
    /// Canonical sorted unique thread ids for the wire.
    static func normalized(_ threadIds: [String]) -> [String] {
        Array(Set(threadIds)).sorted()
    }

    /// JSON object sent on the socket (and mirrored in the connect URL query when present).
    static func payload(threadIds: [String]) -> [String: Any] {
        [
            "type": "thread-item-interests",
            "threadIds": normalized(threadIds),
        ]
    }

    static func jsonText(threadIds: [String]) -> String? {
        let object = payload(threadIds: threadIds)
        guard let raw = try? JSONSerialization.data(withJSONObject: object),
              let data = try? GeneratedRemoteV3Contract.clientWebSocketMessage(raw),
              let text = String(data: data, encoding: .utf8)
        else { return nil }
        return text
    }
}
