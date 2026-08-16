import Foundation

/// Full-jitter exponential reconnect backoff matching `src/shared/remote/backoff.ts`.
struct ReconnectBackoff: Sendable {
    private(set) var attempt: Int = 0
    var baseMs: Double
    var maxMs: Double

    init(
        baseMs: Double = RemoteSocketPolicy.reconnectBaseMs,
        maxMs: Double = RemoteSocketPolicy.reconnectMaxMs
    ) {
        self.baseMs = baseMs
        self.maxMs = maxMs
    }

    mutating func nextDelay() -> Duration {
        let ceiling = min(maxMs, baseMs * pow(2.0, Double(attempt)))
        let delayMs = ceiling / 2 + Double.random(in: 0 ..< max(ceiling / 2, 0.000_001))
        attempt += 1
        return .milliseconds(Int64(delayMs.rounded()))
    }

    mutating func reset() {
        attempt = 0
    }
}
