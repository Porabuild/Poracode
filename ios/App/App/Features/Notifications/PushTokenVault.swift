import Foundation

actor PushTokenVault {
  static let shared = PushTokenVault()
  static let service = "com.lightcodeapp.mobile.notifications"
  static let account = "push-token-vault-v1"

  struct ActivitySecret: Codable, Sendable, Equatable {
    var token: String
    var route: PushRegistrationRoute
  }

  struct Document: Codable, Sendable, Equatable {
    static let version = 1
    var version: Int
    var deviceId: String
    var apnsToken: String?
    var pushToStartToken: String?
    var activities: [String: ActivitySecret]

    static func fresh() -> Document {
      Document(
        version: version,
        deviceId: UUID().uuidString.lowercased(),
        apnsToken: nil,
        pushToStartToken: nil,
        activities: [:]
      )
    }
  }

  private let io: any RawKeychainIO

  init(io: any RawKeychainIO = SystemKeychainIO(service: service)) {
    self.io = io
  }

  func load() throws -> PushDocumentLoad<Document> {
    guard let raw = try io.load(account: Self.account) else { return .missing }
    guard let probe = try? JSONSerialization.jsonObject(with: raw) as? [String: Any],
      let version = probe["version"] as? Int,
      version == Document.version,
      let document = try? JSONDecoding.decoder.decode(Document.self, from: raw),
      UUID(uuidString: document.deviceId)?.uuidString.lowercased() == document.deviceId
    else { return .preservedInvalid(raw) }
    return .current(document)
  }

  func snapshotCreatingIfNeeded() throws -> Document {
    switch try load() {
    case .current(let document):
      return document
    case .missing:
      let document = Document.fresh()
      try save(document)
      return document
    case .preservedInvalid:
      throw PushStorageError.incompatible
    }
  }

  func storeAPNSToken(_ token: String) throws {
    try mutate { $0.apnsToken = token }
  }

  func storePushToStartToken(_ token: String) throws {
    try mutate { $0.pushToStartToken = token }
  }

  func storeActivityToken(_ token: String, activityId: String, route: PushRegistrationRoute) throws
  {
    try mutate { $0.activities[activityId] = ActivitySecret(token: token, route: route) }
  }

  func removeActivity(_ activityId: String) throws {
    try mutate { $0.activities.removeValue(forKey: activityId) }
  }

  func rawDataForTests() throws -> Data? {
    try io.load(account: Self.account)
  }

  private func mutate(_ body: (inout Document) -> Void) throws {
    var document = try snapshotCreatingIfNeeded()
    body(&document)
    try save(document)
  }

  private func save(_ document: Document) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    try io.save(account: Self.account, data: encoder.encode(document))
  }
}
