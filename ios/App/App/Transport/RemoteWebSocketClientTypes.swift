import Foundation

/// Callbacks for the remote event stream. Implementors should hop to the main actor as needed.
///
/// Not Sendable: held weakly by the socket actor and only invoked via `await` so the
/// implementor (AppSession on MainActor) can re-enter its isolation domain.
@preconcurrency
protocol RemoteWebSocketClientDelegate: AnyObject {
    func webSocket(_ client: RemoteWebSocketClient, didChange state: RemoteWebSocketClient.ConnectionState) async
    func webSocket(_ client: RemoteWebSocketClient, didReceive message: RemoteWebSocketServerMessage) async
    /// Applies one contiguous sequenced event. Returning `false` **rejects** the
    /// frame: state must be left untouched and the applied cursor must not advance.
    /// Used for malformed known events and for frames the session is gating.
    func webSocket(
        _ client: RemoteWebSocketClient,
        applyEventAt seq: Int,
        event: JSONValue
    ) async -> Bool
    func webSocketNeedsResync(_ client: RemoteWebSocketClient, reason: String) async
    func webSocketSessionExpired(_ client: RemoteWebSocketClient, reason: String) async
}

/// Default keeps delegates that only observe frames source-compatible: they
/// accept every contiguous event.
extension RemoteWebSocketClientDelegate {
    func webSocket(
        _ client: RemoteWebSocketClient,
        applyEventAt seq: Int,
        event: JSONValue
    ) async -> Bool {
        await webSocket(client, didReceive: .event(seq: seq, event: event))
        return true
    }
}

extension RemoteWebSocketClient {
    enum ConnectionState: Sendable, Equatable {
        case idle
        case connecting
        case online
        case reconnecting
        case suspended
        case failed(String)
    }
}
