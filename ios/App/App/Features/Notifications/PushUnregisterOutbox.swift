import Foundation

/// Bounded dual-authority snapshot for one environment route.
///
/// The child grant travels as the entry's `accessToken`; this is the separate
/// parent bearer the proxy requires, captured from the parent record's vault
/// slot while it still existed. `endpoint` is the entry's own dispatch
/// endpoint (the child proxy), so the parent bearer is bound to exactly one
/// destination and can never be attached to another host. It lives inside the
/// same Keychain document as the child grant, bounded by the outbox expiry.
struct PushUnregisterParentAuthority: Codable, Sendable, Equatable {
  var endpoint: String
  var accessToken: String
}

actor PushUnregisterOutbox {
  static let shared = PushUnregisterOutbox()
  /// Same Keychain account across the document v1 → v2 upgrade so the
  /// migrated document replaces the v1 bytes in place. A v1-only reader sees
  /// an unsupported version and preserves the raw document instead of
  /// re-encoding it (which would erase parent authority) or dispatching then
  /// deleting an entry whose custody it cannot see.
  static let account = "push-unregister-outbox-v1"
  static let expiry: TimeInterval = 7 * 24 * 60 * 60

  struct Entry: Codable, Sendable, Equatable, Identifiable {
    var id: UUID
    var endpoint: String
    var accessToken: String
    var deviceId: String
    var route: PushRegistrationRoute
    var createdAt: Date
    /// Direct parent whose environment proxy this route belongs to. Optional:
    /// a nil value is an ordinary direct-host route (or an entry written
    /// before this field existed).
    var parentConnectionId: ClientConnectionID?
    /// Captured parent authority for an environment route. Optional: a nil
    /// value is a direct-host route (or a legacy pre-authority entry whose
    /// cleanup resolves the parent from the live catalog). The capture is
    /// only ever read or written under `Document.version` 2; a v1 reader
    /// refuses the whole document rather than re-encoding without it.
    var parentAuthority: PushUnregisterParentAuthority?

    /// True when this entry's dispatch travels through a parent proxy: a
    /// recorded environment route or a captured (possibly unbound) parent
    /// authority. Such cleanup is never concluded by an unprovable 401/403 —
    /// the protocol carries no trusted child-origin marker.
    var isEnvironmentBound: Bool {
      parentConnectionId != nil || parentAuthority != nil
    }

    /// The captured authority, honored only when it is internally consistent:
    /// an environment route (`parentConnectionId` set) whose recorded
    /// authority endpoint is this entry's own endpoint. A partial or
    /// mismatched capture is ignored rather than attached to another host.
    var validatedParentAuthority: PushUnregisterParentAuthority? {
      Self.validatedAuthority(
        parentAuthority,
        routeIsEnvironment: parentConnectionId != nil,
        entryEndpoint: endpoint
      )
    }

    /// One normalized rule for every reader and writer: both halves present,
    /// an environment route, and the recorded endpoint equal to the dispatch
    /// endpoint (trailing slashes ignored).
    static func validatedAuthority(
      _ authority: PushUnregisterParentAuthority?,
      routeIsEnvironment: Bool,
      entryEndpoint: String
    ) -> PushUnregisterParentAuthority? {
      guard let authority, routeIsEnvironment,
        !authority.endpoint.isEmpty, !authority.accessToken.isEmpty,
        endpointsMatch(authority.endpoint, entryEndpoint)
      else { return nil }
      return authority
    }

    static func endpointsMatch(_ lhs: String, _ rhs: String) -> Bool {
      trimTrailingSlashes(lhs) == trimTrailingSlashes(rhs)
    }

    private static func trimTrailingSlashes(_ value: String) -> String {
      var trimmed = value
      while trimmed.hasSuffix("/") { trimmed.removeLast() }
      return trimmed
    }
  }

  struct Document: Codable, Sendable, Equatable {
    /// Current document version. The v2 envelope carries
    /// `PushUnregisterParentAuthority` custody: a v1-only reader refuses the
    /// whole document and preserves the raw bytes, so it can never re-encode
    /// an entry without the capture or dispatch it and delete it as a "child"
    /// rejection.
    static let version = 2
    /// Pre-corrections document version, still read for a durable in-place
    /// migration. A v1 document may carry the additive parent-authority
    /// capture written by the unreleased v1 candidate; every endpoint-bound
    /// capture survives the upgrade unchanged.
    static let legacyVersion = 1
    var version: Int
    var entries: [Entry]

    static let empty = Document(version: version, entries: [])
  }

  private let io: any RawKeychainIO
  private let now: @Sendable () -> Date

  init(
    io: any RawKeychainIO = SystemKeychainIO(service: PushTokenVault.service),
    now: @escaping @Sendable () -> Date = Date.init
  ) {
    self.io = io
    self.now = now
  }

  func load() throws -> PushDocumentLoad<Document> {
    guard let raw = try io.load(account: Self.account) else { return .missing }
    guard let probe = try? JSONSerialization.jsonObject(with: raw) as? [String: Any],
      let version = probe["version"] as? Int,
      let document = try? decoder.decode(Document.self, from: raw)
    else { return .preservedInvalid(raw) }
    switch version {
    case Document.version:
      return .current(document)
    case Document.legacyVersion:
      // Upgrade in the same Keychain account before any caller relies on the
      // v2 custody semantics. A failed write leaves the v1 source untouched
      // and fails closed, so no dispatch or overwrite can follow an undurable
      // migration. Direct entries and their createdAt/expiry carry over
      // unchanged; an endpoint-bound v1 candidate capture is preserved.
      let upgraded = Document(version: Document.version, entries: document.entries)
      do {
        try save(upgraded)
      } catch {
        return .preservedInvalid(raw)
      }
      return .current(upgraded)
    default:
      return .preservedInvalid(raw)
    }
  }

  func enqueue(
    endpoint: String,
    accessToken: String,
    deviceId: String,
    route: PushRegistrationRoute,
    parentConnectionId: ClientConnectionID? = nil,
    parentAuthority: PushUnregisterParentAuthority? = nil
  ) throws -> Entry {
    var document = try currentDocument()
    let cutoff = now().addingTimeInterval(-Self.expiry)
    let entryCount = document.entries.count
    document.entries.removeAll { $0.createdAt < cutoff }
    // Never store a partial/mismatched capture: an unbound parent bearer is
    // dropped here, so no reader can attach it to a different endpoint.
    let authority = Entry.validatedAuthority(
      parentAuthority,
      routeIsEnvironment: parentConnectionId != nil,
      entryEndpoint: endpoint
    )
    if let index = document.entries.firstIndex(where: {
      $0.endpoint == endpoint && $0.accessToken == accessToken && $0.deviceId == deviceId
        && $0.route == route
    }) {
      // A retry can learn the parent (or its authority) for a route first
      // enqueued without one (older entry, or a pre-resolution failure).
      // Preserve the exact route and fill only the missing additive authority.
      var changed = false
      if document.entries[index].parentConnectionId == nil, let parentConnectionId {
        document.entries[index].parentConnectionId = parentConnectionId
        changed = true
      }
      if document.entries[index].parentAuthority == nil, let authority {
        document.entries[index].parentAuthority = authority
        changed = true
      }
      if changed || document.entries.count != entryCount {
        try save(document)
      }
      return document.entries[index]
    }
    let entry = Entry(
      id: UUID(),
      endpoint: endpoint,
      accessToken: accessToken,
      deviceId: deviceId,
      route: route,
      createdAt: now(),
      parentConnectionId: parentConnectionId,
      parentAuthority: authority
    )
    document.entries.append(entry)
    try save(document)
    return entry
  }

  func pending() throws -> [Entry] {
    var document = try currentDocument()
    let cutoff = now().addingTimeInterval(-Self.expiry)
    let filtered = document.entries.filter { $0.createdAt >= cutoff }
    if filtered != document.entries {
      document.entries = filtered
      try save(document)
    }
    return filtered
  }

  func remove(_ id: UUID) throws {
    var document = try currentDocument()
    document.entries.removeAll { $0.id == id }
    try save(document)
  }

  func rawDataForTests() throws -> Data? { try io.load(account: Self.account) }

  private func currentDocument() throws -> Document {
    switch try load() {
    case .missing: return .empty
    case .current(let document): return document
    case .preservedInvalid: throw PushStorageError.incompatible
    }
  }

  private func save(_ document: Document) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    encoder.dateEncodingStrategy = .iso8601
    try io.save(account: Self.account, data: encoder.encode(document))
  }

  private var decoder: JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return decoder
  }
}
