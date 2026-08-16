import Foundation

actor PushUnregisterOutbox {
  static let shared = PushUnregisterOutbox()
  static let account = "push-unregister-outbox-v1"
  static let expiry: TimeInterval = 7 * 24 * 60 * 60

  struct Entry: Codable, Sendable, Equatable, Identifiable {
    var id: UUID
    var endpoint: String
    var accessToken: String
    var deviceId: String
    var route: PushRegistrationRoute
    var createdAt: Date
  }

  struct Document: Codable, Sendable, Equatable {
    static let version = 1
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
      version == Document.version,
      let document = try? decoder.decode(Document.self, from: raw)
    else { return .preservedInvalid(raw) }
    return .current(document)
  }

  func enqueue(
    endpoint: String, accessToken: String, deviceId: String, route: PushRegistrationRoute
  ) throws -> Entry {
    var document = try currentDocument()
    let entry = Entry(
      id: UUID(),
      endpoint: endpoint,
      accessToken: accessToken,
      deviceId: deviceId,
      route: route,
      createdAt: now()
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
