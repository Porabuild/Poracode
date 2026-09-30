import Foundation

/// Transcript text extraction for persisted runtime items.
/// Prefers canonical stream buckets, then payload content blocks.
enum TranscriptText {
    /// Canonical stream keys used by the desktop runtime reducer.
    static let preferredStreamKeys: [String] = [
        "assistant_text",
        "reasoning_text",
        "plan_text",
        "command_output",
        "file_change_output",
        // Legacy / fallback buckets still seen on older snapshots.
        "output",
        "text",
        "content",
    ]

    static func displayText(for item: PersistedRuntimeItem) -> String {
        for key in preferredStreamKeys {
            if let value = item.streams[key], !value.isEmpty {
                return value
            }
        }

        if let payload = item.payload {
            if let text = payload["text"]?.stringValue, !text.isEmpty {
                return text
            }
            if let content = payload["content"] {
                if let text = content.stringValue, !text.isEmpty {
                    return text
                }
                if case .array(let blocks) = content {
                    let joined = blocks.compactMap(textBlockString).joined()
                    if !joined.isEmpty { return joined }
                }
            }
            if let message = payload["message"]?.stringValue, !message.isEmpty {
                return message
            }
        }

        return "[\(item.type)]"
    }

    private static func textBlockString(_ value: JSONValue) -> String? {
        guard case .object(let object) = value else {
            return value.stringValue
        }
        // { kind: "text", text: "…" } and similar shapes.
        if let text = object["text"]?.stringValue, !text.isEmpty {
            return text
        }
        if let text = object["content"]?.stringValue, !text.isEmpty {
            return text
        }
        return nil
    }
}
