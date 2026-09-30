// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.
// Pairing state machine rendered from the declarative spec in
// src/shared/remote/contract/pairingMachineSpec.ts (spec version 1).
import CryptoKit
import Foundation

/// Session pairing phases. Superset of every native UI phase enum; platforms
/// map their own phase type to these values at the call boundary.
public enum RemotePairingPhase: String, CaseIterable, Sendable {
  case launching
  case needsPairing
  case reconnectingStored
  case connecting
  case ready
  case sessionExpired
  case protocolIncompatible
  case localStoreInconsistent
}

public enum RemotePairingCandidateDecision: Sendable, Equatable {
  case proceed
  case ignoreDuplicate
}

struct RemotePairingPhaseRule {
  let from: Set<RemotePairingPhase>
  let requiresRetainedCredential: Bool
  /// nil keeps the previous phase: a failed pair must not regress a valid session.
  let target: RemotePairingPhase?
}

/// One-time pairing candidate resolved from a deep link, held only until
/// confirm / cancel. The credential is never logged and never persisted.
public struct RemotePairingPending: Sendable, Equatable {
  public let endpoint: String
  public let hostDisplay: String
  public let credential: String
  public let digest: String
  public let isCleartextLan: Bool
  public let replacesExistingPair: Bool
  public init(endpoint: String, hostDisplay: String, credential: String, digest: String, isCleartextLan: Bool, replacesExistingPair: Bool) { self.endpoint = endpoint; self.hostDisplay = hostDisplay; self.credential = credential; self.digest = digest; self.isCleartextLan = isCleartextLan; self.replacesExistingPair = replacesExistingPair }
  /// UI-safe view — never exposes the credential.
  public var sanitizedDescription: String { isCleartextLan ? "\(hostDisplay) (plain HTTP)" : hostDisplay }
}

public enum RemotePairingDeepLinkDecision: Sendable, Equatable {
  /// Malformed / incomplete / duplicate fingerprint — leave the session alone.
  case ignore
  /// Enter pending confirmation (show the sanitized host only).
  case pending(RemotePairingPending)
}

/// Process-lifetime one-shot candidate tracker over non-secret digests.
public struct RemotePairingCandidateTracker: Sendable, Equatable {
  public private(set) var inFlightDigest: String?
  public private(set) var lastSucceededDigest: String?
  public init(inFlightDigest: String? = nil, lastSucceededDigest: String? = nil) { self.inFlightDigest = inFlightDigest; self.lastSucceededDigest = lastSucceededDigest }

  public func decide(digest: String) -> RemotePairingCandidateDecision {
    if digest == inFlightDigest || digest == lastSucceededDigest { return .ignoreDuplicate }
    return .proceed
  }
  public mutating func markInFlight(_ digest: String) { inFlightDigest = digest }
  public mutating func markSucceeded(_ digest: String) { lastSucceededDigest = digest; if inFlightDigest == digest { inFlightDigest = nil } }
  /// Failure releases in-flight so a network retry of the same candidate can
  /// proceed; success is not recorded (a fresh deliberate token still works).
  public mutating func markFailed(_ digest: String) { if inFlightDigest == digest { inFlightDigest = nil } }
  public mutating func reset() { inFlightDigest = nil; lastSucceededDigest = nil }
}

/// THE pairing state machine, generated from one spec shared with Kotlin and
/// the TS contract tests. Guards and transitions only — transport, durable
/// stores, and UI stay in the app-owned coordinators that consume this API.
public enum RemotePairingMachine {
  /// Ordered first-match failure-recovery rules (spec `phaseAfterFailure`).
  static let phaseRules: [RemotePairingPhaseRule] = [
    RemotePairingPhaseRule(from: [.launching, .needsPairing, .reconnectingStored, .connecting, .ready, .sessionExpired, .protocolIncompatible, .localStoreInconsistent], requiresRetainedCredential: false, target: .needsPairing),
    RemotePairingPhaseRule(from: [.ready, .sessionExpired, .reconnectingStored, .protocolIncompatible, .localStoreInconsistent], requiresRetainedCredential: true, target: nil),
    RemotePairingPhaseRule(from: [.connecting], requiresRetainedCredential: true, target: .ready),
    RemotePairingPhaseRule(from: [.launching, .needsPairing], requiresRetainedCredential: true, target: .needsPairing),
  ]

  public static func phaseAfterPairingFailure(previous: RemotePairingPhase, hasRetainedCredential: Bool) -> RemotePairingPhase {
    for rule in phaseRules where rule.requiresRetainedCredential == hasRetainedCredential && rule.from.contains(previous) {
      return rule.target ?? previous
    }
    return previous
  }

  // MARK: Scope-request guard (refuse-before-consuming-credential)

  /// Canonical order; the request intersects into THIS order, never the
  /// advertised order. Unknown advertised scopes are dropped, never fatal.
  public static let standardScopes: [String] = [
        "session:read",
        "session:operate",
        "terminal:read",
        "terminal:operate",
        "requests:resolve",
        "projects:manage",
        "ports:forward",
  ]
  public static let operatorPresetScopes: [String] = [
        "session:read",
        "session:operate",
        "terminal:read",
        "terminal:operate",
        "requests:resolve",
        "projects:manage",
        "ports:forward",
  ]
  public static let viewerPresetScopes: [String] = [
        "session:read",
        "terminal:read",
  ]

  public static func filterKnownScopes(_ scopes: [String]) -> [String] { scopes.filter { standardScopes.contains($0) } }
  public static func isKnownScope(_ scope: String) -> Bool { standardScopes.contains(scope) }
  /// Empty result means refuse before consuming the one-time credential —
  /// never silently escalate to the full standard set.
  public static func scopesToRequest(_ advertised: [String]) -> [String] { let known = Set(filterKnownScopes(advertised)); if known.isEmpty { return [] }; return standardScopes.filter { known.contains($0) } }
  public static func hasNoKnownAdvertisedScopes(_ advertised: [String]) -> Bool { filterKnownScopes(advertised).isEmpty }
  public static func canReadScopes(_ scopes: [String]) -> Bool { filterKnownScopes(scopes).contains("session:read") }
  public static func canOperateScopes(_ scopes: [String]) -> Bool { filterKnownScopes(scopes).contains("session:operate") }

  // MARK: Candidate fingerprint + duplicate policies

  /// Non-secret digest of endpoint + credential material
  /// (spec: sha256 hex-lowercase).
  public static func fingerprint(endpoint: String, credential: String) -> String {
    let material = Data("\(endpoint)\u{1}\(credential)".utf8)
    return SHA256.hash(data: material).map { String(format: "%02x", $0) }.joined()
  }

  /// Policy `consumedSet`: process-lifetime set of applied fingerprints.
  public static func shouldSkipDuplicateFingerprint(_ fingerprint: String, seen: Set<String>) -> Bool { !fingerprint.isEmpty && seen.contains(fingerprint) }
  public static func afterFingerprintConsumed(_ fingerprint: String, seen: Set<String>) -> Set<String> { fingerprint.isEmpty ? seen : seen.union([fingerprint]) }

  // MARK: Deep-link intent

  /// One-shot extraction from intent data; callers must clear Intent data (or
  /// the platform equivalent) after extraction so rotation cannot re-redeem.
  public static func extractPairingData(_ dataString: String?) -> String? {
    guard let raw = dataString else { return nil }
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  /// An externally delivered link always requires explicit sanitized-host
  /// confirmation; it can never silently replace an existing pair.
  public static func requiresBrowsableConfirmation(fromBrowsableIntent: Bool) -> Bool { fromBrowsableIntent }

  static let maxHostDisplayCharacters: Int = 80

  /// UI-safe host label: authority `host[:port]`, or a fragment/query-stripped
  /// length-bounded fallback. Never includes a credential.
  public static func sanitizedHostLabel(endpoint: String) -> String {
    let trimmed = endpoint.trimmingCharacters(in: .whitespacesAndNewlines)
    if let url = URL(string: trimmed), let host = url.host, !host.isEmpty {
      if let port = url.port { return "\(host):\(port)" }
      return host
    }
    let withoutFragment = trimmed.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? trimmed
    let withoutQuery = withoutFragment.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? withoutFragment
    let candidate = withoutQuery.isEmpty ? trimmed : withoutQuery
    return String(candidate.prefix(maxHostDisplayCharacters))
  }

  /// An `http:` endpoint on a non-loopback host.
  public static func isCleartextLanEndpoint(_ endpoint: String) -> Bool {
    guard let url = URL(string: endpoint), url.scheme?.lowercased() == "http", let host = url.host?.lowercased() else { return false }
    return !isLoopbackHostname(host)
  }

  public static func isLoopbackHostname(_ hostname: String) -> Bool {
    let host = hostname.lowercased()
    return host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]" || host.hasSuffix(".localhost")
  }

  /// Decide a resolved candidate without starting a network pair. Malformed
  /// resolution and duplicate fingerprints are no-ops.
  public static func decideDeepLink(
    endpoint: String?,
    credential: String?,
    tracker: RemotePairingCandidateTracker,
    hasExistingPair: Bool
  ) -> RemotePairingDeepLinkDecision {
    guard let endpoint, let credential, !endpoint.isEmpty, !credential.isEmpty else { return .ignore }
    let digest = fingerprint(endpoint: endpoint, credential: credential)
    var trackerCopy = tracker
    guard trackerCopy.decide(digest: digest) == .proceed else { return .ignore }
    return .pending(
      RemotePairingPending(
        endpoint: endpoint,
        hostDisplay: sanitizedHostLabel(endpoint: endpoint),
        credential: credential,
        digest: digest,
        isCleartextLan: isCleartextLanEndpoint(endpoint),
        replacesExistingPair: hasExistingPair
      )
    )
  }
}
