import Foundation

/// Pure client-frame minting for the event-stream socket.
///
/// Extracted so the socket actor holds only connection lifecycle state; every
/// frame is still canonicalized through the generated client union.
enum RemoteSocketFrames {
    static func pingText(id: String, sentAt: Date) -> String? {
        let payload: [String: Any] = [
            "type": "ping",
            "id": id,
            "sentAt": sentAt.timeIntervalSince1970 * 1000,
        ]
        guard let raw = try? JSONSerialization.data(withJSONObject: payload),
              let data = try? GeneratedRemoteV3Contract.clientWebSocketMessage(raw),
              let text = String(data: data, encoding: .utf8)
        else { return nil }
        return text
    }

    static func closeCodeNumber(_ code: URLSessionWebSocketTask.CloseCode) -> Int {
        Int(code.rawValue)
    }
}
