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
    /// The applied cursor was replaced under a different event-stream epoch
    /// (`eventEpoch=v1`); reported before the frame that caused it, so cursor
    /// copies replace both values instead of mixing two server instances.
    func webSocket(
        _ client: RemoteWebSocketClient,
        didBindEventEpoch epoch: String?,
        appliedSeq: Int
    ) async
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

    /// Delegates that keep no cursor copy ignore epoch bindings.
    func webSocket(_: RemoteWebSocketClient, didBindEventEpoch _: String?, appliedSeq _: Int) async {}
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

/// Pure connection-state transition rules shared by `RemoteWebSocketClient` and tests.
enum RemoteSocketStatePolicy {
    /// Failure before the `ready` frame reports `.failed(reason)` (Offline);
    /// only a connection that had reached `ready` reports `.reconnecting`.
    static func stateAfterFailure(
        wasReady: Bool,
        reason: String
    ) -> RemoteWebSocketClient.ConnectionState {
        wasReady ? .reconnecting : .failed(reason)
    }

    /// Automatic retries of a `.failed` host keep reporting Offline instead of
    /// flipping back to `.connecting` or `.reconnecting` (including session-expired
    /// retries).
    static func shouldPublishConnecting(
        last: RemoteWebSocketClient.ConnectionState?
    ) -> Bool {
        if case .failed = last { return false }
        return true
    }

    /// State published at the start of a connect attempt, or `nil` when the
    /// existing `.failed` state should stay visible until readiness or failure.
    static func initialStateForAttempt(
        last: RemoteWebSocketClient.ConnectionState?,
        sessionExpired: Bool
    ) -> RemoteWebSocketClient.ConnectionState? {
        guard shouldPublishConnecting(last: last) else {
            return nil
        }
        return sessionExpired ? .reconnecting : .connecting
    }

    /// Baseline `lastPublishedState` restored on `resumeFromForeground()`.
    /// Preserves `.failed` across background suspension so an unreachable host
    /// stays Offline instead of flipping to `.connecting` for the connect timeout.
    static func stateAfterResume(
        failedBeforeSuspend: Bool
    ) -> RemoteWebSocketClient.ConnectionState? {
        failedBeforeSuspend ? .failed("offline before suspend") : nil
    }
}
