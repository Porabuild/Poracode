import Foundation

/// Best-effort storage for disposable public JSON caches. The typed owner
/// validates its body; this shared layer bounds I/O and preserves newer files.
struct VersionedJSONCacheFile: Sendable {
  let file: URL
  let maximumBytes: Int
  let formatVersion: Int
  private struct Header: Decodable { let formatVersion: Int }

  func read() -> Data? {
    guard let size = try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber,
      size.intValue <= maximumBytes, let data = try? Data(contentsOf: file), data.count <= maximumBytes else { return nil }
    return data
  }

  func write(_ data: Data) {
    guard data.count <= maximumBytes,
      let next = try? JSONDecoder().decode(Header.self, from: data), next.formatVersion == formatVersion else { return }
    if FileManager.default.fileExists(atPath: file.path) {
      guard let previous = read(), let header = try? JSONDecoder().decode(Header.self, from: previous),
        header.formatVersion == formatVersion else { return }
    }
    do {
      try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
      try data.write(to: file, options: .atomic)
    } catch { /* A public cache must not fail a successful refresh. */ }
  }
}
