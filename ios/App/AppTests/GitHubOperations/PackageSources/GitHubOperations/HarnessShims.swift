import Foundation

// Harness-only mirror of `ios/App/App/Protocol/ProtocolConstants.swift`. The
// portable core compiles without the app's protocol graph, but the symlinked
// feature contract compares the generated bindings metadata against this
// value, so it must move together with the app constant on every protocol
// bump (a stale value fails this package's contract tests).
enum ProtocolConstants {
  static let remoteProtocolVersion = 9
}
