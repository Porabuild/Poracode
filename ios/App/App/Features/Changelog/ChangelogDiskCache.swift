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
  private struct Envelope: Codable {
    let formatVersion: Int
    let document: ChangelogDocument
  }
  private let storage: VersionedJSONCacheFile

  init(directory: URL = ChangelogDiskCache.defaultDirectory) {
    storage = VersionedJSONCacheFile(file: directory.appendingPathComponent("feed.json"),
      maximumBytes: ChangelogDocument.maximumBytes, formatVersion: Self.formatVersion)
  }

  func read() -> ChangelogDocument? {
    guard let data = storage.read(),
      let envelope = try? JSONDecoder().decode(Envelope.self, from: data),
      envelope.formatVersion == Self.formatVersion else { return nil }
    return envelope.document
  }

  func write(_ document: ChangelogDocument) {
    guard let data = try? JSONEncoder().encode(Envelope(formatVersion: Self.formatVersion, document: document)) else { return }
    storage.write(data)
  }
}
