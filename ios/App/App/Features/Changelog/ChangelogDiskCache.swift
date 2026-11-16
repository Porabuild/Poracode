import Foundation

protocol ChangelogCaching: Sendable {
  func read() async -> ChangelogDocument?
  func write(_ document: ChangelogDocument) async
}

/// First native cache of the unchanged public feed. It contains no host state
/// or credentials. Unknown future envelopes are preserved and never rewritten.
actor ChangelogDiskCache: ChangelogCaching {
  nonisolated static let formatVersion = 1
  nonisolated static let defaultDirectory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("PoracodeChangelog")
  private struct Header: Decodable { let formatVersion: Int }
  private struct Envelope: Codable {
    let formatVersion: Int
    let document: ChangelogDocument
  }
  private let directory: URL
  private var file: URL { directory.appendingPathComponent("feed.json") }

  init(directory: URL = ChangelogDiskCache.defaultDirectory) { self.directory = directory }

  func read() -> ChangelogDocument? {
    guard let data = boundedData(),
      let envelope = try? JSONDecoder().decode(Envelope.self, from: data),
      envelope.formatVersion == Self.formatVersion else { return nil }
    return envelope.document
  }

  func write(_ document: ChangelogDocument) {
    if FileManager.default.fileExists(atPath: file.path) {
      guard let data = boundedData(), let header = try? JSONDecoder().decode(Header.self, from: data),
        header.formatVersion == Self.formatVersion else { return }
    }
    guard let data = try? JSONEncoder().encode(Envelope(formatVersion: Self.formatVersion, document: document)),
      data.count <= ChangelogDocument.maximumBytes else { return }
    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      try data.write(to: file, options: .atomic)
    } catch { /* A disposable public cache must not fail a successful refresh. */ }
  }

  private func boundedData() -> Data? {
    guard let size = try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber,
      size.intValue <= ChangelogDocument.maximumBytes else { return nil }
    return try? Data(contentsOf: file)
  }
}
