import Foundation

/// Stable app-owned vocabulary for the B4 `reads=bounded-v1` capability bundle.
///
/// Nothing here re-implements the wire contract: requests are built and
/// responses are validated through the generated route codecs
/// (`RemoteBoundedContract`), and the host owns every phase/byte bound. This
/// file owns only the capability token, the client-side decision vocabulary,
/// the opaque cursor prefix rules, and the app-shaped page models decoded from
/// validated canonical JSON.
enum RemoteBoundedReads {
  /// Capability bundle echoed by declared hosts. Changing a bound, cursor
  /// payload or field meaning requires a new token (see the ratified design).
  static let capability = "bounded-v1"
  /// Per-request/upgrade B1 declaration value (`notices=v1`). Independent of
  /// `reads`: a legacy host serves notices-declared reads too.
  static let noticesDeclaration = "v1"
  /// Per-upgrade bounded catalog-change signal declaration
  /// (`catalogChanges=bounded-v1`); the host honors it only with
  /// `session:read`.
  static let catalogChangesDeclaration = "bounded-v1"
  /// Typed protocol-error code. Status 500 is deliberate: a declared-host
  /// violation must never be classified as a transport failure (which would
  /// paint the host offline) nor as a mutation ambiguity.
  static let protocolErrorCode = "bounded_read_protocol_error"
  static let routeUnavailableCode = "route_unavailable"
  /// Byte-accounting labels. `wire` is UTF-8 bytes of the serialized body;
  /// `decode` is `2 x serialized UTF-16 length` (the engine's raw charge).
  static let wireBudgetLabel = "utf8-serialized"
  static let decodeBudgetLabel = "utf16-code-units-x2"

  /// Declared client defaults (host clamps to its 32 MiB / 64 MiB caps).
  static let defaultMaxWireBytes = 32 * 1024 * 1024
  static let defaultMaxDecodeBytes = 64 * 1024 * 1024
  static let defaultThreadLimit = 100
  static let defaultProjectLimit = 50
  static let defaultInventoryLimit = 200
  static let defaultCompletedTurnsLimit = 200
  static let defaultHistoryItemsLimit = 500
  static let defaultTargetTimelineEntryCount = 40

  /// Bounded work per inventory/paint segment. A segment yields control back
  /// to the session (and the event loop) after this many pages.
  static let segmentPages = 128
  /// Confirmation batches are bounded by the route's own <=200 id scope.
  static let membershipBatchLimit = 200

  /// Host error codes that map onto a typed client violation.
  static let invalidThreadCursorCode = "invalid_thread_cursor"
  static let invalidProjectCursorCode = "invalid_project_cursor"
  static let invalidReadsCapabilityCode = "invalid_reads_capability"
}

// MARK: - Cursor prefixes

/// Opaque cursor prefixes. Prefixes are the only client-visible cursor
/// structure: payloads stay opaque except for the inventory `f` frontier
/// comparison the page-1 contract requires.
enum RemoteBoundedCursorPrefix {
  static let threadPaintManual = "tp1."
  static let threadPaintUpdated = "tu2."
  static let threadPaintCreated = "tc2."
  static let projectPaint = "pj1."
  static let threadInventory = "ti1."
  static let projectInventory = "pi1."
  static let completedTurn = "ct1."

  static func threadPaintPrefix(for order: RemoteBoundedPaintOrder) -> String {
    switch order {
    case .manual: return threadPaintManual
    case .updated: return threadPaintUpdated
    case .created: return threadPaintCreated
    }
  }

  static func hasPrefix(_ cursor: String, _ prefix: String) -> Bool {
    cursor.hasPrefix(prefix)
  }
}

enum RemoteBoundedPaintOrder: String, Sendable, CaseIterable {
  case manual
  case updated
  case created
}

enum RemoteBoundedReadMode: String, Sendable {
  case page
  case inventory
}

/// Decodes the inventory cursor payload just far enough to compare the page-1
/// frontier echo. Payload contents are otherwise opaque; a malformed payload
/// is a client-side cursor mismatch.
enum RemoteBoundedCursorPayload {
  struct InventoryCursor: Equatable, Sendable {
    var lastId: String
    var frontier: String
  }

  static func decodeInventory(_ cursor: String, prefix: String) -> InventoryCursor? {
    guard cursor.hasPrefix(prefix) else { return nil }
    let encoded = String(cursor.dropFirst(prefix.count))
    guard !encoded.isEmpty,
      encoded.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
    else { return nil }
    var base64 = encoded.replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    while base64.count % 4 != 0 { base64.append("=") }
    guard let data = Data(base64Encoded: base64),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let lastId = object["i"] as? String, !lastId.isEmpty,
      let frontier = object["f"] as? String, !frontier.isEmpty
    else { return nil }
    return InventoryCursor(lastId: lastId, frontier: frontier)
  }

  static func decodeCompletedTurnIndex(_ cursor: String) -> Int? {
    guard cursor.hasPrefix(RemoteBoundedCursorPrefix.completedTurn) else { return nil }
    let encoded = String(cursor.dropFirst(RemoteBoundedCursorPrefix.completedTurn.count))
    guard !encoded.isEmpty,
      encoded.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
    else { return nil }
    var base64 = encoded.replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    while base64.count % 4 != 0 { base64.append("=") }
    guard let data = Data(base64Encoded: base64),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let index = object["i"] as? Int, index >= 0
    else { return nil }
    return index
  }
}

// MARK: - Violations and errors

/// Typed client-side violations of a declared capability bundle. Every case is
/// user-visible through a localized message by the calling surface; none is a
/// silent downgrade.
enum RemoteBoundedReadViolation: String, Sendable, Equatable {
  /// A response echoed a `reads` value other than the requested bundle.
  case readsEchoMismatch = "reads_echo_mismatch"
  /// The strict bounded shape (cursor/frontier/field) failed validation.
  case boundedResponseInvalid = "bounded_response_invalid"
  /// Cursor prefix/order/mode mismatch (client preflight or host 400).
  case cursorMismatch = "cursor_mismatch"
  /// A declared-only route is missing (404 / `invalid_reads_capability`).
  case routeUnavailable = "route_unavailable"
  /// The membership answer referenced ids that were not requested exactly once.
  case membershipResponseInvalid = "membership_response_invalid"
}

struct RemoteBoundedReadProtocolError: LocalizedError, Sendable, Equatable {
  let violation: RemoteBoundedReadViolation
  /// Technical diagnostic for tests/logs. Never shown as user-facing copy:
  /// `errorDescription` is the localized presentation below, so a raw
  /// English detail cannot reach `globalError` or any banner.
  let detail: String
  let status: Int
  let code: String

  init(violation: RemoteBoundedReadViolation, detail: String) {
    self.violation = violation
    self.detail = detail
    self.status = 500
    self.code = RemoteBoundedReads.protocolErrorCode
  }

  /// Localized presentation of the closed violation vocabulary. The technical
  /// `detail` stays separate for diagnostics.
  var errorDescription: String? { violation.localizedMessage }

  var isRouteUnavailable: Bool { violation == .routeUnavailable }

  static func isValid(_ error: Error) -> Bool {
    error is RemoteBoundedReadProtocolError
  }
}

extension RemoteBoundedReadViolation {
  var localizationKey: String {
    "bounded_read_error_\(rawValue)"
  }

  var localizedMessage: String {
    NSLocalizedString(
      localizationKey,
      tableName: nil,
      bundle: .main,
      value: Self.englishFallback[rawValue] ?? "The desktop returned an unsupported response.",
      comment: "Bounded transcript read protocol error shown to the user"
    )
  }

  /// Source-locale fallback; every value is translated in the shipped
  /// `Localizable.xcstrings` catalogs.
  private static let englishFallback: [String: String] = [
    "reads_echo_mismatch":
      "The desktop responded with an unsupported transcript read capability. Reconnect and try again.",
    "bounded_response_invalid":
      "The desktop returned an invalid transcript response. Reconnect and try again.",
    "cursor_mismatch":
      "The transcript history position is no longer valid. Refresh the conversation and try again.",
    "route_unavailable":
      "This desktop does not support the requested transcript history feature.",
    "membership_response_invalid":
      "The desktop returned an invalid catalog response. Refresh and try again.",
  ]
}

/// First-response negotiation outcome. `legacy` is produced only when a
/// genuine older host omitted the `reads` echo; every other mismatch is a
/// `RemoteBoundedReadProtocolError`.
enum RemoteBoundedReadOutcome<Bounded: Sendable, Legacy: Sendable>: Sendable {
  case bounded(Bounded)
  case legacy(Legacy)
}

// MARK: - Page models

/// One bounded shell-snapshot page. `reads` is the validated echo; both
/// cursors are required by the shared schema (nullable at end of walk).
struct RemoteBoundedShellPage: Sendable, Equatable {
  var snapshotSeq: Int
  var projects: [RemoteProject]
  var threads: [RemoteThread]
  var runtimeSummariesByThread: [String: RemoteRuntimeSummary]
  var threadsNextCursor: String?
  var projectsNextCursor: String?
  var gitSummariesByThread: JSONValue?
  var gitState: JSONValue?
  var updatedAt: String

  /// Projects the page into the app-owned shell snapshot the session commits.
  /// The bounded carries stay on the snapshot so the catalog can record the
  /// page-1 cursors without re-reading the wire.
  func asShellSnapshot() -> RemoteShellSnapshot {
    RemoteShellSnapshot(
      snapshotSeq: snapshotSeq,
      projects: projects,
      threads: threads,
      runtimeSummariesByThread: runtimeSummariesByThread,
      updatedAt: updatedAt,
      gitSummariesByThread: gitSummariesByThread,
      gitState: gitState,
      reads: RemoteBoundedReads.capability,
      threadsNextCursor: threadsNextCursor,
      projectsNextCursor: projectsNextCursor
    )
  }
}

/// One bounded `thread-list` page (paint or inventory).
struct RemoteBoundedThreadPage: Sendable, Equatable {
  var threads: [RemoteThread]
  var nextCursor: String?
  var inventoryFrontier: String?
  var gitSummariesByThread: JSONValue?
}

/// One bounded `project-list` page (paint or inventory).
struct RemoteBoundedProjectPage: Sendable, Equatable {
  var projects: [RemoteProject]
  var projectsNextCursor: String?
  var inventoryFrontier: String?
}

/// Authoritative membership answer for one bounded id batch.
struct RemoteBoundedCatalogMembership: Sendable, Equatable {
  var existingThreadIds: Set<String>
  var existingProjectIds: Set<String>
}

/// One persisted completed turn as the bounded routes carry it.
struct RemoteBoundedCompletedTurn: Sendable, Equatable, Hashable {
  var startedAt: String
  var endedAt: String
  var anchorItemId: String?
}

/// One bounded `thread-turns` page (ascending `idx`, anchorless included).
struct RemoteBoundedTurnsPage: Sendable, Equatable {
  var turns: [RemoteBoundedCompletedTurn]
  var completedTurnsNextCursor: String?
}

/// A bounded history tail: the existing thread snapshot plus the completion
/// continuation cursor for older turns.
struct RemoteBoundedHistoryPage: Sendable, Equatable {
  var snapshot: RemoteThreadSnapshot
  var completedTurnsNextCursor: String?
}

/// A bounded runtime-items page plus the validated echo.
struct RemoteBoundedHistoryItemsPage: Sendable, Equatable {
  var page: RemoteRuntimeItemsPage
}
