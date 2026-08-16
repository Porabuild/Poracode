import Foundation

// Harness-only. The feature depends on `ProjectLocation`, which lives in a
// model file that also carries an unrelated JSON helper referencing the app's
// networking error type. This shim satisfies that single reference so the
// isolated package can compile the real feature sources without pulling in the
// app's transport graph. Nothing in the feature calls it.
struct RemoteClientError: Error, Equatable, Sendable {
  let message: String

  static func invalidResponse(_ message: String) -> RemoteClientError {
    RemoteClientError(message: message)
  }
}
