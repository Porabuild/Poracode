import Foundation

actor PushClientStateStore {
  struct HostState: Codable, Sendable, Equatable {
    var capabilityVersions: [Int]
    var deviceTokenFingerprint: String?
    var pushToStartFingerprint: String?
    var activityTokenFingerprints: [String: String]
    var lastRegisteredAt: Date?

    static let empty = HostState(
      capabilityVersions: [],
      deviceTokenFingerprint: nil,
      pushToStartFingerprint: nil,
      activityTokenFingerprints: [:],
      lastRegisteredAt: nil
    )
  }

  struct Document: Codable, Sendable, Equatable {
    static let version = 1
    var version: Int
    var hosts: [String: HostState]

    static let empty = Document(version: version, hosts: [:])
  }

  static let shared: PushClientStateStore = {
    do {
      return PushClientStateStore(directory: try productionDirectory())
    } catch {
      return PushClientStateStore(unavailable: ())
    }
  }()

  private let url: URL?
  private let files: AtomicFileStore

  init(directory: URL, files: AtomicFileStore = AtomicFileStore()) {
    url = directory.appendingPathComponent("push-client-state-v1.json")
    self.files = files
  }

  private init(unavailable: Void, files: AtomicFileStore = AtomicFileStore()) {
    url = nil
    self.files = files
  }

  static func productionDirectory() throws -> URL {
    let support = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    return support.appendingPathComponent("Poracode/notifications", isDirectory: true)
  }

  func load() throws -> PushDocumentLoad<Document> {
    guard let url else { throw PushStorageError.unavailable }
    guard let raw = try files.read(at: url) else { return .missing }
    guard let probe = try? JSONSerialization.jsonObject(with: raw) as? [String: Any],
      let version = probe["version"] as? Int,
      version == Document.version,
      let document = try? decoder.decode(Document.self, from: raw)
    else { return .preservedInvalid(raw) }
    return .current(document)
  }

  func host(_ connectionId: ClientConnectionID) throws -> HostState {
    let document = try currentDocument()
    return document.hosts[connectionId.rawValue] ?? .empty
  }

  func updateHost(_ connectionId: ClientConnectionID, _ body: (inout HostState) -> Void) throws {
    var document = try currentDocument()
    var host = document.hosts[connectionId.rawValue] ?? .empty
    body(&host)
    document.hosts[connectionId.rawValue] = host
    try save(document)
  }

  func removeHost(_ connectionId: ClientConnectionID) throws {
    var document = try currentDocument()
    document.hosts.removeValue(forKey: connectionId.rawValue)
    try save(document)
  }

  func rawDataForTests() throws -> Data? {
    guard let url else { throw PushStorageError.unavailable }
    return try files.read(at: url)
  }

  private func currentDocument() throws -> Document {
    switch try load() {
    case .missing: return .empty
    case .current(let document): return document
    case .preservedInvalid: throw PushStorageError.incompatible
    }
  }

  private func save(_ document: Document) throws {
    guard let url else { throw PushStorageError.unavailable }
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    encoder.dateEncodingStrategy = .iso8601
    try files.replace(with: encoder.encode(document), at: url)
  }

  private var decoder: JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return decoder
  }
}
