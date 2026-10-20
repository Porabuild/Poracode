import CryptoKit
import Foundation

/// Disposable v1 snapshots. Unknown future files are preserved rather than rewritten.
actor ForgeReviewDiskCache {
  private struct Snapshot: Codable {
    let version: Int
    let scope: String
    let documents: [String: GitHubDocument]
  }
  private let directory: URL
  private let maximumBytes = 32 * 1024 * 1024

  nonisolated static let defaultDirectory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("PoracodeReview-v1")

  init(directory: URL = ForgeReviewDiskCache.defaultDirectory) {
    self.directory = directory
  }

  /// Snapshots hold private diffs and comments, so removing a host removes every snapshot.
  nonisolated static func purgeAll(directory: URL = ForgeReviewDiskCache.defaultDirectory) {
    try? FileManager.default.removeItem(at: directory)
  }

  nonisolated static func scope(_ context: GitHubControllerContext, payload: GitHubDocument) -> String? {
    guard let endpoint = context.cacheEndpoint else { return nil }
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    guard let encoded = try? encoder.encode(payload), let input = String(data: encoded, encoding: .utf8),
      let scope = try? encoder.encode([context.lease.clientConnectionId.uuidString, context.lease.desktopId, endpoint, context.lease.project.projectId, input])
    else { return nil }
    return String(data: scope, encoding: .utf8)
  }

  func read(_ scope: String) -> [ForgeReviewOperation: GitHubDocument]? {
    guard let data = readData(file(scope)),
      let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data), snapshot.version == 1,
      snapshot.scope == scope else { return nil }
    var documents: [ForgeReviewOperation: GitHubDocument] = [:]
    for (name, document) in snapshot.documents {
      guard let operation = ForgeReviewOperation(rawValue: name), operation.scope == .read,
        let response = try? JSONEncoder().encode(GitHubJSONValue.object(["result": document.value])),
        let checked = try? ForgeReviewRemoteV3Contract.result(operation, response: response)
      else { return nil }
      documents[operation] = checked
    }
    return documents
  }

  func write(_ scope: String, documents: [ForgeReviewOperation: GitHubDocument]) {
    save(scope, documents: Dictionary(uniqueKeysWithValues: documents.map { ($0.key.rawValue, $0.value) }))
  }

  func readPullRequests(_ context: GitHubControllerContext) -> GitHubOperationResult? {
    guard context.permits(.read), let scope = listScope(context), let data = readData(file(scope)),
      let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data), snapshot.version == 1,
      snapshot.scope == scope, let document = snapshot.documents["ghListPullRequests"],
      let result = try? JSONEncoder().encode(document.value)
    else { return nil }
    return try? GitHubOperationsRemoteV3Contract.result(for: .ghListPullRequests, response: result)
  }

  func writePullRequests(_ context: GitHubControllerContext, result: GitHubOperationResult) {
    guard result.procedure == .ghListPullRequests, let document = result.document,
      let scope = listScope(context) else { return }
    save(scope, documents: ["ghListPullRequests": document])
  }

  private func listScope(_ context: GitHubControllerContext) -> String? {
    let request = GitHubOperationRequest.ghListPullRequests(.init(projectLocation: context.lease.location))
    guard let data = try? GitHubOperationsRemoteV3Contract.request(request),
      let value = try? JSONDecoder().decode(GitHubJSONValue.self, from: data) else { return nil }
    return Self.scope(context, payload: GitHubDocument(value: value))
  }

  private func save(_ scope: String, documents: [String: GitHubDocument]) {
    let target = file(scope)
    if FileManager.default.fileExists(atPath: target.path) {
      guard let existing = readData(target),
        let header = try? JSONSerialization.jsonObject(with: existing) as? [String: Any],
        header["version"] as? Int == 1 else { return }
    }
    let snapshot = Snapshot(version: 1, scope: scope, documents: documents)
    guard let data = try? JSONEncoder().encode(snapshot), data.count <= maximumBytes else { return }
    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      try data.write(to: target, options: .atomic)
      try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: target.path)
      prune(excluding: target)
    } catch { /* A disposable cache must not turn a successful read into a failure. */ }
  }

  private func file(_ scope: String) -> URL {
    let hash = SHA256.hash(data: Data(scope.utf8)).map { String(format: "%02x", $0) }.joined()
    return directory.appendingPathComponent(hash + ".json")
  }

  private func readData(_ url: URL) -> Data? {
    guard let size = try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber,
      size.intValue <= maximumBytes else { return nil }
    return try? Data(contentsOf: url)
  }

  private func prune(excluding target: URL) {
    let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey]))?.filter { $0.pathExtension == "json" } ?? []
    var excess = files.count - 32
    guard excess > 0 else { return }
    for file in files.sorted(by: {
      let left = (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
      let right = (try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
      return left < right
    }) where file != target {
      guard excess > 0 else { return }
      guard let data = readData(file), let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data), snapshot.version == 1 else { continue }
      if (try? FileManager.default.removeItem(at: file)) != nil { excess -= 1 }
    }
  }
}
