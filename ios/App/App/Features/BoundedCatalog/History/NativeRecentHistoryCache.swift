import CryptoKit
import Foundation

/// First native cache format. Versioned, bounded private tails are disposable;
/// unknown future records are retained, never rewritten by an older app.
actor NativeRecentHistoryCache {
  static let shared = NativeRecentHistoryCache()
  static let formatVersion = 1
  static let maximumTailBytes = 2 * 1_024 * 1_024
  static let maximumTotalBytes = 8 * maximumTailBytes
  static let maximumEntries = 20
  nonisolated static let defaultDirectory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("PoracodeRecentHistory-v1", isDirectory: true)

  private struct Record: Codable {
    let formatVersion: Int
    let namespace: String
    let threadID: String
    let bytes: Int
    let tail: NativeRecentHistoryTail
    var touched: Date
  }
  private struct Header: Decodable { let formatVersion: Int }
  private let directory: URL
  private var memory: [String: Record] = [:]
  private var generation: UInt64 = 0
  private var pendingWrites: [String: Record] = [:]
  private var writer: Task<Void, Never>?
  /// Accounting for regression and performance evidence, not cache authority.
  private(set) var diskWriteCount = 0
  private(set) var diskBytesWritten = 0

  struct Candidate: Sendable {
    let generation: UInt64
    let tail: NativeRecentHistoryTail?
  }

  init(directory: URL = NativeRecentHistoryCache.defaultDirectory) { self.directory = directory }

  func candidate(namespace: String, threadID: String) -> Candidate {
    .init(generation: generation, tail: read(namespace: namespace, threadID: threadID))
  }

  nonisolated static func digest(_ components: [String]) -> String {
    let data = (try? JSONEncoder().encode(components)) ?? Data()
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  func read(namespace: String, threadID: String) -> NativeRecentHistoryTail? {
    let key = Self.digest([namespace, threadID])
    if var record = memory[key] {
      record.touched = Date(); memory[key] = record
      try? FileManager.default.setAttributes([.modificationDate: record.touched], ofItemAtPath: file(key).path)
      return record.tail
    }
    let file = file(key)
    guard let data = readData(file),
      let record = try? JSONDecoder().decode(Record.self, from: data), record.formatVersion == Self.formatVersion,
      record.namespace == namespace, record.threadID == threadID, record.tail.isValid,
      let encoded = try? Self.encode(record.tail), encoded.count == record.bytes,
      record.bytes <= Self.maximumTailBytes else { return nil }
    var touched = record; touched.touched = Date(); memory[key] = touched
    trimMemory()
    try? FileManager.default.setAttributes([.modificationDate: touched.touched], ofItemAtPath: file.path)
    return record.tail
  }

  func store(_ tail: NativeRecentHistoryTail, namespace: String, threadID: String, generation expectedGeneration: UInt64? = nil) {
    guard let record = admit(tail, namespace: namespace, threadID: threadID, generation: expectedGeneration) else { return }
    write(record)
  }

  /// Publishing an accepted tail does not wait for disk. Pending writes share
  /// the same count/byte bound as memory and coalesce by authority/thread.
  func enqueue(_ tail: NativeRecentHistoryTail, namespace: String, threadID: String, generation expectedGeneration: UInt64?) {
    guard let record = admit(tail, namespace: namespace, threadID: threadID, generation: expectedGeneration) else { return }
    let key = Self.digest([namespace, threadID])
    pendingWrites[key] = record
    pendingWrites = pendingWrites.filter { memory[$0.key] != nil }
    guard writer == nil else { return }
    let owner = generation
    writer = Task(priority: .utility) { [weak self] in
      guard let self else { return }
      await self.drainWrites(generation: owner)
    }
  }

  func flushPendingWrites() async { await writer?.value }

  private func admit(_ tail: NativeRecentHistoryTail, namespace: String, threadID: String, generation expectedGeneration: UInt64?) -> Record? {
    guard !Task.isCancelled, expectedGeneration.map({ $0 == generation }) ?? true else { return nil }
    let key = Self.digest([namespace, threadID]), target = file(key)
    guard tail.isValid, !tail.exceedsStringByteBudget(Self.maximumTailBytes),
      let payload = try? Self.encode(tail), payload.count <= Self.maximumTailBytes else {
      memory.removeValue(forKey: key)
      pendingWrites.removeValue(forKey: key)
      removeKnownFile(target)
      return nil
    }
    let record = Record(formatVersion: Self.formatVersion, namespace: namespace, threadID: threadID,
      bytes: payload.count, tail: tail, touched: Date())
    guard !Task.isCancelled else { return nil }
    memory[key] = record; trimMemory()
    return record
  }

  private func drainWrites(generation owner: UInt64) async {
    while owner == generation, !Task.isCancelled,
      let next = pendingWrites.min(by: { $0.value.touched < $1.value.touched }) {
      pendingWrites.removeValue(forKey: next.key)
      write(next.value)
      await Task.yield()
    }
    if owner == generation { writer = nil }
  }

  private func write(_ record: Record) {
    let target = file(Self.digest([record.namespace, record.threadID]))
    if FileManager.default.fileExists(atPath: target.path) {
      guard let existing = readData(target),
        let header = try? JSONDecoder().decode(Header.self, from: existing), header.formatVersion == Self.formatVersion else { return }
    }
    guard let data = try? Self.encode(record) else { return }
    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
        attributes: [.posixPermissions: 0o700])
      try data.write(to: target, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      diskWriteCount += 1; diskBytesWritten += data.count
      try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: target.path)
      pruneDisk(excluding: target)
    } catch { /* A derived cache cannot turn an authoritative read into failure. */ }
  }

  func purgeAll() {
    generation &+= 1
    memory.removeAll()
    pendingWrites.removeAll(); writer?.cancel(); writer = nil
    try? FileManager.default.removeItem(at: directory)
  }

  private func trimMemory() {
    var bytes = memory.values.reduce(0) { $0 + $1.bytes }
    for (key, record) in memory.sorted(by: { $0.value.touched < $1.value.touched }) {
      guard memory.count > Self.maximumEntries || bytes > Self.maximumTotalBytes else { break }
      memory.removeValue(forKey: key); bytes -= record.bytes
    }
    pendingWrites = pendingWrites.filter { memory[$0.key] != nil }
  }

  private func file(_ key: String) -> URL { directory.appendingPathComponent(key + ".json") }
  private func readData(_ file: URL) -> Data? {
    guard let size = try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber,
      size.intValue <= Self.maximumTailBytes + 4_096 else { return nil }
    return try? Data(contentsOf: file)
  }
  private func removeKnownFile(_ file: URL) {
    guard let data = readData(file), let header = try? JSONDecoder().decode(Header.self, from: data),
      header.formatVersion == Self.formatVersion else { return }
    try? FileManager.default.removeItem(at: file)
  }
  private func pruneDisk(excluding target: URL) {
    let keys: Set<URLResourceKey> = [.contentModificationDateKey, .fileSizeKey]
    let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: Array(keys))) ?? []
    let rows = files.filter { $0.pathExtension == "json" }.map { file in
      let values = try? file.resourceValues(forKeys: keys)
      return (file, values?.contentModificationDate ?? .distantPast, values?.fileSize ?? 0)
    }.sorted { $0.1 > $1.1 }
    var retainedBytes = rows.first(where: { $0.0 == target })?.2 ?? 0, retainedCount = 1
    for row in rows where row.0 != target {
      if retainedCount < Self.maximumEntries && retainedBytes + row.2 <= Self.maximumTotalBytes {
        retainedCount += 1; retainedBytes += row.2
      } else { removeKnownFile(row.0) }
    }
  }
  private static func encode<T: Encodable>(_ value: T) throws -> Data {
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(value)
  }
}
